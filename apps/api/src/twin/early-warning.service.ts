import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import type { AccreditationFinding, ModuleKey } from '@finrep/db'
import { composeFindingKey } from '@finrep/compliance'
import type {
  DomainKey,
  TwinEvidenceEntry,
  TwinFinding,
  TwinResult,
} from '@finrep/compliance'
import { PrismaService } from '../prisma/prisma.service.js'
import { BillingService } from '../billing/billing.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import { TwinSignalsService } from './twin-signals.service.js'
import { TwinRegisterService } from './twin-register.service.js'
import { TwinPriorFactsService } from './twin-prior-facts.service.js'
import { globalTwinCache, toFiredFinding, type TwinContextRegistry } from './twin-rules.js'
import { resolvePrimaryDomains } from './fact-domains.js'
import type { TwinSignalSet } from './twin-contract.js'
import type { FindingResolutionKind, FindingStatus } from './finding-vocab.js'
import type { TwinQueryDto } from './dto/twin-query.dto.js'
import type { AckFindingDto } from './dto/ack-finding.dto.js'
import type { MuteFindingDto } from './dto/mute-finding.dto.js'
import type { FindingStatusDto } from './dto/finding-status.dto.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase E — THE READ MODEL, and the four human actions.
//
// TWO AUTHORITIES, AND THEY ARE NOT THE SAME AUTHORITY:
//
//   the ENGINE, run against LIVE signals, is the authority on WHAT IS FIRING NOW.
//   the LEDGER is the authority on LIFECYCLE — how long, how often, who muted it,
//   what a human decided.
//
// Conflating them is the classic failure of a findings product. If the ledger
// were the authority on what is firing, a school would wait until 4AM to see a
// problem it caused at 2PM. If the engine were the authority on lifecycle, every
// ack a human made would evaporate on the next read. So this file merges them by
// `findingKey`, and each side answers only the question it can answer.
//
// A FINDING THAT FIRES BUT HAS NO ROW YET IS SHOWN IMMEDIATELY, with `id: null`.
// The user sees the truth now; the ledger catches up overnight. Ack is disabled
// for a row-less finding because there is nothing to write to — the UI says so
// rather than failing the click.
//
// A MUTED FINDING STAYS IN `findings[]`. Hiding it would make an ack look like a
// fix, and the whole point of separating `status` from `clearedAt` is that a
// human decision and a change in the world are different events. The UI dims it;
// the briefing and the digest skip it.
//
// THE WORD "RESOLVED" IS NEVER EMITTED FOR A STALE-DATA CLEAR. That is acceptance
// criterion 3, and it is enforced here in `clearedCopyFor` and asserted by a spec.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The ack window. 45 days ≈ one board cycle plus slack: long enough that
 * acknowledging is a real decision, short enough that a genuine problem returns
 * before the next accreditation touchpoint. ONE constant, ONE edit (E-O2).
 */
export const ACK_WINDOW_DAYS = 45

const DAY_MS = 24 * 60 * 60 * 1000

/** Frozen. A spec asserts /resolved/i never matches the stale-data branch. */
const CLEARED_COPY: Record<FindingResolutionKind, (date: string) => string> = {
  improved: (d) => `This stopped firing on ${d}. Confirm it is genuinely resolved.`,
  stale_data: (d) =>
    `We stopped being able to see the data behind this on ${d}. That is not the same as it being fixed.`,
  dismissed: (d) => `A person dismissed this on ${d}.`,
}

/** What the routes return: the engine's finding plus its ledger lifecycle. */
export interface FindingPublic {
  ruleId: string
  scopeKey: string
  factKey: string
  title: string
  rationale: string
  evidence: TwinEvidenceEntry[]
  standardTags: string[]
  domainKeys: DomainKey[]
  severity: string
  likelihood: string
  confidence: string
  horizon: TwinFinding['horizon']
  consequence: string
  /** Null when the rule fires now and the ledger row is not written yet. */
  id: string | null
  findingKey: string
  status: FindingStatus
  firstSeenAt: string | null
  lastSeenAt: string | null
  clearedAt: string | null
  resolutionKind: FindingResolutionKind | null
  mutedUntil: string | null
  ackedUntil: string | null
  mutedReason: string | null
  reopenCount: number
  initiativeId: string | null
  isDemo: boolean
  /** True when the rule stopped firing and no human has closed it. */
  findingCleared: boolean
  /** Rendered VERBATIM for a cleared finding. NEVER says "resolved" for stale data. */
  clearedCopy: string | null
}

