import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { MembershipRole, School, User } from '@finrep/db'
import { gradeOrdinal } from '@finrep/analytics'
import { PrismaService } from '../prisma/prisma.service.js'
import { MailerService } from '../auth/mailer.service.js'
import { toUserPublic } from '../auth/user-public.js'
import { AuditService } from '../common/audit/audit.service.js'
import { BillingService } from '../billing/billing.service.js'
import { DocumentStorageService } from '../knowledge/document-storage.service.js'
import type { CreateSchoolDto } from './dto/create-school.dto.js'
import type { CreateInvitationDto } from './dto/create-invitation.dto.js'
import type { UpdateSchoolDto } from './dto/update-school.dto.js'

const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7 // 7 days

interface SchoolPublic {
  id: string
  name: string
  netAssetsBegin: number
  pyNetAssetsBegin: number
  auditNetAssetsBegin: number
  logoBase64: string | null
  brandColor: string | null
  defaultCommittee: string | null
  // School Comparison — peer-benchmarking profile (all nullable, additive).
  county: string | null
  district: string | null
  schoolType: string | null
  gradeLow: string | null
  gradeHigh: string | null
  role: string
  created_at: string
}

/** Read a School's profile fields defensively (compiles before the client regen). */
function schoolProfileFields(school: School): {
  county: string | null
  district: string | null
  schoolType: string | null
  gradeLow: string | null
  gradeHigh: string | null
} {
  const s = school as School & {
    county?: string | null
    district?: string | null
    schoolType?: string | null
    gradeLow?: string | null
    gradeHigh?: string | null
  }
  return {
    county: s.county ?? null,
    district: s.district ?? null,
    schoolType: s.schoolType ?? null,
    gradeLow: s.gradeLow ?? null,
    gradeHigh: s.gradeHigh ?? null,
  }
}

/** Max decoded logo bytes (5MB). The DTO @MaxLength is a coarse pre-gate; this
 * is the authoritative guard on the actual image payload. */
const MAX_LOGO_BYTES = 5 * 1024 * 1024
const LOGO_DATA_URL = /^data:image\/(png|jpeg|jpg|svg\+xml);base64,([A-Za-z0-9+/=]+)$/

@Injectable()
export class SchoolsService {
  private readonly logger = new Logger(SchoolsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
    private readonly billing: BillingService,
    private readonly storage: DocumentStorageService,
  ) {}

  /**
   * Right-to-deletion: permanently erase a school and ALL its tenant data. The DB
   * cascade (school_id FKs) removes every domain row; we ALSO purge the school's
   * S3 documents (the cascade never touches the object store). Owner-only (the
   * RolesGuard enforces it) and gated on a typed name confirmation. Irreversible.
   */
  async deleteSchool(
    user: User,
    schoolId: string,
    confirmName: string,
  ): Promise<{ deleted: true; s3ObjectsDeleted: number }> {
    const school = await this.prisma.school.findUnique({ where: { id: schoolId } })
    if (!school) throw new NotFoundException('School not found.')
    if ((confirmName ?? '').trim() !== school.name.trim()) {
      throw new BadRequestException('The confirmation name does not match the school name.')
    }
    const organizationId = school.organizationId

    // ATOMIC + DURABLE: in ONE transaction (all-or-nothing) —
    //  1. erase the tenant's own AuditLog rows. Their metadata holds PII (e.g. a
    //     document fileName), so a COMPLETE right-to-deletion must remove them
    //     rather than leave them SetNull-orphaned. (If your legal basis instead
    //     requires retaining the audit trail, replace this with a PII scrub.)
    //  2. delete the school → cascades every school_id-scoped domain table.
    //  3. write the org-level `school.deleted` record. It carries NO student PII
    //     (just the school name) and is DURABLE — not best-effort — so an
    //     irreversible deletion can never go unaudited.
    await this.prisma.$transaction([
      this.prisma.auditLog.deleteMany({ where: { schoolId } }),
      this.prisma.school.delete({ where: { id: schoolId } }),
      this.prisma.auditLog.create({
        data: {
          organizationId,
          userId: user.id,
          action: 'school.deleted',
          targetType: 'school',
          targetId: schoolId,
          metadata: { schoolName: school.name },
        },
      }),
    ])

    // POST-COMMIT: the DB erasure is now the committed point of no return, so a
    // failure here leaves orphaned S3 objects (logged) rather than a corrupt
    // half-erased tenant. Best-effort.
    let s3ObjectsDeleted = 0
    try {
      s3ObjectsDeleted = await this.storage.deleteByPrefix(this.storage.schoolPrefix(schoolId))
    } catch (err) {
      this.logger.warn(
        `S3 cleanup for deleted school ${schoolId} failed — orphaned objects remain: ${String(err)}`,
      )
    }
    return { deleted: true, s3ObjectsDeleted }
  }

