import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import type { School, User } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import { DocumentStorageService } from '../knowledge/document-storage.service.js'

interface SchoolInOrg {
  id: string
  name: string
  netAssetsBegin: number
  pyNetAssetsBegin: number
  auditNetAssetsBegin: number
  // School Comparison — peer-benchmarking profile (all nullable, additive).
  county: string | null
  district: string | null
  schoolType: string | null
  gradeLow: string | null
  gradeHigh: string | null
  role: string
  created_at: string
}

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: DocumentStorageService,
  ) {}

  private toSchoolInOrg(school: School, role: string): SchoolInOrg {
    // Read the additive profile fields defensively so this compiles before the
    // Prisma client is regenerated for the new columns.
    const s = school as School & {
      county?: string | null
      district?: string | null
      schoolType?: string | null
      gradeLow?: string | null
      gradeHigh?: string | null
    }
    return {
      id: school.id,
      name: school.name,
      netAssetsBegin: Number(school.netAssetsBegin),
      pyNetAssetsBegin: Number(school.pyNetAssetsBegin),
      auditNetAssetsBegin: Number(school.auditNetAssetsBegin),
      county: s.county ?? null,
      district: s.district ?? null,
      schoolType: s.schoolType ?? null,
      gradeLow: s.gradeLow ?? null,
      gradeHigh: s.gradeHigh ?? null,
      role,
      created_at: school.createdAt.toISOString(),
    }
  }

  /**
   * The caller's organization (singular: derived from their FIRST active
   * membership) + the schools in that org the caller can see, each with the
   * caller's role. `can_edit` is true if the caller owns >=1 school in the org.
   */
  async myOrganization(user: User) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId: user.id, status: 'active' },
      include: { school: true },
      orderBy: { createdAt: 'asc' },
    })
    if (memberships.length === 0) {
      throw new NotFoundException('You do not belong to an organization yet.')
    }

    const orgId = memberships[0].school.organizationId
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } })
    if (!org) throw new NotFoundException('Organization not found.')

    const inOrg = memberships.filter((m) => m.school.organizationId === orgId)
    const canEdit = inOrg.some((m) => m.role === 'owner')

    return {
      id: org.id,
      name: org.name,
      can_edit: canEdit,
      schools: inOrg.map((m) => this.toSchoolInOrg(m.school, m.role)),
    }
  }

  /**
   * Rename an organization. Org-scoped owner check (since RolesGuard can't
   * resolve a schoolId for this route): the caller must own >=1 active school
   * in the org, else 403.
   */
  async renameOrganization(actor: User, orgId: string, name: string) {
    const ownerMembership = await this.prisma.membership.findFirst({
      where: {
        userId: actor.id,
        role: 'owner',
        status: 'active',
        school: { organizationId: orgId },
      },
    })
    if (!ownerMembership) {
      throw new ForbiddenException('You must be an owner in this organization.')
    }

    const org = await this.prisma.organization.findUnique({ where: { id: orgId } })
    if (!org) throw new NotFoundException('Organization not found.')

    const updated = await this.prisma.organization.update({
      where: { id: orgId },
      data: { name },
    })
    await this.audit.write({
      organizationId: orgId,
      userId: actor.id,
      action: 'organization.renamed',
      targetType: 'organization',
      targetId: orgId,
      metadata: { from: org.name, to: name },
    })
    return { id: updated.id, name: updated.name }
  }

  /**
   * Right-to-deletion at the ORG level: permanently erase an organization and
   * EVERY school + all their data. Stronger authz than rename — the caller must
   * be an active `owner` of EVERY school in the org (you can only nuke an org you
   * fully own), plus a typed name confirmation. Irreversible.
   */
  async deleteOrganization(
    actor: User,
    orgId: string,
    confirmName: string,
  ): Promise<{ deleted: true; schoolsDeleted: number; s3ObjectsDeleted: number }> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true },
    })
    if (!org) throw new NotFoundException('Organization not found.')
    if ((confirmName ?? '').trim() !== org.name.trim()) {
      throw new BadRequestException('The confirmation name does not match the organization name.')
    }

    // SERIALIZABLE + read-inside-tx so authorization is verified against the SAME
    // school set that gets deleted — a school added mid-flight can't slip past the
    // ownership check (the tx would conflict + abort). schoolIds is captured for
    // the post-commit S3 purge.
    let schoolIds: string[] = []
    try {
      await this.prisma.$transaction(
        async (tx) => {
          const schools = await tx.school.findMany({
            where: { organizationId: orgId },
            select: { id: true },
          })
          schoolIds = schools.map((s) => s.id)

          // Authz: caller must own at least one school AND own EVERY school. The
          // length check closes the empty-org case (`[].every()` is vacuously true),
          // so a non-member can't delete an ownerless org shell.
          const ownerMemberships = await tx.membership.findMany({
            where: {
              userId: actor.id,
              role: 'owner',
              status: 'active',
              schoolId: { in: schoolIds },
            },
            select: { schoolId: true },
          })
          const owned = new Set(ownerMemberships.map((m) => m.schoolId))
          if (ownerMemberships.length === 0 || !schoolIds.every((id) => owned.has(id))) {
            throw new ForbiddenException(
              'You must be an owner of every school in this organization to delete it.',
            )
          }

          // Erase all school- AND org-scoped audit rows (their metadata holds PII),
          // delete the org → cascades every school + domain table, record the delete.
          await tx.auditLog.deleteMany({ where: { schoolId: { in: schoolIds } } })
          await tx.auditLog.deleteMany({ where: { organizationId: orgId } })
          await tx.organization.delete({ where: { id: orgId } })
          await tx.auditLog.create({
            data: {
              userId: actor.id,
              action: 'organization.deleted',
              targetType: 'organization',
              targetId: orgId,
              metadata: { orgName: org.name, schoolCount: schoolIds.length },
            },
          })
        },
        { isolationLevel: 'Serializable' },
      )
    } catch (e) {
      if (e instanceof ForbiddenException) throw e
      if ((e as { code?: string }).code === 'P2034') {
        throw new ConflictException('Please try again.')
      }
      throw e
    }

    // Post-commit S3 purge for each (now-deleted) school — best-effort.
    let s3ObjectsDeleted = 0
    for (const schoolId of schoolIds) {
      try {
        s3ObjectsDeleted += await this.storage.deleteByPrefix(this.storage.schoolPrefix(schoolId))
      } catch (err) {
        this.logger.warn(
          `S3 cleanup for deleted school ${schoolId} (org ${orgId}) failed — orphaned objects remain: ${String(err)}`,
        )
      }
    }
    return { deleted: true, schoolsDeleted: schoolIds.length, s3ObjectsDeleted }
  }
}