/**
 * ONE ROW PER CATALOG SIGNAL — what the engine tried to read, and for everything
 * it could not, THE REASON IN ITS OWN WORDS.
 *
 * `TwinResult` is the PURE engine's shape and carries no signal roster: the pure
 * function receives the signals, it does not republish them. The Signals tab's
 * headline claim ("all thirty-six of them") therefore had nothing to render and
 * sat permanently in its degraded fallback, showing only the four count pills and
 * the handful of signals that happened to block a rule. The roster is added HERE,
 * by the service that already holds the collected set.
 *
 * Deliberately NARROW: no `value`, no `cells`, no `trend`. A school learns what we
 * tried to read and why we could not, never a number behind a module it has not
 * bought — the same discipline the collector applies when it blanks a signal.
 */
export interface TwinSignalRow {
  key: string
  label: string
  availability: string
  unavailableReason: string | null
  moduleKey: string | null
  observedOn: string | null
  ageDays: number | null
  changeState: string
  domainKeys: string[]
}

export interface TwinResponse extends Omit<TwinResult, 'findings'> {
  findings: FindingPublic[]
  /** Rows whose rule has STOPPED firing. Populated only with `includeCleared`. */
  cleared: FindingPublic[]
  /** The full catalog roster, in catalog order. */
  signals: TwinSignalRow[]
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null
}

@Injectable()
export class EarlyWarningService {
  private readonly logger = new Logger(EarlyWarningService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
    private readonly twinSignals: TwinSignalsService,
    private readonly twinRegister: TwinRegisterService,
    private readonly priorFacts: TwinPriorFactsService,
  ) {}

  /**
   * The module-scope registry the reconciliation's `TWIN_RULES` were built
   * against. A plain field and NOT a constructor parameter: it is a shared cache,
   * not a dependency, and making Nest resolve it would create a provider token
   * whose whole purpose is to be a singleton the module already guarantees. A
   * spec swaps it to prove the nightly path and the read path share ONE cache.
   */
  private cache: TwinContextRegistry = globalTwinCache

  /** Test seam — the ONLY writer of `cache`. Production never calls it. */
  useCache(cache: TwinContextRegistry): void {
    this.cache = cache
  }

  /**
   * Collect (or adopt) one school's signal set and REGISTER the rule context
   * against it, so every `TwinRule` built by `buildTwinRules` can find the
   * register view and the prior facts it needs while staying SYNCHRONOUS.
   *
   * `signals` is optional and is the whole reason this is one added line in the
   * reconciliation rather than a second collection: the nightly job has already
   * collected the set, and re-collecting it here would double the query budget of
   * the most expensive job in the app.
   *
   * NEVER throws — a failed register read leaves an empty register, which the
   * engine reports as `no_standards` on every rule that needs one.
   */
  async prepare(schoolId: string, at: Date, signals?: TwinSignalSet): Promise<TwinSignalSet> {
    const set = signals ?? (await this.twinSignals.collect(schoolId, { now: at }))
    // Pessimistic until the register read proves itself. A caller that asks
    // `registerAvailableFor` after a prepare that threw gets `false`, which is the
    // answer that costs nothing (a skipped sweep) rather than the one that clears
    // a ledger.
    this.registerHealthBySet.set(set, false)
    try {
      // Entitlement is READ OFF THE SIGNAL SET rather than re-queried: the
      // collector already resolved it fail-closed, and a signal that came back
      // `not_licensed` is the definitive statement that its module is not
      // licensed. This costs zero billing calls and cannot disagree with the
      // live signals — a prior read the live payload would refuse is impossible.
      // `not_tracked` PROVES NOTHING and must not be counted as proof.
      // `resolveOne` returns it from step 1, BEFORE the licence check in step 2 —
      // so `hr.pd_participation`, `hr.staff_evaluations`, `safe.clearances` and
      // `fac.inspections` come back `not_tracked` for a school that has bought
      // neither HR nor Facilities, and reading "not not_licensed" as "licensed"
      // added both modules to this set for a finance-only school. `no_data`, by
      // contrast, is only reachable after the licence check passes, so it IS
      // proof and is deliberately still counted — a licensed module with no
      // readings yet must not lose its prior facts. The moment Phases F/K ship a
      // `declaredNotTracked` signal on a module that has prior facts, the old
      // test would have queried that module's tables for a school that never
      // bought it, through a back door in the reader.
      const entitled = new Set<ModuleKey>()
      for (const s of set.signals) {
        if (!s.moduleKey) continue
        if (s.availability === 'not_licensed' || s.availability === 'not_tracked') continue
        entitled.add(s.moduleKey)
      }
      const live: Record<string, string | null> = {}
      for (const s of set.signals) live[s.key] = s.observedOn

      const [{ register, weights, registerAvailable }, priors] = await Promise.all([
        this.twinRegister.build(schoolId, at),
        this.priorFacts.collect(schoolId, entitled, live),
      ])
      this.cache.set(set, { register, priors })
      this.weightsBySet.set(set, weights)
      this.registerHealthBySet.set(set, registerAvailable)
    } catch (err) {
      this.logger.warn(`twin prepare failed for ${schoolId}: ${(err as Error).message}`)
    }
    return set
  }

