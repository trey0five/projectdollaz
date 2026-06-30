import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import type { User } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'
import type { MembershipRole } from '@finrep/db'
import { BriefingService } from './briefing.service.js'
import type { AttentionItem, BriefingSummary } from './briefing.service.js'
import { availableLensesFor, clampLens, SEV_RANK, type Lens } from './briefing-lens.js'

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 (slice 2) — the ORG-LEVEL, multi-school attention briefing. A third
// READ-ONLY advisory synthesis layer that sits between the two just-shipped
// patterns: it REUSES the statements-rollup org-resolution + per-school
// latest-snapshot-for-FY selection to discover {schoolId, periodId} pairs, then
// fans those out (in PARALLEL + RESILIENT) through the EXISTING
// BriefingService.getBriefing — recomputing nothing — and aggregates into a
// deterministically-RANKED, school-attributed cross-school attention list +
// per-school summaries + consolidated counts + a not-reported list.
//
// Reuse over duplication is the governing constraint: org membership/isolation,
// the Jul–Jun FY derivation, and the per-school item generation all come from the
// already-shipped services. The org-resolution + per-school period pick mirrors
// StatementsRollupService.getRollup EXACTLY (additive — shipped files untouched);
// the chosen snapshot's fiscalPeriodId IS the periodId getBriefing needs, and
// getBriefing re-validates it via periods.getOwnedPeriod, so the (schoolId,
// periodId) pair stays tenant-safe.
// ─────────────────────────────────────────────────────────────────────────────

/** A per-school AttentionItem, attributed to its school for the cross-org list. */
export interface OrgAttentionItem extends AttentionItem {
  schoolId: string
  schoolName: string
  /** `${schoolId}:${id}` — globally unique across schools (stable React key). */
  orgItemId: string
}

/** Per-school row: the school's own briefing summary (reported) or null. */
export interface OrgSchoolEntry {
  schoolId: string
  name: string
  /** true once the school had a snapshot for the FY (whether or not getBriefing threw). */
  reported: boolean
  /** The chosen period's label (from the briefing) when reported; else null. */
  periodLabel: string | null
  /** The school's own briefing summary, or null when not reported / getBriefing failed. */
  summary: BriefingSummary | null
  /** true only when the school reported but its getBriefing threw (logged, never silent). */
  failed?: boolean
}

export interface OrgBriefingResponse {
  orgId: string
  fiscalYearStart: string | null
  generatedAt: string
  consolidated: {
    total: number
    critical: number
    warn: number
    info: number
    /** schools that reported AND returned a briefing (failed schools excluded). */
    schoolsReporting: number
    /** total in-org schools the caller can see. */
    schoolCount: number
  }
  schools: OrgSchoolEntry[]
  /** Server-RANKED critical>warn>info, then school name, then per-school order; capped. */
  items: OrgAttentionItem[]
  /** Schools with no snapshot for the FY (NOT zero-filled into consolidated). */
  notReported: { schoolId: string; name: string }[]
  /** true when the cross-school item list was capped (long tail in per-school summaries). */
  capApplied: boolean
  /** Items omitted by the cap (0 when not capped). */
  cappedItemCount: number
  // ── ADDITIVE (Scope × Lens) — one lens shapes the WHOLE org view ──────────────
  /** The EFFECTIVE org lens (post-clamp) applied to every school in the rollup. */
  lens: Lens
  /** The caller's derived org role (widest in-org membership) = the ceiling. */
  callerRole: Lens
  /** The lenses this caller may preview (own org role + every narrower lens). */
  availableLenses: Lens[]
}

// Org role precedence — owner is the WIDEST. An org consumer who is owner at ANY
// school in the org acts as leadership for the consolidated view (the natural
// ceiling); a viewer-everywhere caller gets the board lens org-wide.
const ORG_ROLE_RANK: Record<MembershipRole, number> = { owner: 2, accountant: 1, viewer: 0 }

// Sane cap on the flat cross-school list. The CONSOLIDATED counts always reflect
// the FULL totals (summed from per-school summaries, not from items), and the
// per-school summary rows carry the long tail — so the cap is never silently
// truncating: the response reports capApplied + cappedItemCount and we log it.
const ITEM_CAP = 20

@Injectable()
export class OrgBriefingService {
  private readonly logger = new Logger(OrgBriefingService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly briefing: BriefingService,
  ) {}

