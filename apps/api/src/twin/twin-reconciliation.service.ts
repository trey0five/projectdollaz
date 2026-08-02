import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { createHash, randomUUID } from 'node:crypto'
import type { Prisma } from '@finrep/db'
import { composeFindingKey } from '@finrep/compliance'
import type { DomainKey } from '@finrep/compliance'
import { PrismaService } from '../prisma/prisma.service.js'
import { BillingService } from '../billing/billing.service.js'
import {
  buildDomainMap,
  readCatalogDomainRows,
  type CatalogDomainRow,
} from '../accreditation/domain-map.js'
import { TwinSignalsService } from './twin-signals.service.js'
import { EarlyWarningService } from './early-warning.service.js'
import { buildTwinRules } from './twin-rules.js'
import { resolvePrimaryDomains, type DomainWeightIndex } from './fact-domains.js'
import type {
  FiredFinding,
  ReconcileSummary,
  ReconcileWrite,
  SignalAvailability,
  TwinRule,
  TwinSignal,
  TwinSignalSet,
} from './twin-contract.js'
import type { FindingResolutionKind } from './finding-vocab.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase D — THE NIGHTLY RECONCILIATION. AIC Phase E — now with rules.
//
// It runs, it resolves entitlement, it collects the full signal catalog per
// school, it counts, it logs, and it writes the ledger. Phase D shipped
// `TWIN_RULES` EMPTY on purpose — no finding reaches a human until the rules that
// produce it have been defined and reviewed — and Phase E fills it from
// `buildTwinRules()`. FIVE THINGS IN THIS FILE CHANGED FOR THAT, and a reviewer
// should see exactly five: the import, the engine version, `TWIN_RULES` itself,
// one `prepare` call (with its injected service) that resolves the register view
// the SYNCHRONOUS rules need before they run, and the `registerAvailable` guard
// on the stopped-firing sweep that the arrival of rules made necessary — with no
// rules there was no register to fail to read, and with rules a failed register
// read makes every rule refuse and would otherwise clear the whole ledger as
// "improved". The ledger phase's INVARIANTS are untouched, which is the entire
// point of having decided them first; the guard defends one of them.
//
// The `prepare` edge (this writer depending on the reader service) is a
// deliberate, documented amendment to the Phase D ownership boundary: the rules
// are synchronous by contract and their register view and prior facts are I/O,
// so something has to resolve them first. The edge is one-way and
// EarlyWarningService never injects this service.
//
// The ledger phase below is nevertheless COMPLETE and SPECCED, because a ledger
// written in a hurry alongside its first rules is a ledger whose invariants are
// decided by the rules. These are decided first:
//
//   • FINDINGS NEVER AUTO-CLOSE. `ReconcileWrite` has no `status` field, so this
//     file physically cannot name that column. A rule that stops firing sets
//     `clearedAt` and a `resolutionKind` — a COMPUTED observation — and a human
//     moves `status`. A school that simply stopped uploading gets
//     `resolutionKind: 'stale_data'`, never the word "resolved".
//
//   • IDEMPOTENT. Every write is keyed on (schoolId, ruleId, scopeKey), which the
//     unique index enforces at the database rather than in this file. Re-running
//     the same night is byte-identical apart from `lastSeenAt`; an unchanged
//     `payloadHash` costs one batched bump and no row rewrite.
//
//   • FAILURE-ISOLATED, THREE DEEP. A collector throw costs one signal; a school
//     throw costs one school; the whole body is wrapped so a housekeeping job can
//     never take the process down.
//
//   • `firstSeenAt` IS NEVER REWRITTEN. A worsening finding is the same finding,
//     and the age of a problem is the most useful number on its card.
//
// ── ORDERING, AND WHY IT IS THE CLOCK AND NOT A CALL CHAIN ──────────────────
//
// AccreditationSnapshotService.captureAll() runs at 3AM; this runs at 4AM. It
// would be tidier to chain this off the capture's tail — and it would create
// `accreditation -> twin -> accreditation`, a genuine module cycle, because this
// service needs AccreditationEvidenceReadinessService and AnalyticsService. One
// hour of clock separation, an explicit `snapshotAsOf` stamp and idempotent
// upserts are strictly safer. Do NOT add forwardRef. Do NOT move the Phase-A
// @Cron. Do NOT call ScheduleModule.forRoot() again — RetentionModule already
// does, and the explorer discovers @Cron on any provider app-wide.
//
// The capture is a PRECONDITION, NOT A BLOCKER: if today's snapshot did not land,
// the run proceeds and cites the newest reading it actually has. It never blocks,
// and it never cites a reading that does not exist.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bumped whenever the reconciliation's write semantics change. Stored per row.
 *
 * 1.0.0 → 1.1.0 at AIC Phase E: the write semantics now INCLUDE RULES. Every row
 * this job writes from here on is the product of the twenty-two firing rules, and
 * the row stamp has to say so — an operator reading `engine_version` on a finding
 * needs to know which engine composed its basis chain.
 */