  /**
   * DID THE REGISTER READ SUCCEED for the set most recently prepared?
   *
   * Every rule needs a school standard code, so an unreadable register makes all
   * twenty-two refuse — indistinguishable, from the outside, from "everything
   * stopped firing". Any caller with write authority over the findings ledger
   * MUST consult this before concluding that a finding stopped firing; a run that
   * could not read the register has no standing to say anything is resolved.
   *
   * Defaults to `false` for a set that was never prepared: the conservative
   * answer is the one that declines to clear.
   */
  registerAvailableFor(set: TwinSignalSet): boolean {
    return this.registerHealthBySet.get(set) ?? false
  }

  private readonly registerHealthBySet = new WeakMap<TwinSignalSet, boolean>()

  /** Domain weights for the set most recently prepared. Dies with the set. */
  private readonly weightsBySet = new WeakMap<
    TwinSignalSet,
    Record<string, Readonly<Partial<Record<DomainKey, number>>>>
  >()

  /**
   * The full twin for one school: live derivation merged with ledger lifecycle.
   *
   * The derivation happens twice, and the reason is structural rather than lazy —
   * see `TwinContextRegistry.deriveWithDomains`. `resolvePrimaryDomains` is the
   * ONE authority on the >= 0.5 domain-attribution rule and it needs facts as
   * input, so the primary-domain map cannot exist before the first pass.
   */
  async getTwin(
    schoolId: string,
    query: TwinQueryDto = {},
    at: Date = new Date(),
  ): Promise<TwinResponse> {
    const set = await this.prepare(schoolId, at)

    // Pass 1 — the memoised derivation the rules themselves use.
    const first = this.cache.derive(set, at)
    const weights = this.weightsBySet.get(set) ?? {}
    const primary = resolvePrimaryDomains(first.findings.map(toFiredFinding), weights)
    // Pass 2 — the same pure function, with the resolved map folded in. Only
    // `domainBands` differs; everything else is byte-identical by determinism.
    const result = this.cache.deriveWithDomains(set, at, Object.fromEntries(primary))

    const rows = await this.prisma.accreditationFinding
      .findMany({ where: { schoolId } })
      .catch((err) => {
        // Fail-soft: a missing table (deploy order) or a read error degrades to
        // "no lifecycle yet", never to a 500 on a page whose whole job is to be
        // the honest picture.
        this.logger.warn(`findings ledger read failed for ${schoolId}: ${(err as Error).message}`)
        return [] as AccreditationFinding[]
      })
    const byKey = new Map(rows.map((r) => [r.findingKey, r]))

    const includeCleared = query.includeCleared === true
    const firedKeys = new Set<string>()
    const findings: FindingPublic[] = []

    for (const f of result.findings) {
      // THE one formula, shared with packages/compliance so the reader (here),
      // the nightly ledger writer and the improvement recommender can never
      // fork on what a findingKey is.
      const findingKey = composeFindingKey(f.ruleId, f.scopeKey)
      firedKeys.add(findingKey)
      const row = byKey.get(findingKey) ?? null
      // A human CLOSED it and the rule still fires. That is a real state and it
      // is deliberately not shouted about: the human's decision stands until they
      // reopen it, but `includeCleared` still surfaces it for review.
      if (row && (row.status === 'resolved' || row.status === 'dismissed') && !includeCleared) {
        continue
      }
      findings.push(this.mergeLive(f, findingKey, row))
    }

    const cleared: FindingPublic[] = []
    if (includeCleared) {
      for (const row of rows) {
        if (firedKeys.has(row.findingKey)) continue
        cleared.push(this.fromLedgerRow(row))
      }
    }

    return {
      ...result,
      findings: this.applyFilters(findings, query),
      cleared: this.applyFilters(cleared, query),
      // The roster the Signals tab is built on. `set` is the collection `prepare`
      // just made, so this costs no query and cannot disagree with the findings
      // beside it.
      signals: set.signals.map((s) => ({
        key: s.key,
        label: s.label,
        availability: s.availability,
        unavailableReason: s.unavailableReason,
        moduleKey: s.moduleKey,
        observedOn: s.observedOn,
        ageDays: s.ageDays,
        changeState: s.changeState,
        domainKeys: [...s.domainKeys],
      })),
    }
  }