  /**
   * Build the org-wide attention briefing: pick each in-org school's latest
   * snapshot for the FY, run BriefingService.getBriefing per school IN PARALLEL
   * and RESILIENT (one school failing never aborts the roll-up), and aggregate.
   */
  async getOrgBriefing(
    user: User,
    orgId: string,
    fiscalYearStart: string | null,
    lensOverride?: Lens,
  ): Promise<OrgBriefingResponse> {
    const generatedAt = new Date().toISOString()

    // ── ORG RESOLUTION + PER-SCHOOL PERIOD PICK ──────────────────────────────
    // Mirrors StatementsRollupService.getRollup steps 1-4 EXACTLY (additive — the
    // shipped service is untouched). Tenant isolation comes from the membership
    // filter; do NOT query snapshots for any school outside this in-org set.
    const memberships = await this.prisma.membership.findMany({
      where: { userId: user.id, status: 'active' },
      include: { school: true },
    })
    if (memberships.length === 0) {
      throw new NotFoundException('You do not belong to an organization yet.')
    }

    const inOrg = memberships.filter((m) => m.school.organizationId === orgId)
    if (inOrg.length === 0) {
      throw new ForbiddenException('You do not have access to this organization.')
    }

    // ── Scope × Lens: derive ONE org-level role + clamp the override ──────────
    // The caller has per-SCHOOL roles, not an org role. Take the WIDEST in-org
    // membership as the org ceiling (reuses the memberships already fetched — no
    // extra query). Clamp the requested lens to it, then apply that SAME lens to
    // every school so the consolidated view is value-consistent by construction.
    const orgRole: Lens = inOrg.reduce<MembershipRole>(
      (widest, m) => (ORG_ROLE_RANK[m.role] > ORG_ROLE_RANK[widest] ? m.role : widest),
      inOrg[0].role,
    )
    const effectiveLens = clampLens(orgRole, lensOverride)

    const org = await this.prisma.organization.findUnique({ where: { id: orgId } })
    if (!org) throw new NotFoundException('Organization not found.')

    const schoolMap = new Map<string, { id: string; name: string }>()
    for (const m of inOrg) schoolMap.set(m.school.id, { id: m.school.id, name: m.school.name })
    const schools = [...schoolMap.values()]

    // Every snapshot for those schools, newest-first, joined to its period (for FY
    // matching + the periodId that getBriefing needs).
    const snapshots = await this.prisma.statementSnapshot.findMany({
      where: { schoolId: { in: schools.map((s) => s.id) } },
      include: { fiscalPeriod: true },
      orderBy: { createdAt: 'desc' },
    })

    // Same Jul–Jun fyStartOf as StatementsRollupService, so the query param and a
    // snapshot's FY agree byte-for-byte across the two org views.
    const fyStartOf = (s: (typeof snapshots)[number]): string | null => {
      const end = s.fiscalPeriod?.periodEndDate
      if (!end) return null
      const y = end.getUTCFullYear()
      const m = end.getUTCMonth() + 1
      const startYear = m <= 6 ? y - 1 : y
      return `${startYear}-07`
    }

    const notReported: { schoolId: string; name: string }[] = []
    // The reported schools, each carrying the periodId fed to getBriefing.
    const reported: { schoolId: string; name: string; periodId: string }[] = []

    for (const s of schools) {
      const chosen = snapshots.find(
        (snap) =>
          snap.schoolId === s.id && (!fiscalYearStart || fyStartOf(snap) === fiscalYearStart),
      )
      if (!chosen) {
        notReported.push({ schoolId: s.id, name: s.name })
        continue
      }
      // chosen.fiscalPeriodId IS this school's latest-for-FY period — exact.
      reported.push({ schoolId: s.id, name: s.name, periodId: chosen.fiscalPeriodId })
    }

    // ── PARALLEL + RESILIENT FAN-OUT ─────────────────────────────────────────
    // allSettled (NOT all) so one school's 500 can never abort the org roll-up.
    // wall-clock is bounded by the SLOWEST school, not the sum. NOTE (honest):
    // each getBriefing does ~1 metrics compute + a 4-way compliance Promise.all,
    // so an organization of N schools fans out ~5N service reads — this is the heaviest
    // endpoint in the app. It is gated client-side to fire only when the tab is
    // open; a short-TTL cache / batch path is a Phase-2 follow-up if N grows large.
    // Pass effectiveLens as the per-school callerRole (no override) so getBriefing
    // uses it verbatim as the default lens — every school is shaped by the ONE org
    // lens, never each school's own per-school role. (effectiveLens is already
    // clamped to the org ceiling, so getBriefing's internal clamp is a no-op.)
    const settled = await Promise.allSettled(
      reported.map((r) => this.briefing.getBriefing(r.schoolId, r.periodId, effectiveLens)),
    )

    // ── AGGREGATE ────────────────────────────────────────────────────────────
    const schoolEntries: OrgSchoolEntry[] = []
    const allItems: { item: OrgAttentionItem; schoolName: string; order: number }[] = []
    const consolidated = { total: 0, critical: 0, warn: 0, info: 0 }
    let schoolsReporting = 0

    settled.forEach((res, i) => {
      const r = reported[i]
      if (res.status === 'fulfilled') {
        const b = res.value
        schoolsReporting += 1
        // Sum from the per-school summary (NOT a recount of items) so consolidated
        // counts stay correct even after the item list is capped.
        consolidated.total += b.summary.total
        consolidated.critical += b.summary.critical
        consolidated.warn += b.summary.warn
        consolidated.info += b.summary.info

        schoolEntries.push({
          schoolId: r.schoolId,
          name: r.name,
          reported: true,
          periodLabel: b.label,
          summary: b.summary,
        })

        // getBriefing returns items already server-ranked; capture each item's
        // source order so we never re-derive the per-school metric/compliance
        // ordering when we sort the cross-school list.
        b.items.forEach((item, order) => {
          allItems.push({
            item: {
              ...item,
              schoolId: r.schoolId,
              schoolName: r.name,
              orgItemId: `${r.schoolId}:${item.id}`,
            },
            schoolName: r.name,
            order,
          })
        })
      } else {
        // Per-school isolation: a thrown getBriefing does NOT abort the roll-up and
        // is NEVER silently dropped. Surface the school with failed:true (distinct
        // from not-reported) + log distinctly so silent failures are observable.
        const reason =
          res.reason instanceof Error ? res.reason.message : String(res.reason)
        this.logger.warn(
          `org-briefing: school ${r.schoolId} (org ${orgId}) getBriefing failed: ${reason}`,
        )
        schoolEntries.push({
          schoolId: r.schoolId,
          name: r.name,
          reported: true,
          periodLabel: null,
          summary: null,
          failed: true,
        })
      }
    })

    // Append the not-reported schools as reported:false rows so the per-school
    // table is complete (never zero-filled into consolidated).
    for (const n of notReported) {
      schoolEntries.push({
        schoolId: n.schoolId,
        name: n.name,
        reported: false,
        periodLabel: null,
        summary: null,
      })
    }

    // ── DETERMINISTIC RANKING ────────────────────────────────────────────────
    // critical>warn>info FIRST; within a severity, group by school name, then the
    // per-school server order (already metric/compliance-ranked), then orgItemId
    // as a final stable tiebreak. We do NOT re-derive the per-school ordering.
    allItems.sort((a, b) => {
      const sev = SEV_RANK[a.item.severity] - SEV_RANK[b.item.severity]
      if (sev !== 0) return sev
      const name = a.schoolName.localeCompare(b.schoolName)
      if (name !== 0) return name
      if (a.order !== b.order) return a.order - b.order
      return a.item.orgItemId.localeCompare(b.item.orgItemId)
    })

    // ── CAP (reported, never silent) ─────────────────────────────────────────
    const totalRanked = allItems.length
    const capApplied = totalRanked > ITEM_CAP
    const cappedItemCount = capApplied ? totalRanked - ITEM_CAP : 0
    if (capApplied) {
      this.logger.log(
        `org-briefing: org ${orgId} produced ${totalRanked} cross-school items; capping to ${ITEM_CAP} (${cappedItemCount} omitted — long tail in per-school summaries).`,
      )
    }
    const items = allItems.slice(0, ITEM_CAP).map((x) => x.item)

    return {
      orgId,
      fiscalYearStart: fiscalYearStart ?? null,
      generatedAt,
      consolidated: {
        ...consolidated,
        schoolsReporting,
        schoolCount: schools.length,
      },
      schools: schoolEntries,
      items,
      notReported,
      capApplied,
      cappedItemCount,
      lens: effectiveLens,
      callerRole: orgRole,
      availableLenses: availableLensesFor(orgRole),
    }
  }
}