  /** Count of ACTIVE owners on a school (for last-owner protection). */
  private async activeOwnerCount(schoolId: string): Promise<number> {
    return this.prisma.membership.count({
      where: { schoolId, role: 'owner', status: 'active' },
    })
  }

  /** IDs of every school in an org (basis for org-wide membership fan-out). */
  private async orgSchoolIds(organizationId: string): Promise<string[]> {
    const schools = await this.prisma.school.findMany({
      where: { organizationId },
      select: { id: true },
    })
    return schools.map((s) => s.id)
  }

  private toSchoolPublic(school: School, role: string): SchoolPublic {
    return {
      id: school.id,
      name: school.name,
      // Decimal -> number at the API boundary (engine SchoolConfig uses number).
      netAssetsBegin: Number(school.netAssetsBegin),
      pyNetAssetsBegin: Number(school.pyNetAssetsBegin),
      auditNetAssetsBegin: Number(school.auditNetAssetsBegin),
      logoBase64: school.logoBase64 ?? null,
      brandColor: school.brandColor ?? null,
      defaultCommittee: school.defaultCommittee ?? null,
      ...schoolProfileFields(school),
      role,
      created_at: school.createdAt.toISOString(),
    }
  }

  /**
   * Authoritative logo guard. The DTO already validated the data-URL prefix +
   * coarse length; here we decode the base64 payload and reject when the actual
   * bytes exceed 5MB. Throws a friendly 400 the wizard surfaces verbatim.
   */
  private assertLogoWithinLimit(dataUrl: string): void {
    const m = LOGO_DATA_URL.exec(dataUrl)
    if (!m) {
      throw new BadRequestException('Logo must be a PNG/JPG/SVG under 5 MB.')
    }
    // Decoded byte length without materializing the buffer twice.
    const b64 = m[2]
    const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
    const bytes = Math.floor((b64.length * 3) / 4) - padding
    if (bytes > MAX_LOGO_BYTES) {
      throw new BadRequestException('Logo must be a PNG/JPG/SVG under 5 MB.')
    }
  }

  async createSchool(user: User, dto: CreateSchoolDto): Promise<SchoolPublic> {
    // Reuse the caller's organization if they own one; otherwise create one.
    const existing = await this.prisma.membership.findFirst({
      where: { userId: user.id, role: 'owner', status: 'active' },
      include: { school: true },
    })
    // Owner-gate: a member who already belongs to school(s) but owns none of them
    // (e.g. an org-wide accountant/viewer) must not create schools / spin up a
    // stray org. A brand-new user (0 active memberships) is still allowed to
    // onboard and becomes the owner of their first school.
    if (!existing) {
      const activeMemberships = await this.prisma.membership.count({
        where: { userId: user.id, status: 'active' },
      })
      if (activeMemberships > 0) {
        throw new ForbiddenException('Only an owner can create a school.')
      }
    }
    const orgId =
      existing?.school.organizationId ??
      (await this.prisma.organization.create({ data: { name: `${dto.name} Org` } })).id

    const school = await this.prisma.school.create({
      data: {
        organizationId: orgId,
        name: dto.name,
        // Opening balances are derived from the uploaded trial balances; default
        // to 0 at creation when the client doesn't supply them.
        netAssetsBegin: dto.netAssetsBegin ?? 0,
        pyNetAssetsBegin: dto.pyNetAssetsBegin ?? 0,
        auditNetAssetsBegin: dto.auditNetAssetsBegin ?? 0,
      },
    })
    await this.prisma.membership.create({
      data: { userId: user.id, schoolId: school.id, role: 'owner', status: 'active' },
    })
    // Establish a LOCAL trial so a new school can use the product before paying.
    // Best-effort; the lazy path in billing reads is the safety net.
    await this.billing.establishTrial(school.id)
    return this.toSchoolPublic(school, 'owner')
  }