  // ── The four human actions ────────────────────────────────────────────────

  /**
   * ACK: "seen, come back in 45 days." Sets BOTH `ackedUntil` and `mutedUntil` to
   * the same instant — an ack that did not silence the notification would be a
   * button that changes nothing a user can feel.
   *
   * `lastNotifiedAt` is deliberately NOT cleared: clearing it would make clause
   * (a) of `shouldNotify` true the moment the mute lapsed AND clause (d) true as
   * well, which is the same email twice.
   */
  async ack(
    schoolId: string,
    findingId: string,
    dto: AckFindingDto,
    userId: string,
    at: Date = new Date(),
  ): Promise<FindingPublic> {
    const until = new Date(at.getTime() + ACK_WINDOW_DAYS * DAY_MS)
    const row = await this.writeFinding(schoolId, findingId, {
      status: 'acknowledged',
      ackedUntil: until,
      mutedUntil: until,
      mutedReason: dto.reason?.trim() || 'Acknowledged',
      ackedByUserId: userId,
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'accreditation.finding.acked',
      targetType: 'accreditation_findings',
      targetId: row.id,
      metadata: { ruleId: row.ruleId, until: until.toISOString(), reason: dto.reason ?? null },
    })
    return this.fromLedgerRow(row)
  }

  /** MUTE for N days, with a stated reason. `days: 0` is the UNMUTE. */
  async mute(
    schoolId: string,
    findingId: string,
    dto: MuteFindingDto,
    userId: string,
    at: Date = new Date(),
  ): Promise<FindingPublic> {
    const unmute = dto.days === 0
    const until = unmute ? null : new Date(at.getTime() + dto.days * DAY_MS)
    const row = await this.writeFinding(schoolId, findingId, {
      status: unmute ? 'open' : 'muted',
      mutedUntil: until,
      // An unmute clears the ack window too: "not now" is over, in both forms.
      ackedUntil: unmute ? null : undefined,
      mutedReason: unmute ? null : dto.reason.trim(),
    })
    await this.audit.write({
      schoolId,
      userId,
      action: unmute ? 'accreditation.finding.unmuted' : 'accreditation.finding.muted',
      targetType: 'accreditation_findings',
      targetId: row.id,
      metadata: { ruleId: row.ruleId, days: dto.days, reason: unmute ? null : dto.reason },
    })
    return this.fromLedgerRow(row)
  }

