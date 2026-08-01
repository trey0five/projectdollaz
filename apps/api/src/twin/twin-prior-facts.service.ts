import { Injectable, Logger } from '@nestjs/common'
import type { ModuleKey } from '@finrep/db'
import { suppressSmallCellSet, type PriorFact } from '@finrep/compliance'
import { PrismaService } from '../prisma/prisma.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase E — WHERE A "PREVIOUS OBSERVATION" COMES FROM.
//
// Three rules compare two observations of one register — ENR-DECLINE,
// ENR-FEEDER-EROSION and FIN-AR-AGING-WORSENING — and neither the signal catalog
// nor `TrendSignal` carries a previous observation.
//
// AND IT CANNOT COME FROM THE LEDGER. Phase D's `priorValues()` reads the
// findings ledger, which is EMPTY before the first rule fires — so it can never
// bootstrap a comparison rule. A comparison rule sourced from the ledger would
// be a rule that can only fire after it has already fired.
//
// So the prior observation comes from the SOURCE REGISTER'S OWN SECOND-NEWEST
// ROW, which exists the moment a school has two snapshots. Two queries, both
// `skip: 1`, both `schoolId`-scoped, both issued ONLY when the owning module is
// licensed — the same fail-closed entitlement discipline as the live collector,
// because a comparison must never read a number the live signal refuses to show.
//
// FERPA, AND WHY THE PRIOR IS SUPPRESSED TOO. The per-grade cells pass through
// `suppressSmallCellSet` with the row's OWN `totalEnrolled` before entering the
// map — IDENTICAL treatment to the live signal. Suppressing the current
// observation and publishing last year's would disclose exactly what suppression
// exists to hide: a cohort of 4 is a cohort of 4 whichever year it is in, and a
// reader with both would difference them anyway. The engine then declines the
// comparison (`cells_suppressed`) rather than performing it on half the data,
// which is the FERPA-correct answer and is a feature.
//
// NO ROSTER ROWS. This file lives in apps/api/src/twin/ and is covered by
// no-student-access.spec.ts, which forbids a direct roster query anywhere in this
// directory — in code OR in a comment, because a name that appears here is a name
// somebody can start selecting tomorrow. `EnrollmentSnapshot` is an aggregate
// register row, not a roster: it holds a total and a per-grade tally, and nothing
// that identifies anyone.
// ─────────────────────────────────────────────────────────────────────────────

function isoDay(d: Date | null | undefined): string | null {
  if (!d) return null
  return d.toISOString().slice(0, 10)
}

@Injectable()
export class TwinPriorFactsService {
  private readonly logger = new Logger(TwinPriorFactsService.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * The previous observation for the THREE comparison signals, and nothing else.
   *
   * `live` is the current signal set's own observation dates, keyed by signal.
   * A prior row whose date EQUALS the live one is the SAME observation read
   * twice, so the key is omitted entirely — the engine then reports
   * `no_prior_observation`, which is the truth ("we have one reading, not two")
   * rather than a comparison of a number against itself.
   *
   * NEVER throws: a failed read costs the comparison rules, not the run.
   */
  async collect(
    schoolId: string,
    entitled: ReadonlySet<ModuleKey>,
    live: Readonly<Record<string, string | null>> = {},
  ): Promise<Record<string, PriorFact>> {
    const out: Record<string, PriorFact> = {}

    const [enrollment, aging] = await Promise.all([
      // Issued ONLY when enrollment is licensed. An unlicensed module's number is
      // never read, not merely never rendered.
      entitled.has('enrollment')
        ? this.prisma.enrollmentSnapshot
            .findFirst({
              where: { schoolId },
              orderBy: { observedOn: 'desc' },
              skip: 1,
              select: { observedOn: true, totalEnrolled: true, byGrade: true },
            })
            .catch((err) => {
              this.logger.warn(`prior enrollment read failed: ${(err as Error).message}`)
              return null
            })
        : Promise.resolve(null),
      entitled.has('finance')
        ? this.prisma.arApAgingSnapshot
            .findFirst({
              where: { schoolId },
              orderBy: { asOfDate: 'desc' },
              skip: 1,
              select: { asOfDate: true, ar90Plus: true },
            })
            .catch((err) => {
              this.logger.warn(`prior aging read failed: ${(err as Error).message}`)
              return null
            })
        : Promise.resolve(null),
    ])

    if (enrollment) {
      const observedOn = isoDay(enrollment.observedOn)
      if (observedOn !== null && observedOn !== live['enr.headcount']) {
        out['enr.headcount'] = {
          value: enrollment.totalEnrolled,
          observedOn,
          cells: null,
        }
      }
      if (observedOn !== null && observedOn !== live['enr.feeder_grades']) {
        const cells = this.suppressedGradeCells(enrollment.byGrade, enrollment.totalEnrolled)
        if (cells !== null) {
          out['enr.feeder_grades'] = { value: null, observedOn, cells }
        }
      }
    }

    if (aging) {
      const observedOn = isoDay(aging.asOfDate)
      if (observedOn !== null && observedOn !== live['fin.ar_aging']) {
        out['fin.ar_aging'] = { value: aging.ar90Plus, observedOn, cells: null }
      }
    }

    return out
  }

  /**
   * Per-grade cells, suppressed EXACTLY as the live collector suppresses them —
   * same helper, same `total`, same complementary closure. `value` is deliberately
   * null on the fact itself: the prior IS the cell set, and publishing a scalar
   * derived from the same rows would be a second place a small count could leak.
   */
  private suppressedGradeCells(
    byGrade: unknown,
    total: number,
  ): PriorFact['cells'] {
    if (!byGrade || typeof byGrade !== 'object') return null
    const cells = Object.entries(byGrade as Record<string, unknown>)
      .filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1]))
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([key, value]) => ({ key, value }))
    if (cells.length === 0) return null
    return suppressSmallCellSet(cells, { total }).cells
  }
}