export const TWIN_ENGINE_VERSION = '1.1.0'

/** Max schools reconciled in parallel — a nightly job must not stampede the pool. */
const RECONCILE_CONCURRENCY = 4

/**
 * AIC PHASE E — POPULATED. Phase D shipped this EMPTY on purpose (no finding
 * reaches a human until the rules that produce it have been defined and
 * reviewed); Phase E defines them, and `buildTwinRules` adapts the twenty-six
 * pure `TwinRuleDef`s in `@finrep/compliance` to this file's `TwinRule` shape.
 *
 * NOTHING ELSE IN THIS FILE'S LEDGER PHASE CHANGED. The create/update/touch
 * branches, the `payloadHash` dedupe, `firstSeenAt` immutability, the
 * cleared-never-closed branch, `resolutionFor`, the concurrency limiter and the
 * per-school/per-rule isolation are all Phase D's and are untouched — they were
 * decided first precisely so that the arrival of rules could not bend them.
 *
 * The nightly log line now reports a non-zero rule count and a non-zero written
 * count. That change in the log is the live proof the wiring landed.
 */
export const TWIN_RULES: readonly TwinRule[] = buildTwinRules()

/**
 * Deterministic JSON: object keys sorted, so a key-order change is not a data change.
 *
 * TOTAL OVER THE VALUES IT CAN RECEIVE. `evidencePayload` is `Record<string,
 * unknown>` and the register facts Phase E cites are DATES — a plan's endDate, a
 * trustee's termEnd, a maintenance item's targetDate. A `Date` has no own
 * enumerable properties, so the plain-object branch serialised every one of them
 * as `{}`: a rule firing with `{ termEnd: 2026-06-30 }` and then with
 * `{ termEnd: 2027-06-30 }` produced an IDENTICAL hash, took the unchanged branch,
 * and left the stored basis chain citing a fact that is no longer true. Anything
 * carrying `toJSON` (Date, Prisma Decimal) is serialised through it.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const toJson = (value as { toJSON?: unknown }).toJSON
  if (typeof toJson === 'function') {
    return stableStringify((toJson as () => unknown).call(value))
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
}

function hashPayload(payload: unknown): string {
  return createHash('sha256').update(stableStringify(payload)).digest('hex')
}

function zeroCounts(): Record<SignalAvailability, number> {
  return { available: 0, not_licensed: 0, no_data: 0, not_tracked: 0 }
}

/** One school's contribution to the run summary. */
interface SchoolResult {
  collected: Record<SignalAvailability, number>
  signals: number
  created: number
  updated: number
  touched: number
  cleared: number
  reopened: number
}

function emptySchoolResult(): SchoolResult {
  return {
    collected: zeroCounts(),
    signals: 0,
    created: 0,
    updated: 0,
    touched: 0,
    cleared: 0,
    reopened: 0,
  }
}

@Injectable()
export class TwinReconciliationService {
  private readonly logger = new Logger(TwinReconciliationService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly twinSignals: TwinSignalsService,
    // AIC Phase E. The rules are SYNCHRONOUS by Phase D's contract, but they need
    // a register view and a prior observation — both of which are I/O. This
    // service resolves them and registers them against the signal set BEFORE
    // evaluation, so `TwinRule.evaluate` stays synchronous and Phase D's contract
    // is honoured rather than widened. The edge is one-way: EarlyWarningService
    // never injects this service.
    private readonly earlyWarning: EarlyWarningService,
  ) {}

