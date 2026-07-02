import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import type { User } from '@finrep/db'
import type { ReportBundle, SOAResult, SFPResult, SCFResult, NetAssetsColumn } from '@finrep/engine'
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
// SCFResult is FLAT (packages/engine/src/types/results.ts SCFResult) — folds exactly
// like SOA. All 18 fields, in engine order, so no cash-flow line is silently dropped.
// bundle.scf is `SCFResult | null` (a TB-only import with no audited beginning balances
// yields scf:null), so a school missing it is EXCLUDED + flagged, never zero-filled.
const SCF_KEYS: (keyof SCFResult)[] = [
  'netChange', 'depr', 'arAdj', 'prepaidAdj', 'apAdj', 'deferredAdj', 'clubsAdj',
  'operatingCash', 'ppePurchases', 'investmentsCash', 'investingCash', 'leasePayments',
  'financingCash', 'netCashChange', 'cashBegin', 'cashEnd', 'cashUnrestricted',
  'cashRestricted',
]
// NetAssetsResult is NESTED ({ cy, py, audit, hasPY, hasAudit }); the extensive,
// summable column is netAssets.cy (a NetAssetsColumn). We fold that CY column ONLY —
// begin/change/end and the withoutDonor/withDonor end-of-year split are all extensive
// across schools, so a straight field-by-field sum is the correct advisory roll-up.
const NET_ASSETS_KEYS: (keyof NetAssetsColumn)[] = [
  'begin', 'change', 'end', 'withoutDonor', 'withDonor',
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
  /** null when the reported school carries no cash-flow statement (bundle.scf===null). */
  scf: { operatingCash: number; netCashChange: number; cashEnd: number } | null
  /** true only when the school both reported AND contributed an SCF block. */
  scfReported: boolean
  /** null when the reported school's payload carries no changes-in-net-assets block. */
  netAssets: { begin: number; change: number; end: number } | null
  /** true only when the school both reported AND contributed a net-assets block. */
  naReported: boolean
}

export interface OrgStatementsRollup {
  orgId: string
  fiscalYearStart: string | null
  schools: SchoolStatementEntry[]
  notReported: { schoolId: string; name: string }[]
  consolidated: {
    soa: Record<string, number>
    sfp: Record<string, number>
    scf: Record<string, number>
    netAssets: Record<string, number>
    reportedCount: number
    sfpReportedCount: number
    scfReportedCount: number
    naReportedCount: number
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
    const consolidatedScf: Record<string, number> = {}
    const consolidatedNetAssets: Record<string, number> = {}
    const notReported: { schoolId: string; name: string }[] = []
    let reportedCount = 0
    let sfpReportedCount = 0
    let scfReportedCount = 0
    let naReportedCount = 0

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
          scf: null,
          scfReported: false,
          netAssets: null,
          naReported: false,
        }
      }

      reportedCount += 1
      const bundle = chosen.payload as unknown as ReportBundle
      const soa = bundle?.soaResults?.cy ?? null
      const sfp = bundle?.sfpResults?.cy ?? null
      // scf is a top-level `SCFResult | null` on the bundle; netAssets is nested —
      // the summable CY column is netAssets.cy (older payloads may predate netAssets
      // entirely, so guard both hops).
      const scf = bundle?.scf ?? null
      const na = bundle?.netAssets?.cy ?? null

      // SOA always contributes for a reported school. SFP/SCF/net-assets can each be
      // null (e.g. a TB-only import with no balance sheet / no audited beginning
      // balances) — still SOA-reported, but each missing block contributes zero to its
      // consolidated total and is flagged *Reported:false for the UI. Each of the four
      // coverage counts is INDEPENDENT (a school may be SOA-only, or SOA+SFP but
      // SCF-null, etc.), so each increments only inside its own guard.
      addLine(consolidatedSoa, soa, SOA_KEYS)
      if (sfp) {
        addLine(consolidatedSfp, sfp, SFP_KEYS)
        sfpReportedCount += 1
      }
      if (scf) {
        addLine(consolidatedScf, scf, SCF_KEYS)
        scfReportedCount += 1
      }
      if (na) {
        addLine(consolidatedNetAssets, na, NET_ASSETS_KEYS)
        naReportedCount += 1
      }

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
        scf: scf
          ? {
              operatingCash: round2(Number(scf.operatingCash) || 0),
              netCashChange: round2(Number(scf.netCashChange) || 0),
              cashEnd: round2(Number(scf.cashEnd) || 0),
            }
          : null,
        scfReported: !!scf,
        netAssets: na
          ? {
              begin: round2(Number(na.begin) || 0),
              change: round2(Number(na.change) || 0),
              end: round2(Number(na.end) || 0),
            }
          : null,
        naReported: !!na,
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
        scf: consolidatedScf,
        netAssets: consolidatedNetAssets,
        reportedCount,
        sfpReportedCount,
        scfReportedCount,
        naReportedCount,
        schoolCount: schools.length,
      },
    }
  }
}
