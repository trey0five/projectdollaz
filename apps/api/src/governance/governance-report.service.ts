import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import { PoliciesService } from './policies.service.js'

/** Board-term status — computed, never stored. */
export type TermStatus = 'active' | 'expiring_90d' | 'expired' | 'no_term'

export interface GovernanceReport {
  generatedAt: string
  school: { id: string; name: string }
  boardRoster: {
    id: string
    name: string
    title: string | null
    termStart: string | null
    termEnd: string | null
    termStatus: TermStatus
    bio: string | null
    active: boolean
  }[]
  committees: {
    id: string
    name: string
    kind: string
    chairName: string | null
    chairSource: 'membership' | 'legacy' | null
    memberCount: number
    members: { personId: string; name: string; title: string | null; role: string }[]
  }[]
  financeTeam: {
    people: {
      id: string
      name: string
      title: string | null
      bio: string | null
      hasCredentials: boolean
      documents: { id: string; title: string; tags: string[]; createdAt: string }[]
    }[]
    coverage: { withDocs: number; total: number }
  }
  policySummary: {
    total: number
    active: number
    pastReview: number
    lastAdoptedDate: string | null
  }
  minutesDiscipline: {
    meetingsHeld: number
    approvedMinutes: number
    pendingApproval: number
    lastApprovedAt: string | null
  }
}

const ROLE_ORDER: Record<string, number> = { chair: 0, vice_chair: 1, secretary: 2, member: 3 }
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000

/**
 * Governance Phase 2 — the ACCREDITATION-READY governance report composer.
 * COMPUTE-ONLY (live Prisma reads, no new tables, injectable `now`): board roster
 * with term math, committees with the read-side chair rule (chair-role membership
 * wins; the legacy Committee.chair free-text string is a LABELED fallback, never
 * written here), finance-team credential coverage (knowledge documents linked
 * sourceType 'governance_person'), the policy summary (reusing PoliciesService's
 * review math — one source of truth), and minutes discipline. Zero-data schools
 * return empty arrays / zero counts — never a 500. Injected by the report route
 * AND Penny's read-only get_governance_status tool.
 */