  /**
   * The nightly run. `rules` is a parameter rather than a direct read of
   * TWIN_RULES so the spec can drive the complete ledger phase with fixtures
   * without shipping a production rule — the Cron invokes it with no arguments
   * and therefore always with the empty production set.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async reconcileAll(
    at: Date = new Date(),
    rules: readonly TwinRule[] = TWIN_RULES,
  ): Promise<ReconcileSummary> {
    const runId = randomUUID()
    const startedAt = Date.now()
    const summary: ReconcileSummary = {
      runId,
      rules: rules.length,
      schoolsScanned: 0,
      schoolsSkipped: 0,
      signalsCollected: 0,
      counts: zeroCounts(),
      created: 0,
      updated: 0,
      touched: 0,
      cleared: 0,
      reopened: 0,
      durationMs: 0,
    }

    try {
      // Eligible = has a standards register at all, exactly like the Phase-A
      // capture. Entitlement is re-checked per school below.
      const withStandards = await this.prisma.accreditationStandard.groupBy({
        by: ['schoolId'],
        _count: { _all: true },
      })
      const schoolIds = withStandards.map((r) => r.schoolId)

      await this.mapWithConcurrency(schoolIds, RECONCILE_CONCURRENCY, async (schoolId) => {
        const result = await this.reconcileSchool(schoolId, at, rules)
        if (result === null) {
          summary.schoolsSkipped += 1
          return
        }
        summary.schoolsScanned += 1
        summary.signalsCollected += result.signals
        for (const k of Object.keys(summary.counts) as SignalAvailability[]) {
          summary.counts[k] += result.collected[k]
        }
        summary.created += result.created
        summary.updated += result.updated
        summary.touched += result.touched
        summary.cleared += result.cleared
        summary.reopened += result.reopened
      })
    } catch (err) {
      // A housekeeping job never takes the process down.
      this.logger.error(`twin reconciliation failed: ${(err as Error).message}`)
    }

    summary.durationMs = Date.now() - startedAt
    const written = summary.created + summary.updated
    this.logger.log(
      `twin reconciliation: ${summary.rules} rule(s), ${summary.schoolsScanned} school(s) scanned, ` +
        `${summary.signalsCollected} signal(s) collected (${summary.counts.available} available, ` +
        `${summary.counts.not_licensed} not_licensed, ${summary.counts.no_data} no_data, ` +
        `${summary.counts.not_tracked} not_tracked), ${written} finding(s) written, ` +
        `${summary.durationMs}ms`,
    )
    return summary
  }

  /**
   * One school. Returns null when the school was SKIPPED (no billing row, or no
   * accreditation licence) — a skip is not a failure and must not be counted as
   * a scan.
   */
  async reconcileSchool(
    schoolId: string,
    at: Date,
    rules: readonly TwinRule[] = TWIN_RULES,
  ): Promise<SchoolResult | null> {
    // 1. READ-ONLY entitlement probe FIRST. BillingService.isEntitledForModule
    //    goes through getOrCreateSubscription, which CREATES a fresh 14-day trial
    //    row for any school that lacks one. A 4AM housekeeping job must never
    //    grant a subscription as a side effect of looking. Same defence as
    //    readiness-snapshot.service.ts.
    const hasBilling = await this.prisma.subscription.findUnique({
      where: { schoolId },
      select: { id: true },
    })
    if (!hasBilling) return null

    const licensed = await this.billing
      .isEntitledForModule(schoolId, 'accreditation')
      .catch(() => false)
    if (!licensed) return null

    // 3. Collect. Never throws; a failed collector is one no_data signal.
    const signals = await this.twinSignals.collect(schoolId, { now: at })

    const result = emptySchoolResult()
    result.signals = signals.signals.length
    result.collected = { ...signals.counts }

    // 4. PHASE D STOPS HERE. Zero rules => the ledger is never touched, and a
    //    non-zero row count in accreditation_findings is a bug, not a feature.
    if (rules.length === 0) return result

    // ── everything below is Phase E's ledger phase, shipped and specced now ──

    // AIC Phase E — resolve the register view + the prior observations and
    // register them AGAINST THE SET WE JUST COLLECTED, so the synchronous rules
    // below can read them. Passing `signals` in is what keeps this ONE line
    // rather than a second collection of all 35 signals. Never throws.
    await this.earlyWarning.prepare(schoolId, at, signals)

    // A RUN THAT COULD NOT READ THE REGISTER MAY NOT CLEAR ANYTHING.
    //
    // `TwinRegisterService.build` never throws: a transient `listStandards`
    // failure returns an EMPTY register, and because every rule needs a school
    // standard code (G3) every rule then refuses with `no_standards`. `fired` is
    // empty, so the stopped-firing sweep below would run over every open row —
    // and `resolutionFor` inspects only the LIVE SIGNALS, which are perfectly
    // healthy because the failure was in the register, so it stamps 'improved'.
    // One pool timeout would therefore mark a school's entire ledger resolved,
    // and the following night reopen all of it and mail a digest for the lot.
    // "Findings never auto-close" has to survive our own outages, so the sweep is
    // skipped outright — the rows simply keep their state until a run that can
    // actually see the register has an opinion.
    const registerAvailable = this.earlyWarning.registerAvailableFor(signals)

    const fired = this.evaluate(rules, signals, at)
    const weights = await this.domainWeightIndex(schoolId)
    const primary = resolvePrimaryDomains(fired, weights)

    // NEW-vs-EXISTING IS DECIDED OVER THE WHOLE KEY SPACE, NOT THE OPEN SUBSET.
    //
    // This read used to filter `status: { notIn: ['resolved','dismissed'] }`, so a
    // finding a human had CLOSED and whose rule then fired again looked new, went
    // to `create`, and collided with UNIQUE(school_id, rule_id, scope_key). The
    // P2002 escapes reconcileSchool, the per-school catch swallows it, and the
    // school silently vanishes from the run — every night, permanently, because
    // the resolved row never goes away. That is exactly the case the ledger exists
    // for: a condition a human closed out that comes back.
    //
    // So: load every row for the school, key the decision on ALL of them, and keep
    // a separate `open` list for the stopped-firing sweep (a resolved row must
    // still never be cleared). Only the columns the ledger phase actually reads are
    // selected — the previous read pulled the whole evidence_payload JSON for
    // every open row and never looked at it.
    const existingRows = await this.prisma.accreditationFinding.findMany({
      where: { schoolId },
      select: {
        id: true,
        findingKey: true,
        ruleId: true,
        status: true,
        clearedAt: true,
        payloadHash: true,
      },
    })
    const existingByKey = new Map(existingRows.map((f) => [f.findingKey, f]))
    const open = existingRows.filter((f) => f.status !== 'resolved' && f.status !== 'dismissed')

    const firedByKey = new Map<string, FiredFinding>()
    for (const f of fired) {
      const key = composeFindingKey(f.ruleId, f.scopeKey)
      // First emission wins: two rules cannot both own one (ruleId, scopeKey),
      // and silently overwriting would make the run order-dependent.
      if (!firedByKey.has(key)) firedByKey.set(key, f)
    }

    const touchIds: string[] = []

    for (const [findingKey, f] of firedByKey) {
      const primaryDomainKey = primary.get(f.factKey) ?? f.defaultDomainKey
      const payload = {
        ...f.evidencePayload,
        snapshotAsOf: signals.snapshotAsOf,
        signals: this.basisSignals(rules, f, signals),
      }
      const payloadHash = hashPayload(payload)
      const write = this.writeFor(f, primaryDomainKey, payload, payloadHash, at, signals.demoData)
      const existing = existingByKey.get(findingKey)

      if (!existing) {
        await this.prisma.accreditationFinding.create({
          data: {
            schoolId,
            ruleId: f.ruleId,
            scopeKey: f.scopeKey,
            findingKey,
            factKey: f.factKey,
            status: 'open',
            firstSeenAt: at,
            reopenCount: 0,
            ...write,
          },
        })
        result.created += 1
        continue
      }

      if (existing.clearedAt !== null) {
        // It stopped firing, and now it fires again. `status` is UNTOUCHED: a
        // finding a human acknowledged — OR RESOLVED — and which then re-armed
        // comes back as it was, with mutedUntil intact, and Phase E's alert logic
        // decides whether the re-arm notifies. Only a human moves `status` back.
        //
        // A row a human resolved WITHOUT it ever clearing (i.e. resolved while
        // still firing) has clearedAt === null and takes the ordinary update path
        // below: it is maintained, not reopened, because it never re-armed.
        await this.prisma.accreditationFinding.update({
          where: { id: existing.id, schoolId },
          data: { ...write, clearedAt: null, resolutionKind: null, reopenCount: { increment: 1 } },
        })
        result.updated += 1
        result.reopened += 1
        continue
      }

      if (existing.payloadHash === payloadHash) {
        // Nothing about this finding changed. One batched bump, no row rewrite,
        // no updatedAt churn on 40 findings a night.
        touchIds.push(existing.id)
        continue
      }

      // `firstSeenAt` is deliberately absent from the update: a worsening finding
      // is the same finding.
      await this.prisma.accreditationFinding.update({
        where: { id: existing.id, schoolId },
        data: write,
      })
      result.updated += 1
    }

    if (touchIds.length > 0) {
      // TENANCY: `schoolId` rides on EVERY write, not only on the reads that
      // produced the ids. §5.6 names "every query carries where: { schoolId }" as
      // the mechanism; an id sourced from anywhere but a scoped read would
      // otherwise write across the boundary with nothing to stop it, in a job that
      // fans four schools out in parallel.
      await this.prisma.accreditationFinding.updateMany({
        where: { schoolId, id: { in: touchIds } },
        data: { lastSeenAt: at },
      })
      result.touched += touchIds.length
    }

    // ── The stopped-firing branch: CLEARED, never closed ──────────────────────
    if (!registerAvailable) {
      this.logger.warn(
        `twin reconciliation: register unreadable for ${schoolId}; stopped-firing sweep skipped`,
      )
      return result
    }
    for (const existing of open) {
      if (firedByKey.has(existing.findingKey)) continue
      // Idempotent: a cleared finding does not re-clear every night.
      if (existing.clearedAt !== null) continue

      const rule = rules.find((r) => r.id === existing.ruleId)
      await this.prisma.accreditationFinding.update({
        where: { id: existing.id, schoolId },
        // `lastSeenAt` is deliberately NOT moved: we did not see this finding
        // tonight. And `status` is not here at all — that is the whole invariant.
        data: { clearedAt: at, resolutionKind: this.resolutionFor(rule, signals) },
      })
      result.cleared += 1
    }

    return result
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Rule evaluation, isolated per rule: one bad rule cannot cost the others. */
  private evaluate(
    rules: readonly TwinRule[],
    signals: TwinSignalSet,
    at: Date,
  ): FiredFinding[] {
    const out: FiredFinding[] = []
    for (const rule of rules) {
      try {
        out.push(...rule.evaluate(signals, at))
      } catch (err) {
        this.logger.warn(
          `twin rule ${rule.id} failed for ${signals.schoolId}: ${(err as Error).message}`,
        )
      }
    }
    return out
  }

  /**
   * The ONLY fields reconciliation writes. Typed as `ReconcileWrite`, which has no
   * `status` — that absence is the mechanism, not a convention.
   */
  private writeFor(
    f: FiredFinding,
    primaryDomainKey: DomainKey,
    payload: Record<string, unknown>,
    payloadHash: string,
    at: Date,
    isDemo: boolean,
  ): ReconcileWrite {
    // Horizon invariant: exactly one of date/periods, and 'none' carries neither.
    const horizonDate = f.horizonKind === 'by_date' ? f.horizonDate : null
    const horizonPeriods = f.horizonKind === 'periods_to_breach' ? f.horizonPeriods : null
    const horizonConfidence = f.horizonKind === 'none' ? null : f.horizonConfidence

    return {
      lastSeenAt: at,
      severity: f.severity,
      likelihood: f.likelihood,
      confidence: f.confidence,
      standardTags: [...f.standardTags],
      domainKeys: [...f.domainKeys],
      primaryDomainKey,
      horizonKind: f.horizonKind,
      horizonDate,
      horizonPeriods,
      horizonConfidence,
      evidencePayload: payload as Prisma.InputJsonValue,
      payloadHash,
      clearedAt: null,
      resolutionKind: null,
      isDemo,
      engineVersion: TWIN_ENGINE_VERSION,
    }
  }

  /**
   * The basis chain's signal slice: every signal the finding's rule declared as
   * required, with its value and its as-of date. This is what the NEXT run reads
   * to decide `moved` vs `unchanged`, and what a reader sees when they ask "on
   * what?".
   */
  private basisSignals(
    rules: readonly TwinRule[],
    f: FiredFinding,
    signals: TwinSignalSet,
  ): Record<string, { value: unknown; observedOn: string | null; changeState: string }> {
    const rule = rules.find((r) => r.id === f.ruleId)
    const wanted = new Set<string>(rule?.requiredSignals ?? [])
    const out: Record<string, { value: unknown; observedOn: string | null; changeState: string }> =
      {}
    for (const s of signals.signals) {
      if (!wanted.has(s.key)) continue
      out[s.key] = { value: s.value, observedOn: s.observedOn, changeState: s.changeState }
    }
    return out
  }

  /**
   * A rule that stopped firing either IMPROVED or went QUIET. The difference is
   * whether we could still see the inputs.
   *
   * A school that simply stopped uploading gets 'stale_data' — never the word
   * "resolved" — and that is only true because reconciliation cannot write
   * `status` at all.
   */
  private resolutionFor(
    rule: TwinRule | undefined,
    signals: TwinSignalSet,
  ): FindingResolutionKind {
    // A rule we can no longer find is a rule we can no longer evaluate.
    if (!rule) return 'stale_data'
    const byKey = new Map<string, TwinSignal>(signals.signals.map((s) => [s.key, s]))
    for (const key of rule.requiredSignals) {
      const s = byKey.get(key)
      if (!s) return 'stale_data'
      if (s.availability !== 'available') return 'stale_data'
      if (s.changeState === 'stale_data') return 'stale_data'
    }
    return 'improved'
  }

  /**
   * The school's domain-weight map, keyed by BOTH school-standard id and standard
   * CODE so a rule may tag either way. `buildDomainMap` remains the single
   * authority for the weights themselves — this only adds an alias.
   */
  private async domainWeightIndex(schoolId: string): Promise<DomainWeightIndex> {
    const standards = await this.prisma.accreditationStandard.findMany({
      where: { schoolId },
      select: { id: true, code: true, catalogStandardId: true },
    })
    const catalogIds = [
      ...new Set(standards.map((s) => s.catalogStandardId).filter((id): id is string => !!id)),
    ]
    if (catalogIds.length === 0) return {}

    const catalogRows: CatalogDomainRow[] = await readCatalogDomainRows(
      () =>
        this.prisma.accreditationCatalogStandard.findMany({
          where: { id: { in: catalogIds } },
          select: {
            id: true,
            isAssurance: true,
            domainKey: true,
            domainWeights: true,
            signalKeys: true,
          },
        }),
      () =>
        this.prisma.accreditationCatalogStandard.findMany({
          where: { id: { in: catalogIds } },
          select: { id: true, isAssurance: true },
        }),
    )

    const { map } = buildDomainMap(
      standards.map((s) => ({ id: s.id, catalogStandardId: s.catalogStandardId })),
      catalogRows,
    )

    const index: Record<string, Readonly<Partial<Record<DomainKey, number>>>> = { ...map }
    for (const s of standards) {
      const w = map[s.id]
      // A duplicate code (the register tolerates them) keeps the FIRST binding, so
      // the alias is deterministic rather than last-write-wins.
      if (w && !(s.code in index)) index[s.code] = w
    }
    return index
  }

  /** Bounded-parallelism map. Deliberately NOT Promise.all over every school. */
  private async mapWithConcurrency<T>(
    items: readonly T[],
    limit: number,
    worker: (item: T) => Promise<void>,
  ): Promise<void> {
    let cursor = 0
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = cursor
        cursor += 1
        if (i >= items.length) return
        try {
          await worker(items[i])
        } catch (err) {
          // One school's bad data cannot stop the other 39.
          this.logger.warn(
            `twin reconciliation failed for item ${i}: ${(err as Error).message}`,
          )
        }
      }
    })
    await Promise.all(runners)
  }
}
