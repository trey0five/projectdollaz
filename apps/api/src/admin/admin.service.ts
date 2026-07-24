import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { ModuleKey, Prisma, User } from '@finrep/db'
import { CORE_MODULE, MODULE_KEYS, MODULE_META, resolveLicensedModules } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'
import { PasswordService } from '../auth/password.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import { computeIsSuperadmin } from '../common/admin-access.js'
import type { AdminUsersQueryDto } from './dto/admin-users-query.dto.js'
import type { CreateAdminDto } from './dto/create-admin.dto.js'
import type { SendMessageDto } from './dto/send-message.dto.js'

/** One row of the admin-management list. Never carries any secret field. */
interface AdminRow {
  id: string | null
  name: string | null
  email: string
  source: 'superadmin' | 'db' | 'env'
  revocable: boolean
  grantedAt: string | null
}

const MESSAGE_CHUNK = 1000

const DAY_MS = 1000 * 60 * 60 * 24
const SIGNUP_WINDOW_DAYS = 30

interface ModuleView {
  key: ModuleKey
  label: string
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  /** "firstName lastName" | email local-part fallback. */
  private displayName(
    firstName: string | null,
    lastName: string | null,
    email: string,
  ): string {
    const joined = [firstName, lastName].filter(Boolean).join(' ').trim()
    return joined || email.split('@')[0]
  }

  /** UTC YYYY-MM-DD bucket key for a date. */
  private dayKey(d: Date): string {
    return d.toISOString().slice(0, 10)
  }

