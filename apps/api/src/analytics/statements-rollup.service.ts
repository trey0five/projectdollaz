import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import type { User } from '@finrep/db'
import type { ReportBundle, SOAResult, SFPResult } from '@finrep/engine'
import { PrismaService } from '../prisma/prisma.service.js'

// Fixed engine field names. Because every school runs the SAME @finrep/engine over
// the SAME standard chart, these line keys are HOMOGENEOUS across schools — summing
// by known field name is exact (unlike budget's free-form category keys), and using
// a fixed list (not Object.keys union) bounds the blast radius of any engine-version
// skew. Keep in sync with packages/engine/src/types/results.ts (SOAResult / SFPResult).
const SOA_KEYS: (keyof SOAResult)[] = [
  'tuition', 'dev', 'studAct', 'textbook', 'other', 'support', 'intlRev',
  'investments', 'interest', 'totalRev', 'instructional', 'facilities',
  'fixedOther', 'intlExp', 'bus', 'food', 'studActExp', 'athletics', 'admin',
  'restricted', 'totalExp', 'netChange',
]
const SFP_KEYS: (keyof SFPResult)[] = [
  'cash', 'restrictedCash', 'tuitionRec', 'prepaid', 'totalCurrentA', 'ppNet',
  'rouAsset', 'restrictInvst', 'totalAssets', 'apAccrued', 'leaseCurr',
  'studentClubs', 'deferredIntl', 'totalCurrL', 'leaseNonCurr', 'totalLiab',
  'naWithout', 'naWith', 'totalNA', 'totalLiabNA',
]

interface SchoolStatementEntry {
  schoolId: string
  name: string
  reported: boolean
  periodEndDate: string | null
  soa: { totalRev: number; totalExp: number; netChange: number } | null
  /** null when the school reported a snapshot but it carries no SFP data. */
  sfp: { totalAssets: number; totalLiab: number; totalNA: number } | null
  /** true only when the school both reported AND contributed an SFP block. */
  sfpReported: boolean
}

export interface OrgStatementsRollup {
  orgId: string
  fiscalYearStart: string | null
  schools: SchoolStatementEntry[]
  notReported: { schoolId: string; name: string }[]
  consolidated: {
    soa: Record<string, number>
    sfp: Record<string, number>
    reportedCount: number
    schoolCount: number
  }
}

const round2 = (n: number): number => Math.round(n * 100) / 100

/** NaN-safe fold of the whitelisted numeric line fields into the accumulator. */
function addLine<T>(acc: Record<string, number>, src: T | null | undefined, keys: (keyof T)[]): void {
  if (!src) return
  for (const k of keys) {
    const n = Number((src as Record<string, unknown>)[k as string])
    if (Number.isFinite(n)) acc[k as string] = round2((acc[k as string] ?? 0) + n)
  }
}

/**
 * Organization-wide CONSOLIDATED financial statements (multi-school consolidation).
 * Advisory/read-only: it SUMS each member school's latest STORED statement snapshot
 * (the @finrep/engine ReportBundle) field-by-field — it NEVER re-runs the engine.
 *
 * STRICT org isolation, identical to BudgetRollupService: the roll-up only ever
 * spans the schools that BOTH (a) belong to :orgId and (b) the CALLER has an active
 * membership on. Cross-org schools — and in-org schools the caller cannot see — are
 * never summed or leaked. Schools with no snapshot for the FY are surfaced as
 * not-yet-reported and EXCLUDED from the sums (never zero-filled, so totals reflect
 * only schools that actually reported). Straight sum, pre-elimination (advisory).
 */
@Injectable()
export class StatementsRollupService {
  constructor(private readonly prisma: PrismaService) {}

