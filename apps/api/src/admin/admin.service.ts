import { Injectable } from '@nestjs/common'
import type { ModuleKey, Prisma } from '@finrep/db'
import { CORE_MODULE, MODULE_KEYS, MODULE_META, resolveLicensedModules } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'
import type { AdminUsersQueryDto } from './dto/admin-users-query.dto.js'

const DAY_MS = 1000 * 60 * 60 * 24
const SIGNUP_WINDOW_DAYS = 30

interface ModuleView {
  key: ModuleKey
  label: string
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

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
}