  // ── GET /admin/stats ─────────────────────────────────────────────────────────
  async stats() {
    const [users, verifiedUsers, organizations, schools, mfaEnabledUsers] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { emailVerified: true } }),
      this.prisma.organization.count(),
      this.prisma.school.count(),
      this.prisma.user.count({ where: { totpEnabled: true } }),
    ])

    // Exactly 30 zero-filled daily buckets, chronological ascending, ending today (UTC).
    const now = new Date()
    const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    const windowStart = new Date(todayUtc - (SIGNUP_WINDOW_DAYS - 1) * DAY_MS)

    const recent = await this.prisma.user.findMany({
      where: { createdAt: { gte: windowStart } },
      select: { createdAt: true },
    })
    const counts = new Map<string, number>()
    for (const u of recent) {
      const key = this.dayKey(u.createdAt)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const signups: { date: string; count: number }[] = []
    for (let i = SIGNUP_WINDOW_DAYS - 1; i >= 0; i--) {
      const key = this.dayKey(new Date(todayUtc - i * DAY_MS))
      signups.push({ date: key, count: counts.get(key) ?? 0 })
    }

    return {
      totals: {
        users,
        verifiedUsers,
        unverifiedUsers: users - verifiedUsers,
        organizations,
        schools,
        mfaEnabledUsers,
      },
      signups,
    }
  }

  // ── GET /admin/users ──────────────────────────────────────────────────────────
  async users(query: AdminUsersQueryDto) {
    const page = query.page && query.page >= 1 ? query.page : 1
    const pageSize = query.pageSize && query.pageSize >= 1 ? Math.min(query.pageSize, 100) : 25
    const search = query.search?.trim()

    const where: Prisma.UserWhereInput = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}

    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        // SELECT ONLY contract fields — never password*, *Token, *ExpiresAt,
        // totpSecret*, reset codes, backup codes.
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          emailVerified: true,
          emailVerifiedAt: true,
          createdAt: true,
          totpEnabled: true,
          lastLoginAt: true,
          lastLoginRegion: true,
          lastLoginCity: true,
          memberships: {
            where: { status: 'active' },
            select: {
              role: true,
              status: true,
              school: {
                select: {
                  id: true,
                  name: true,
                  organization: { select: { id: true, name: true } },
                  subscription: { select: { licensedModules: true } },
                },
              },
            },
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
    ])

    const users = rows.map((u) => {
      // Dedupe organizations by id.
      const orgMap = new Map<string, { id: string; name: string }>()
      const memberships = u.memberships.map((m) => {
        if (m.school.organization) {
          orgMap.set(m.school.organization.id, {
            id: m.school.organization.id,
            name: m.school.organization.name,
          })
        }
        return {
          schoolId: m.school.id,
          schoolName: m.school.name,
          role: m.role,
          status: m.status,
        }
      })

      // Union of resolved licensed modules across active-membership schools;
      // core always included; ordered by MODULE_KEYS. NEVER re-resolved client-side.
      const keys = new Set<ModuleKey>([CORE_MODULE])
      for (const m of u.memberships) {
        for (const lm of resolveLicensedModules(m.school.subscription?.licensedModules)) {
          keys.add(lm.key)
        }
      }
      const modules: ModuleView[] = MODULE_KEYS.filter((k) => keys.has(k)).map((k) => ({
        key: k,
        label: MODULE_META[k].label,
      }))

      return {
        id: u.id,
        email: u.email,
        name: this.displayName(u.firstName, u.lastName, u.email),
        firstName: u.firstName,
        lastName: u.lastName,
        emailVerified: u.emailVerified,
        emailVerifiedAt: u.emailVerifiedAt ? u.emailVerifiedAt.toISOString() : null,
        createdAt: u.createdAt.toISOString(),
        totpEnabled: u.totpEnabled,
        lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
        lastLoginRegion: u.lastLoginRegion,
        lastLoginCity: u.lastLoginCity,
        organizations: [...orgMap.values()],
        memberships,
        modules,
      }
    })

    return { page, pageSize, total, users }
  }

  // ── GET /admin/organizations ───────────────────────────────────────────────────
  async organizations() {
    const orgs = await this.prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        createdAt: true,
        schools: {
          select: {
            id: true,
            name: true,
            memberships: {
              select: {
                role: true,
                status: true,
                user: {
                  select: { id: true, email: true, firstName: true, lastName: true },
                },
              },
            },
          },
        },
      },
    })

    const organizations = orgs.map((org) => {
      const distinctUsers = new Set<string>()
      const members: {
        userId: string
        email: string
        name: string
        schoolId: string
        schoolName: string
        role: string
        status: string
      }[] = []
      for (const school of org.schools) {
        for (const m of school.memberships) {
          distinctUsers.add(m.user.id)
          members.push({
            userId: m.user.id,
            email: m.user.email,
            name: this.displayName(m.user.firstName, m.user.lastName, m.user.email),
            schoolId: school.id,
            schoolName: school.name,
            role: m.role,
            status: m.status,
          })
        }
      }
      return {
        id: org.id,
        name: org.name,
        createdAt: org.createdAt.toISOString(),
        schoolCount: org.schools.length,
        schools: org.schools.map((s) => ({ id: s.id, name: s.name })),
        memberCount: distinctUsers.size,
        members,
      }
    })

    return { organizations }
  }

  // ── GET /admin/geo ──────────────────────────────────────────────────────────────
  async geo() {
    // One row per user (each user has one lastLoginRegion/City), so grouping by
    // (region, city) and counting rows yields DISTINCT users. US + non-null region only.
    const grouped = await this.prisma.user.groupBy({
      by: ['lastLoginRegion', 'lastLoginCity'],
      where: { lastLoginCountry: 'US', lastLoginRegion: { not: null } },
      _count: { _all: true },
      _max: { lastLoginLat: true, lastLoginLon: true },
    })

    const cities: {
      city: string
      region: string
      lat: number
      lon: number
      count: number
    }[] = []
    const stateAgg = new Map<string, { count: number; cities: { city: string; count: number }[] }>()

    for (const row of grouped) {
      const region = row.lastLoginRegion as string // not-null guaranteed by the where
      const count = row._count._all
      const agg = stateAgg.get(region) ?? { count: 0, cities: [] }
      agg.count += count
      const city = row.lastLoginCity
      const lat = row._max.lastLoginLat
      const lon = row._max.lastLoginLon
      if (city) {
        agg.cities.push({ city, count })
        if (lat != null && lon != null) {
          cities.push({ city, region, lat, lon, count })
        }
      }
      stateAgg.set(region, agg)
    }

    const states = [...stateAgg.entries()].map(([region, agg]) => ({
      region,
      count: agg.count,
      cities: agg.cities.sort((a, b) => b.count - a.count),
    }))

    const unknown = await this.prisma.user.count({
      where: { OR: [{ lastLoginRegion: null }, { lastLoginCountry: { not: 'US' } }] },
    })

    return { states, cities, unknown }
  }

  // ── Admin management (super-admin only; SuperadminGuard on the routes) ─────────

  private adminEmails(): string[] {
    return this.config.get<string[]>('admin.emails') ?? []
  }

  private superadminUsername(): string | null {
    return this.config.get<string | null>('admin.superadminUsername') ?? null
  }

  /** Classify an admin row's source + revocability. Only DB grants are revocable. */
  private classifyAdmin(
    email: string,
    isAdmin: boolean,
  ): { source: AdminRow['source']; revocable: boolean } {
    if (computeIsSuperadmin(email, this.superadminUsername())) {
      return { source: 'superadmin', revocable: false }
    }
    if (this.adminEmails().includes(email.trim().toLowerCase())) {
      return { source: 'env', revocable: false }
    }
    // Reachable only for a real DB grant (callers pass isAdmin=true here).
    return { source: 'db', revocable: isAdmin === true }
  }

  private sourceRank(source: AdminRow['source']): number {
    return source === 'superadmin' ? 0 : source === 'db' ? 1 : 2
  }

  // ── GET /admin/admins ────────────────────────────────────────────────────────
  async listAdmins(): Promise<{ admins: AdminRow[] }> {
    const adminEmails = this.adminEmails()
    // DB-flagged admins ∪ users whose email is on the env allowlist.
    const users = await this.prisma.user.findMany({
      where: { OR: [{ isAdmin: true }, { email: { in: adminEmails } }] },
      select: { id: true, email: true, firstName: true, lastName: true, createdAt: true, isAdmin: true },
    })

    const rows: AdminRow[] = []
    const seenEmails = new Set<string>()
    for (const u of users) {
      const { source, revocable } = this.classifyAdmin(u.email, u.isAdmin)
      seenEmails.add(u.email.trim().toLowerCase())
      rows.push({
        id: u.id,
        name: this.displayName(u.firstName, u.lastName, u.email),
        email: u.email,
        source,
        revocable,
        grantedAt: u.createdAt.toISOString(),
      })
    }

    // Synthetic rows for env-allowlist emails that have no account yet.
    for (const email of adminEmails) {
      if (seenEmails.has(email)) continue
      const isSuper = computeIsSuperadmin(email, this.superadminUsername())
      rows.push({
        id: null,
        name: null,
        email,
        source: isSuper ? 'superadmin' : 'env',
        revocable: false,
        grantedAt: null,
      })
    }

    rows.sort((a, b) => {
      const r = this.sourceRank(a.source) - this.sourceRank(b.source)
      return r !== 0 ? r : a.email.localeCompare(b.email)
    })
    return { admins: rows }
  }

  // ── POST /admin/admins ───────────────────────────────────────────────────────
  async createOrPromoteAdmin(
    dto: CreateAdminDto,
  ): Promise<{ admin: AdminRow; created: boolean }> {
    const email = dto.email.trim().toLowerCase()
    const existing = await this.prisma.user.findUnique({ where: { email } })

    if (existing) {
      // Promote (idempotent). Any password sent for an existing user is ignored.
      const updated =
        existing.isAdmin === true
          ? existing
          : await this.prisma.user.update({ where: { id: existing.id }, data: { isAdmin: true } })
      await this.audit.write({
        action: 'admin.granted',
        targetType: 'user',
        targetId: updated.id,
        metadata: { created: false },
      })
      return { admin: this.toAdminRow(updated), created: false }
    }

    if (!dto.password) {
      throw new UnprocessableEntityException({
        code: 'USER_NOT_FOUND',
        message: 'No account exists for that email. Provide a password to create a new admin account.',
      })
    }
    const strengthError = this.passwords.validateStrength(dto.password)
    if (strengthError) throw new BadRequestException(strengthError)

    const { algo, iters, salt, hash } = this.passwords.hash(dto.password)
    const created = await this.prisma.user.create({
      data: {
        email,
        firstName: dto.firstName ?? null,
        lastName: dto.lastName ?? null,
        passwordAlgo: algo,
        passwordIters: iters,
        passwordSalt: salt,
        passwordHash: hash,
        emailVerified: true,
        emailVerifiedAt: new Date(),
        isAdmin: true,
      },
    })
    await this.audit.write({
      action: 'admin.granted',
      targetType: 'user',
      targetId: created.id,
      metadata: { created: true },
    })
    return { admin: this.toAdminRow(created), created: true }
  }

  /** Map a full User row to an AdminRow (never leaks secret columns). */
  private toAdminRow(u: User): AdminRow {
    const { source, revocable } = this.classifyAdmin(u.email, u.isAdmin)
    return {
      id: u.id,
      name: this.displayName(u.firstName, u.lastName, u.email),
      email: u.email,
      source,
      revocable,
      grantedAt: u.createdAt.toISOString(),
    }
  }

  // ── POST /admin/users/:id/revoke-admin ────────────────────────────────────────
  async revokeAdmin(actingUser: User, id: string): Promise<{ ok: true; id: string }> {
    const target = await this.prisma.user.findUnique({ where: { id } })
    if (!target) {
      throw new NotFoundException('User not found.')
    }
    if (target.id === actingUser.id) {
      throw new ConflictException({ code: 'SELF_REVOKE', message: 'You cannot revoke your own admin access.' })
    }
    if (computeIsSuperadmin(target.email, this.superadminUsername())) {
      throw new ConflictException({ code: 'NOT_REVOCABLE', message: 'The super-admin cannot be revoked.' })
    }
    if (this.adminEmails().includes(target.email.trim().toLowerCase())) {
      throw new ConflictException({
        code: 'NOT_REVOCABLE',
        message: 'This admin is granted by the ADMIN_EMAILS allowlist and cannot be revoked here.',
      })
    }
    if (target.isAdmin !== true) {
      throw new ConflictException({ code: 'NOT_REVOCABLE', message: 'This user is not a database admin.' })
    }
    await this.prisma.user.update({ where: { id: target.id }, data: { isAdmin: false } })
    await this.audit.write({
      userId: actingUser.id,
      action: 'admin.revoked',
      targetType: 'user',
      targetId: target.id,
    })
    return { ok: true, id: target.id }
  }

  // ── POST /admin/messages ──────────────────────────────────────────────────────
  async sendMessages(dto: SendMessageDto): Promise<{ sent: number }> {
    let targetIds: string[]
    if (dto.target === 'users') {
      if (!dto.userIds || dto.userIds.length === 0) {
        throw new BadRequestException('userIds is required and must be non-empty when target is "users".')
      }
      const rows = await this.prisma.user.findMany({
        where: { id: { in: dto.userIds } },
        select: { id: true },
      })
      targetIds = rows.map((r) => r.id)
    } else {
      const rows = await this.prisma.user.findMany({ select: { id: true } })
      targetIds = rows.map((r) => r.id)
    }

    const senderLabel = dto.senderLabel?.trim() || 'KYRO Team'
    let sent = 0
    for (let i = 0; i < targetIds.length; i += MESSAGE_CHUNK) {
      const chunk = targetIds.slice(i, i + MESSAGE_CHUNK)
      const res = await this.prisma.message.createMany({
        data: chunk.map((userId) => ({
          userId,
          subject: dto.subject,
          body: dto.body,
          senderLabel,
        })),
      })
      sent += res.count
    }
    await this.audit.write({
      action: 'admin.message.sent',
      targetType: 'message',
      metadata: { target: dto.target, count: sent },
    })
    return { sent }
  }
}
