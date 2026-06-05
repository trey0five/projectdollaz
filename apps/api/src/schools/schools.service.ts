import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { School, User } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'
import { MailerService } from '../auth/mailer.service.js'
import { toUserPublic } from '../auth/user-public.js'
import type { CreateSchoolDto } from './dto/create-school.dto.js'
import type { CreateInvitationDto } from './dto/create-invitation.dto.js'

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
  ) {}

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
        netAssetsBegin: dto.netAssetsBegin,
        pyNetAssetsBegin: dto.pyNetAssetsBegin,
        auditNetAssetsBegin: dto.auditNetAssetsBegin,
      },
    })
    await this.prisma.membership.create({
      data: { userId: user.id, schoolId: school.id, role: 'owner', status: 'active' },
    })
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
}
