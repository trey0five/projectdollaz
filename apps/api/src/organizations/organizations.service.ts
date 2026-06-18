import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import type { School, User } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuditService } from '../common/audit/audit.service.js'

interface SchoolInOrg {
  id: string
  name: string
  netAssetsBegin: number
  pyNetAssetsBegin: number
  auditNetAssetsBegin: number
  role: string
  created_at: string
}

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private toSchoolInOrg(school: School, role: string): SchoolInOrg {
    return {
      id: school.id,
      name: school.name,
      netAssetsBegin: Number(school.netAssetsBegin),
      pyNetAssetsBegin: Number(school.pyNetAssetsBegin),
      auditNetAssetsBegin: Number(school.auditNetAssetsBegin),
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
}
