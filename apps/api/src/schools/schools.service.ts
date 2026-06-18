import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { MembershipRole, School, User } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'
import { MailerService } from '../auth/mailer.service.js'
import { toUserPublic } from '../auth/user-public.js'
import { AuditService } from '../common/audit/audit.service.js'
import { BillingService } from '../billing/billing.service.js'
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
  role: string
  created_at: string
}

@Injectable()
export class SchoolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
    private readonly billing: BillingService,
  ) {}

  /** Count of ACTIVE owners on a school (for last-owner protection). */
  private async activeOwnerCount(schoolId: string): Promise<number> {
    return this.prisma.membership.count({
      where: { schoolId, role: 'owner', status: 'active' },
    })
  }

  private toSchoolPublic(school: School, role: string): SchoolPublic {
    return {
      id: school.id,
      name: school.name,
      // Decimal -> number at the API boundary (engine SchoolConfig uses number).
      netAssetsBegin: Number(school.netAssetsBegin),
      pyNetAssetsBegin: Number(school.pyNetAssetsBegin),
      auditNetAssetsBegin: Number(school.auditNetAssetsBegin),
      role,
      created_at: school.createdAt.toISOString(),
    }
  }

  async createSchool(user: User, dto: CreateSchoolDto): Promise<SchoolPublic> {
    // Reuse the caller's organization if they own one; otherwise create one.
    const existing = await this.prisma.membership.findFirst({
      where: { userId: user.id, role: 'owner', status: 'active' },
      include: { school: true },
    })
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
    const members = await this.prisma.membership.findMany({
      where: { schoolId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    })
    return members.map((m) => ({
      ...toUserPublic(m.user),
      role: m.role,
      status: m.status,
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
    } = {}
    if (dto.name !== undefined) data.name = dto.name
    if (dto.netAssetsBegin !== undefined) data.netAssetsBegin = dto.netAssetsBegin
    if (dto.pyNetAssetsBegin !== undefined) data.pyNetAssetsBegin = dto.pyNetAssetsBegin
    if (dto.auditNetAssetsBegin !== undefined) data.auditNetAssetsBegin = dto.auditNetAssetsBegin

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update.')
    }

    const existing = await this.prisma.school.findUnique({ where: { id: schoolId } })
    if (!existing) throw new NotFoundException('School not found.')

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