  async getRollup(
    user: User,
    orgId: string,
    fiscalYearStart: string | null,
  ): Promise<OrgStatementsRollup> {
    // 1) Caller's active memberships, joined to their school (for the org id).
    const memberships = await this.prisma.membership.findMany({
      where: { userId: user.id, status: 'active' },
      include: { school: true },
    })
    if (memberships.length === 0) {
      throw new NotFoundException('You do not belong to an organization yet.')
    }

    // 2) :orgId MUST be one the caller belongs to (no cross-org probing).
    const inOrg = memberships.filter((m) => m.school.organizationId === orgId)
    if (inOrg.length === 0) {
      throw new ForbiddenException('You do not have access to this organization.')
    }

    const org = await this.prisma.organization.findUnique({ where: { id: orgId } })
    if (!org) throw new NotFoundException('Organization not found.')

    // 3) Restrict to the caller's own in-org schools (dedupe).
    const schoolMap = new Map<string, { id: string; name: string }>()
    for (const m of inOrg) schoolMap.set(m.school.id, { id: m.school.id, name: m.school.name })
    const schools = [...schoolMap.values()]

    // 4) Pull every snapshot for those schools (with its period for FY matching),
    //    newest-first so the first match per school is the latest (mirrors
    //    StatementsService.latest's "newest snapshot wins" + budget-rollup's
    //    most-recent-wins). Re-generated snapshots therefore supersede older ones.
    const snapshots = await this.prisma.statementSnapshot.findMany({
      where: { schoolId: { in: schools.map((s) => s.id) } },
      include: { fiscalPeriod: true },
      orderBy: { createdAt: 'desc' },
    })

    // Derive a snapshot's fiscal-year-start from its period end on the SAME Jul–Jun
    // convention the web (deriveFiscalYearStart) + budget rollup use, so the query
    // param and a snapshot's FY always agree — months Jan–Jun belong to the FY that
    // started the prior July; Jul–Dec to the FY that started THIS July. (Snapshots
    // have no spread, so this is the only source — unlike the budget roll-up.)
    const fyStartOf = (s: (typeof snapshots)[number]): string | null => {
      const end = s.fiscalPeriod?.periodEndDate
      if (!end) return null
      const y = end.getUTCFullYear()
      const m = end.getUTCMonth() + 1 // 1..12 (period end)
      const startYear = m <= 6 ? y - 1 : y
      return `${startYear}-07`
    }

    const consolidatedSoa: Record<string, number> = {}
    const consolidatedSfp: Record<string, number> = {}
    const notReported: { schoolId: string; name: string }[] = []
    let reportedCount = 0

    const schoolEntries: SchoolStatementEntry[] = schools.map((s) => {
      // Candidate snapshots for this school, optionally filtered by fiscal year;
      // already createdAt-desc, so the first is the latest matching snapshot.
      const chosen = snapshots.find(
        (snap) =>
          snap.schoolId === s.id && (!fiscalYearStart || fyStartOf(snap) === fiscalYearStart),
      )

      if (!chosen) {
        notReported.push({ schoolId: s.id, name: s.name })
        return {
          schoolId: s.id,
          name: s.name,
          reported: false,
          periodEndDate: null,
          soa: null,
          sfp: null,
          sfpReported: false,
        }
      }

      reportedCount += 1
      const bundle = chosen.payload as unknown as ReportBundle
      const soa = bundle?.soaResults?.cy ?? null
      const sfp = bundle?.sfpResults?.cy ?? null

      // SOA always contributes for a reported school. SFP can be null (a TB-only
      // import with no balance sheet) — still SOA-reported, but contributes zero to
      // the consolidated SFP and is flagged sfpReported:false for the UI.
      addLine(consolidatedSoa, soa, SOA_KEYS)
      if (sfp) addLine(consolidatedSfp, sfp, SFP_KEYS)

      return {
        schoolId: s.id,
        name: s.name,
        reported: true,
        periodEndDate: chosen.fiscalPeriod?.periodEndDate?.toISOString().slice(0, 10) ?? null,
        soa: soa
          ? {
              totalRev: round2(Number(soa.totalRev) || 0),
              totalExp: round2(Number(soa.totalExp) || 0),
              netChange: round2(Number(soa.netChange) || 0),
            }
          : null,
        sfp: sfp
          ? {
              totalAssets: round2(Number(sfp.totalAssets) || 0),
              totalLiab: round2(Number(sfp.totalLiab) || 0),
              totalNA: round2(Number(sfp.totalNA) || 0),
            }
          : null,
        sfpReported: !!sfp,
      }
    })

    return {
      orgId,
      fiscalYearStart: fiscalYearStart ?? null,
      schools: schoolEntries,
      notReported,
      consolidated: {
        soa: consolidatedSoa,
        sfp: consolidatedSfp,
        reportedCount,
        schoolCount: schools.length,
      },
    }
  }
}