  async listSchools(user: User): Promise<SchoolPublic[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { userId: user.id, status: 'active' },
      include: { school: true },
      orderBy: { createdAt: 'asc' },
    })
    return memberships.map((m) => this.toSchoolPublic(m.school, m.role))
  }

  async listMembers(schoolId: string) {
    const school = await this.prisma.school.findUnique({ where: { id: schoolId } })
    if (!school) throw new NotFoundException('School not found.')

    const members = await this.prisma.membership.findMany({
      where: { schoolId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    })

    // Org-wide = the member has an ACTIVE membership on EVERY school in this
    // school's org. Only meaningful for multi-school orgs (a single-school org
    // is always "this school", never org-wide).
    const orgSchoolIds = await this.orgSchoolIds(school.organizationId)
    const orgSchoolCount = orgSchoolIds.length
    const memberCounts =
      orgSchoolCount > 1 && members.length > 0
        ? await this.prisma.membership.groupBy({
            by: ['userId'],
            where: {
              userId: { in: members.map((m) => m.userId) },
              schoolId: { in: orgSchoolIds },
              status: 'active',
            },
            _count: { schoolId: true },
          })
        : []
    const activeOrgSchoolsByUser = new Map(
      memberCounts.map((c) => [c.userId, c._count.schoolId]),
    )

    return members.map((m) => ({
      ...toUserPublic(m.user),
      role: m.role,
      status: m.status,
      orgWide:
        orgSchoolCount > 1 && activeOrgSchoolsByUser.get(m.userId) === orgSchoolCount,
    }))
  }

  async createInvitation(schoolId: string, dto: CreateInvitationDto) {
    const school = await this.prisma.school.findUnique({ where: { id: schoolId } })
    if (!school) throw new NotFoundException('School not found.')

    // If the target is already a member, reject.
    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (existingUser) {
      const existingMembership = await this.prisma.membership.findUnique({
        where: { userId_schoolId: { userId: existingUser.id, schoolId } },
      })
      if (existingMembership) {
        throw new BadRequestException('That user is already a member of this school.')
      }
    }

    const token = randomBytes(32).toString('hex')
    const invitation = await this.prisma.invitation.create({
      data: {
        schoolId,
        email: dto.email,
        role: dto.role,
        orgWide: dto.orgWide ?? false,
        token,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    })
    await this.mailer.sendInvitationEmail(dto.email, token, school.name, dto.role)
    return {
      message: 'Invitation sent.',
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expires_at: invitation.expiresAt.toISOString(),
      },
    }
  }

  async acceptInvitation(user: User, token: string) {
    const invitation = await this.prisma.invitation.findUnique({ where: { token } })
    if (!invitation || invitation.acceptedAt || invitation.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Invalid or expired invitation.')
    }
    const a = Buffer.from(token)
    const b = Buffer.from(invitation.token)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new BadRequestException('Invalid or expired invitation.')
    }
    // The invite is bound to the email it was sent to.
    if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new ForbiddenException('This invitation was issued to a different email.')
    }

    const membership = await this.prisma.membership.upsert({
      where: { userId_schoolId: { userId: user.id, schoolId: invitation.schoolId } },
      update: { role: invitation.role, status: 'active' },
      create: {
        userId: user.id,
        schoolId: invitation.schoolId,
        role: invitation.role,
        status: 'active',
      },
    })

    // Org-wide invite: fan the membership out to every OTHER school in the
    // inviting school's org so the member sees all schools + the consolidated
    // org view. Never downgrade an owner (skip schools where they own already).
    if (invitation.orgWide) {
      const school = await this.prisma.school.findUnique({
        where: { id: invitation.schoolId },
        select: { organizationId: true },
      })
      if (school) {
        const orgSchoolIds = await this.orgSchoolIds(school.organizationId)
        const others = orgSchoolIds.filter((id) => id !== invitation.schoolId)
        const ownerElsewhere = await this.prisma.membership.findMany({
          where: {
            userId: user.id,
            schoolId: { in: others },
            role: 'owner',
            status: 'active',
          },
          select: { schoolId: true },
        })
        const ownerSet = new Set(ownerElsewhere.map((m) => m.schoolId))
        for (const sid of others) {
          if (ownerSet.has(sid)) continue // never downgrade an owner
          await this.prisma.membership.upsert({
            where: { userId_schoolId: { userId: user.id, schoolId: sid } },
            update: { role: invitation.role, status: 'active' },
            create: {
              userId: user.id,
              schoolId: sid,
              role: invitation.role,
              status: 'active',
            },
          })
        }
      }
    }

    await this.prisma.invitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    })
    return {
      message: 'Invitation accepted.',
      school_id: membership.schoolId,
      role: membership.role,
    }
  }

  // ── Member management (OWNER only at the controller) ───────────────────────

  /** Change a member's role. Blocks demoting the LAST remaining owner. */
  async changeMemberRole(
    actor: User,
    schoolId: string,
    targetUserId: string,
    role: MembershipRole,
  ) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_schoolId: { userId: targetUserId, schoolId } },
      include: { user: true },
    })
    if (!membership) throw new NotFoundException('Member not found in this school.')

    // Only the sole ACTIVE owner is protected; demoting an invited/inactive
    // owner never reduces the active-owner count and is always allowed.
    if (membership.role === 'owner' && membership.status === 'active' && role !== 'owner') {
      if ((await this.activeOwnerCount(schoolId)) <= 1) {
        throw new ConflictException({
          code: 'LAST_OWNER',
          message: 'A school must keep at least one owner.',
        })
      }
    }

    if (membership.role === role) {
      return { ...toUserPublic(membership.user), role: membership.role, status: membership.status }
    }

    const updated = await this.prisma.membership.update({
      where: { id: membership.id },
      data: { role },
      include: { user: true },
    })
    await this.audit.write({
      schoolId,
      userId: actor.id,
      action: 'member.role_changed',
      targetType: 'membership',
      targetId: membership.id,
      metadata: { targetUserId, from: membership.role, to: role },
    })
    return { ...toUserPublic(updated.user), role: updated.role, status: updated.status }
  }

  /**
   * Toggle a member between org-wide access (a membership on every school in the
   * org, at their role) and single-school access (this school only). Owner-only
   * at the controller. All mutations stay within the target school's org.
   */
  async changeMemberAccess(
    actor: User,
    schoolId: string,
    targetUserId: string,
    orgWide: boolean,
  ) {
    // Anchor on the target's membership for THIS school: gives us their role and,
    // via the school, the org whose schools we may touch. 404 if not a member.
    const membership = await this.prisma.membership.findUnique({
      where: { userId_schoolId: { userId: targetUserId, schoolId } },
      include: { user: true, school: { select: { organizationId: true } } },
    })
    if (!membership) throw new NotFoundException('Member not found in this school.')

    const organizationId = membership.school.organizationId
    const orgSchoolIds = await this.orgSchoolIds(organizationId)
    const others = orgSchoolIds.filter((id) => id !== schoolId)

    if (orgWide) {
      // Grant: upsert an active membership at the target's role on every other
      // org school. Never downgrade a school they already own.
      const ownerElsewhere = await this.prisma.membership.findMany({
        where: {
          userId: targetUserId,
          schoolId: { in: others },
          role: 'owner',
          status: 'active',
        },
        select: { schoolId: true },
      })
      const ownerSet = new Set(ownerElsewhere.map((m) => m.schoolId))
      for (const sid of others) {
        if (ownerSet.has(sid)) continue
        await this.prisma.membership.upsert({
          where: { userId_schoolId: { userId: targetUserId, schoolId: sid } },
          update: { role: membership.role, status: 'active' },
          create: {
            userId: targetUserId,
            schoolId: sid,
            role: membership.role,
            status: 'active',
          },
        })
      }
    } else {
      // Restrict: drop the target's memberships on every org school EXCEPT this
      // one — but NEVER delete an owner membership (would orphan a school owner).
      await this.prisma.membership.deleteMany({
        where: {
          userId: targetUserId,
          schoolId: { in: others },
          role: { not: 'owner' },
        },
      })
    }

    await this.audit.write({
      organizationId,
      schoolId,
      userId: actor.id,
      action: 'member.access_changed',
      targetType: 'membership',
      targetId: membership.id,
      metadata: { targetUserId, orgWide, orgId: organizationId },
    })
    return { ...toUserPublic(membership.user), role: membership.role, status: membership.status }
  }

  /** Remove a member. Blocks removing the LAST remaining owner. */
  async removeMember(actor: User, schoolId: string, targetUserId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_schoolId: { userId: targetUserId, schoolId } },
    })
    if (!membership) throw new NotFoundException('Member not found in this school.')

    if (
      membership.role === 'owner' &&
      membership.status === 'active' &&
      (await this.activeOwnerCount(schoolId)) <= 1
    ) {
      throw new ConflictException({
        code: 'LAST_OWNER',
        message: 'A school must keep at least one owner.',
      })
    }

    await this.prisma.membership.delete({ where: { id: membership.id } })
    await this.audit.write({
      schoolId,
      userId: actor.id,
      action: 'member.removed',
      targetType: 'membership',
      targetId: membership.id,
      metadata: { targetUserId, role: membership.role },
    })
    return { message: 'Member removed.' }
  }

  // ── Pending invitations ────────────────────────────────────────────────────

  /** List PENDING (unaccepted, unexpired) invitations. Never returns tokens. */
  async listPendingInvitations(schoolId: string) {
    const invites = await this.prisma.invitation.findMany({
      where: { schoolId, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    })
    return invites.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      expires_at: i.expiresAt.toISOString(),
      created_at: i.createdAt.toISOString(),
    }))
  }

  /** Revoke a pending invitation (OWNER only). Validates tenant ownership. */
  async revokeInvitation(actor: User, schoolId: string, invitationId: string) {
    const invitation = await this.prisma.invitation.findUnique({ where: { id: invitationId } })
    if (!invitation || invitation.schoolId !== schoolId) {
      throw new NotFoundException('Invitation not found.')
    }
    if (invitation.acceptedAt) {
      throw new BadRequestException('That invitation has already been accepted.')
    }
    await this.prisma.invitation.delete({ where: { id: invitation.id } })
    await this.audit.write({
      schoolId,
      userId: actor.id,
      action: 'invitation.revoked',
      targetType: 'invitation',
      targetId: invitation.id,
      metadata: { email: invitation.email, role: invitation.role },
    })
    return { message: 'Invitation revoked.' }
  }

  // ── School settings (OWNER only) ───────────────────────────────────────────

  async updateSchool(
    actor: User,
    schoolId: string,
    dto: UpdateSchoolDto,
    callerRole: string,
  ): Promise<SchoolPublic> {
    const data: {
      name?: string
      netAssetsBegin?: number
      pyNetAssetsBegin?: number
      auditNetAssetsBegin?: number
      logoBase64?: string | null
      brandColor?: string | null
      defaultCommittee?: string | null
      county?: string | null
      district?: string | null
      schoolType?: string | null
      gradeLow?: string | null
      gradeHigh?: string | null
    } = {}
    if (dto.name !== undefined) data.name = dto.name
    if (dto.netAssetsBegin !== undefined) data.netAssetsBegin = dto.netAssetsBegin
    if (dto.pyNetAssetsBegin !== undefined) data.pyNetAssetsBegin = dto.pyNetAssetsBegin
    if (dto.auditNetAssetsBegin !== undefined) data.auditNetAssetsBegin = dto.auditNetAssetsBegin
    // Branding: null clears; a non-null logo is hard-guarded on decoded byte size.
    if (dto.logoBase64 !== undefined) {
      if (dto.logoBase64 !== null) this.assertLogoWithinLimit(dto.logoBase64)
      data.logoBase64 = dto.logoBase64
    }
    if (dto.brandColor !== undefined) data.brandColor = dto.brandColor
    if (dto.defaultCommittee !== undefined) data.defaultCommittee = dto.defaultCommittee
    // School Comparison profile fields (each null clears).
    if (dto.county !== undefined) data.county = dto.county
    if (dto.district !== undefined) data.district = dto.district
    if (dto.schoolType !== undefined) data.schoolType = dto.schoolType
    if (dto.gradeLow !== undefined) data.gradeLow = dto.gradeLow
    if (dto.gradeHigh !== undefined) data.gradeHigh = dto.gradeHigh

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update.')
    }

    const existing = await this.prisma.school.findUnique({ where: { id: schoolId } })
    if (!existing) throw new NotFoundException('School not found.')

    // Grade-order guard on the RESULTING row (DTO field wins, else the stored value):
    // a non-null low/high pair must satisfy gradeLow <= gradeHigh.
    const existingProfile = schoolProfileFields(existing)
    const effLow = dto.gradeLow !== undefined ? dto.gradeLow : existingProfile.gradeLow
    const effHigh = dto.gradeHigh !== undefined ? dto.gradeHigh : existingProfile.gradeHigh
    if (effLow != null && effHigh != null && gradeOrdinal(effLow) > gradeOrdinal(effHigh)) {
      throw new BadRequestException('Grade low must be at or below grade high.')
    }

    const updated = await this.prisma.school.update({ where: { id: schoolId }, data })
    await this.audit.write({
      organizationId: updated.organizationId,
      schoolId,
      userId: actor.id,
      action: 'school.updated',
      targetType: 'school',
      targetId: schoolId,
      metadata: { fields: Object.keys(data) },
    })
    return this.toSchoolPublic(updated, callerRole)
  }
}