@Injectable()
export class GovernanceReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: PoliciesService,
  ) {}

  /**
   * Term status vs `now`: no_term → expired → expiring_90d → active. Compared on
   * UTC yyyy-mm-dd DAY strings (termEnd is stored at UTC midnight) so a term
   * ending TODAY is still 'expiring_90d', not 'expired' — the EXACT rule the web
   * client mirrors in peopleMeta.js::termStatusOf (keep the two in sync).
   */
  private termStatus(termEnd: Date | null, now: Date): TermStatus {
    if (!termEnd) return 'no_term'
    const endDay = termEnd.toISOString().slice(0, 10)
    const today = now.toISOString().slice(0, 10)
    if (endDay < today) return 'expired'
    const horizonDay = new Date(now.getTime() + NINETY_DAYS_MS).toISOString().slice(0, 10)
    if (endDay <= horizonDay) return 'expiring_90d'
    return 'active'
  }

  async report(schoolId: string, now = new Date()): Promise<GovernanceReport> {
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true },
    })
    if (!school) throw new NotFoundException('School not found.')

    const [people, committees, meetings, policyList] = await Promise.all([
      this.prisma.governancePerson.findMany({ where: { schoolId } }),
      this.prisma.committee.findMany({
        where: { schoolId },
        include: {
          memberships: {
            include: { person: { select: { id: true, name: true, title: true } } },
          },
        },
      }),
      this.prisma.meeting.findMany({
        where: { schoolId },
        select: { minutesStatus: true, minutesApprovedAt: true },
      }),
      this.policies.list(schoolId, now),
    ])

    // ── Board roster (board ∈ groups), active first then name ──────────────────
    const boardRoster = people
      .filter((p) => (p.groups ?? []).includes('board'))
      .map((p) => ({
        id: p.id,
        name: p.name,
        title: p.title,
        termStart: p.termStart ? p.termStart.toISOString() : null,
        termEnd: p.termEnd ? p.termEnd.toISOString() : null,
        termStatus: this.termStatus(p.termEnd, now),
        bio: p.bio,
        active: p.active,
      }))
      .sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1
        const n = a.name.localeCompare(b.name)
        return n !== 0 ? n : a.id.localeCompare(b.id)
      })

    // ── Committees + the read-side chair rule ──────────────────────────────────
    const committeeBlocks = committees
      .map((c) => {
        const members = c.memberships
          .map((m) => ({
            personId: m.person.id,
            name: m.person.name,
            title: m.person.title,
            role: m.role,
          }))
          .sort((a, b) => {
            const r = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)
            if (r !== 0) return r
            const n = a.name.localeCompare(b.name)
            return n !== 0 ? n : a.personId.localeCompare(b.personId)
          })
        // Effective chair: chair-role membership wins; legacy free-text string is a
        // labeled fallback; else none.
        const chairMember = members.find((m) => m.role === 'chair') ?? null
        const chairName = chairMember ? chairMember.name : (c.chair ?? null)
        const chairSource: 'membership' | 'legacy' | null = chairMember
          ? 'membership'
          : c.chair
            ? 'legacy'
            : null
        return {
          id: c.id,
          name: c.name,
          kind: c.kind,
          chairName,
          chairSource,
          memberCount: members.length,
          members,
          active: c.active,
        }
      })
      .sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1
        const n = a.name.localeCompare(b.name)
        return n !== 0 ? n : a.id.localeCompare(b.id)
      })
      .map(({ active: _active, ...rest }) => rest)

    // ── Finance team credentials (finance_team ∈ groups AND active) ────────────
    const financePeople = people
      .filter((p) => (p.groups ?? []).includes('finance_team') && p.active)
      .sort((a, b) => {
        const n = a.name.localeCompare(b.name)
        return n !== 0 ? n : a.id.localeCompare(b.id)
      })
    const financeIds = financePeople.map((p) => p.id)
    const docs = financeIds.length
      ? await this.prisma.knowledgeDocument.findMany({
          where: { schoolId, sourceType: 'governance_person', sourceRef: { in: financeIds } },
          select: { id: true, title: true, tags: true, createdAt: true, sourceRef: true },
          orderBy: { createdAt: 'desc' },
        })
      : []
    const docsByPerson = new Map<string, typeof docs>()
    for (const d of docs) {
      if (!d.sourceRef) continue
      const list = docsByPerson.get(d.sourceRef) ?? []
      list.push(d)
      docsByPerson.set(d.sourceRef, list)
    }
    const financeTeamPeople = financePeople.map((p) => {
      const personDocs = docsByPerson.get(p.id) ?? []
      return {
        id: p.id,
        name: p.name,
        title: p.title,
        bio: p.bio,
        hasCredentials: personDocs.length > 0,
        documents: personDocs.map((d) => ({
          id: d.id,
          title: d.title,
          tags: d.tags ?? [],
          createdAt: d.createdAt.toISOString(),
        })),
      }
    })

    // ── Policy summary (reuses PoliciesService's computed review status) ───────
    const adopted = policyList.policies
      .map((p) => p.adoptedDate)
      .filter((d): d is string => d !== null)
      .sort()
    const policySummary = {
      total: policyList.policies.length,
      active: policyList.policies.filter((p) => p.status === 'active').length,
      pastReview: policyList.policies.filter((p) => p.reviewStatus === 'overdue').length,
      lastAdoptedDate: adopted.length ? adopted[adopted.length - 1] : null,
    }

    // ── Minutes discipline ─────────────────────────────────────────────────────
    const approvedDates = meetings
      .map((m) => m.minutesApprovedAt)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime())
    const minutesDiscipline = {
      meetingsHeld: meetings.length,
      approvedMinutes: meetings.filter((m) => m.minutesStatus === 'approved').length,
      pendingApproval: meetings.filter((m) => m.minutesStatus === 'pending_approval').length,
      lastApprovedAt: approvedDates.length
        ? approvedDates[approvedDates.length - 1].toISOString()
        : null,
    }

    return {
      generatedAt: now.toISOString(),
      school: { id: school.id, name: school.name },
      boardRoster,
      committees: committeeBlocks,
      financeTeam: {
        people: financeTeamPeople,
        coverage: {
          withDocs: financeTeamPeople.filter((p) => p.hasCredentials).length,
          total: financeTeamPeople.length,
        },
      },
      policySummary,
      minutesDiscipline,
    }
  }
}