  /**
   * The HUMAN status transition — the only writer of `status` outside ack/mute,
   * and the only place `resolutionKind: 'dismissed'` is ever written.
   *
   * Reconciliation cannot reach any of this: `ReconcileWrite` has no `status`,
   * and Phase E did not add one.
   */
  async setStatus(
    schoolId: string,
    findingId: string,
    dto: FindingStatusDto,
    userId: string,
  ): Promise<FindingPublic> {
    const reopening = dto.status === 'open'
    const row = await this.writeFinding(schoolId, findingId, {
      status: dto.status,
      // 'dismissed' is a HUMAN resolution; the nightly job writes only
      // 'improved' and 'stale_data'.
      resolutionKind: dto.status === 'dismissed' ? 'dismissed' : undefined,
      mutedUntil: reopening ? null : undefined,
      ackedUntil: reopening ? null : undefined,
      mutedReason: reopening ? null : undefined,
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'accreditation.finding.status',
      targetType: 'accreditation_findings',
      targetId: row.id,
      metadata: { ruleId: row.ruleId, status: dto.status, note: dto.note ?? null },
    })
    return this.fromLedgerRow(row)
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /**
   * Every mutation is an `updateMany` scoped by `schoolId`, and the tenancy rides
   * on the WRITE — not merely on a read that produced the id. A cross-tenant id
   * writes ZERO rows and 404s, which is the same answer an unknown id gets, so
   * the route leaks nothing about what exists elsewhere.
   */
  private async writeFinding(
    schoolId: string,
    findingId: string,
    data: Record<string, unknown>,
  ): Promise<AccreditationFinding> {
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
    const res = await this.prisma.accreditationFinding.updateMany({
      where: { id: findingId, schoolId },
      data: clean,
    })
    if (res.count === 0) throw new NotFoundException('Finding not found.')
    const row = await this.prisma.accreditationFinding.findFirst({
      where: { id: findingId, schoolId },
    })
    if (!row) throw new NotFoundException('Finding not found.')
    return row
  }

  private applyFilters(items: FindingPublic[], query: TwinQueryDto): FindingPublic[] {
    let out = items
    if (query.severity) out = out.filter((f) => f.severity === query.severity)
    if (query.ruleId) out = out.filter((f) => f.ruleId === query.ruleId)
    return out
  }

  /** Live finding + ledger row. The live side owns the CONTENT, always. */
  private mergeLive(
    f: TwinFinding,
    findingKey: string,
    row: AccreditationFinding | null,
  ): FindingPublic {
    return {
      ruleId: f.ruleId,
      scopeKey: f.scopeKey,
      factKey: f.factKey,
      title: f.title,
      rationale: f.rationale,
      evidence: f.evidence,
      standardTags: [...f.standardTags],
      domainKeys: [...f.domainKeys],
      severity: f.severity,
      likelihood: f.likelihood,
      confidence: f.confidence,
      horizon: f.horizon,
      consequence: f.consequence,
      id: row?.id ?? null,
      findingKey,
      status: (row?.status as FindingStatus) ?? 'open',
      firstSeenAt: iso(row?.firstSeenAt ?? null),
      lastSeenAt: iso(row?.lastSeenAt ?? null),
      // It fires LIVE, so it is not cleared, whatever a stale ledger row says.
      clearedAt: null,
      resolutionKind: null,
      mutedUntil: iso(row?.mutedUntil ?? null),
      ackedUntil: iso(row?.ackedUntil ?? null),
      mutedReason: row?.mutedReason ?? null,
      reopenCount: row?.reopenCount ?? 0,
      initiativeId: row?.initiativeId ?? null,
      isDemo: row?.isDemo ?? false,
      findingCleared: false,
      clearedCopy: null,
    }
  }

  /**
   * A finding rebuilt from its ledger row alone — for the cleared list and for the
   * mutation responses.
   *
   * The prose comes from the STORED `evidencePayload`, composed by the pure engine
   * at the time it fired and numerically validated then. It is never recomposed
   * here: a sentence about a number must be written where the number was checked.
   */
  private fromLedgerRow(row: AccreditationFinding): FindingPublic {
    const payload = (row.evidencePayload ?? {}) as Record<string, unknown>
    const cleared = row.clearedAt !== null
    return {
      ruleId: row.ruleId,
      scopeKey: row.scopeKey,
      factKey: row.factKey,
      title: typeof payload.title === 'string' ? payload.title : row.ruleId,
      rationale: typeof payload.rationale === 'string' ? payload.rationale : '',
      evidence: Array.isArray(payload.evidence) ? (payload.evidence as TwinEvidenceEntry[]) : [],
      standardTags: [...row.standardTags],
      domainKeys: row.domainKeys as DomainKey[],
      severity: row.severity,
      likelihood: row.likelihood ?? 'possible',
      confidence: row.confidence,
      horizon: (payload.horizon as TwinFinding['horizon']) ?? {
        kind: row.horizonKind as TwinFinding['horizon']['kind'],
        value: null,
        confidence: null,
        reason: null,
      },
      consequence: typeof payload.consequence === 'string' ? payload.consequence : '',
      id: row.id,
      findingKey: row.findingKey,
      status: row.status as FindingStatus,
      firstSeenAt: iso(row.firstSeenAt),
      lastSeenAt: iso(row.lastSeenAt),
      clearedAt: iso(row.clearedAt),
      resolutionKind: (row.resolutionKind as FindingResolutionKind | null) ?? null,
      mutedUntil: iso(row.mutedUntil),
      ackedUntil: iso(row.ackedUntil),
      mutedReason: row.mutedReason,
      reopenCount: row.reopenCount,
      initiativeId: row.initiativeId,
      isDemo: row.isDemo,
      findingCleared: cleared && row.status !== 'resolved',
      clearedCopy: this.clearedCopyFor(row),
    }
  }

  /**
   * ACCEPTANCE 3, MECHANISED. A school that simply stopped uploading gets the
   * stale-data sentence, and that sentence does not contain the word "resolved" —
   * because "we lost sight of this" and "this is fixed" are different facts and a
   * product that renders them with the same word is lying to a school about its
   * own accreditation.
   */
  private clearedCopyFor(row: AccreditationFinding): string | null {
    if (row.clearedAt === null) return null
    const kind = (row.resolutionKind as FindingResolutionKind | null) ?? 'stale_data'
    const copy = CLEARED_COPY[kind] ?? CLEARED_COPY.stale_data
    return copy(isoDay(row.clearedAt))
  }

  /** Entitlement, fail-closed — used by Penny and by the digest. */
  async isLicensed(schoolId: string): Promise<boolean> {
    return this.billing.isEntitledForModule(schoolId, 'accreditation').catch(() => false)
  }
}
