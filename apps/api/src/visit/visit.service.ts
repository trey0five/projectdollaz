import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { composeMockVisit } from '@finrep/compliance'
import type { VisitInput, VisitResult } from '@finrep/compliance'
import { EarlyWarningService } from '../twin/early-warning.service.js'
import { AccreditationCommendationsService } from '../accreditation-signals/commendations.service.js'
import {
  AccreditationEvidenceReadinessService,
  type EvidenceGroup,
} from '../accreditation/evidence-readiness.service.js'
import { AccreditationReadinessService } from '../accreditation/readiness.service.js'
import { READINESS_DISCLAIMER } from '../accreditation/readiness-history.service.js'
import { ImprovementService } from '../improvement/improvement.service.js'
import type { VisitQueryDto } from './dto/visit-query.dto.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase H — THE MOCK VISIT, assembled.
//
// This service READS and PASSES. It composes no sentence: every act, every
// frozen "we could not read this" line and the executive summary come out of the
// pure `composeMockVisit`, which is the one place a Mock Visit is described. Even
// the degraded copy lives there — this file passes `null` (the FACT that a read
// failed) rather than a wording, so there is exactly one spelling per failure and
// a spec in packages/compliance can pin it.
//
// THE GATE LIVES HERE, NOT ONLY ON THE CONTROLLER. `VisitController` carries
// `@RequiresModule('accreditation')`, and for a long time that was the ONLY
// entitlement check on this path — which is fine right up until a second,
// in-process caller appears. One did: the board-summary scheduler calls
// `getVisit` directly, bypassing every guard, and NOTHING downstream re-checks
// (`getTwin`, `getCommendations`, `getEvidenceReadiness` and `getReadiness` all
// take Prisma and ask billing nothing; `getRecommendations` degrades rather than
// throwing). So an unlicensed school's board received six accreditation
// paragraphs and a link to a page that 402s. The scheduler's fail-soft `catch`
// could not fire, because nothing ever threw.
//
// A fail-soft caller can only be as safe as the 402 it is catching, so the 402 is
// now produced by the method itself. `isLicensed` is fail-closed (a billing read
// that throws answers `false`), the controller path is unchanged (its guard 402s
// first and this check then costs one cached billing read), and the scheduler's
// existing catch finally has something to catch.
//
// THE TWIN IS REQUIRED. Everything else degrades. That asymmetry is deliberate:
// a Mock Visit without commendations is a Mock Visit with no strengths listed,
// but a Mock Visit without findings is not a degraded Mock Visit — it is a lie of
// omission, and it is the single most dangerous thing this feature could render.
// So `getTwin` has no `.catch` and the request fails with whatever it threw
// (including the 402 an unlicensed school should get).
//
// NOTHING HERE TOUCHES AN LLM. Not the drafter, not the summary, not the
// narration. Penny's advisory layer is a later phase.
// ─────────────────────────────────────────────────────────────────────────────

/** The composed payload, with the API's own `EvidenceGroup` carried through Act 4. */
export type VisitResponse = VisitResult<EvidenceGroup>

@Injectable()
export class VisitService {
  private readonly logger = new Logger(VisitService.name)

  constructor(
    private readonly earlyWarning: EarlyWarningService,
    private readonly commendations: AccreditationCommendationsService,
    private readonly evidenceReadiness: AccreditationEvidenceReadinessService,
    private readonly readiness: AccreditationReadinessService,
    private readonly improvement: ImprovementService,
  ) {}

  async getVisit(
    schoolId: string,
    query: VisitQueryDto = {},
    at: Date = new Date(),
  ): Promise<VisitResponse> {
    // FAIL-CLOSED, AND BEFORE ANY READ. See the header: the controller's guard is
    // not the only way into this method. The body matches EntitlementGuard's
    // (`code` + `module`) so every existing client parser reads it unchanged; it
    // carries no `message`, because the guard 402s first on the only path a user
    // can reach and an unreachable sentence is a sentence that goes stale.
    if (!(await this.earlyWarning.isLicensed(schoolId))) {
      throw new HttpException(
        { code: 'MODULE_NOT_LICENSED', module: 'accreditation' },
        HttpStatus.PAYMENT_REQUIRED,
      )
    }

    // A soft read: the reason it failed is logged, and the FACT that it failed
    // travels as `null`. Never a silent `[]` — "no strengths" and "we could not
    // look for strengths" are different sentences, and the composer owns both.
    const soft = (label: string) => (err: unknown): null => {
      this.logger.warn(`visit: ${label} unreadable for ${schoolId}: ${(err as Error)?.message}`)
      return null
    }

    const [twin, commendations, evidence, readiness, recommendations] = await Promise.all([
      // NO CATCH. See the header.
      this.earlyWarning.getTwin(schoolId, {}, at),
      this.commendations
        .getCommendations(schoolId, query.periodId ? { periodId: query.periodId } : {})
        .catch(soft('commendations')),
      this.evidenceReadiness.getEvidenceReadiness(schoolId, {}, at).catch(soft('evidence index')),
      this.readiness.getReadiness(schoolId, {}, at).catch(soft('readiness')),
      this.improvement.getRecommendations(schoolId, {}, at).catch(soft('recommendations')),
    ])

    const input: VisitInput<EvidenceGroup> = {
      now: at.toISOString(),
      framework: { code: twin.frameworkCode, name: evidence?.framework?.name ?? null },
      // The visit reads ONE framework, by design — the query DTO forbids a
      // caller-supplied override so a mock visit is always one accreditor's
      // visit. These are the OTHERS the school holds, named so the arrival act
      // can say what it is not reading.
      otherFrameworks: twin.otherFrameworks ?? [],
      // HAS A FRAMEWORK BEEN ADOPTED AT ALL? A fact, not a wording — and one the
      // composer cannot derive, because `selfScoredPct([])` and
      // `verifiedPctCurrent([])` are BOTH 0 by construction for a school with no
      // standards. Without this flag the Mock Visit told such a school
      // "documented readiness is 0%, defensible readiness is 0%" — a measured-
      // sounding score for a measurement that never happened, on the same page
      // that correctly says there is nothing to plan against.
      //
      // The readiness read resolves the framework from the school's own standard
      // rows and is the authority. When that read failed the arrival act is
      // unavailable anyway, so the twin's resolved code answers.
      frameworkAdopted: readiness ? readiness.framework !== null : twin.frameworkCode !== null,
      snapshotAsOf: twin.snapshotAsOf,
      // Either source calling this demonstration data makes it demonstration data.
      demoData: twin.demoData || (evidence?.demoData ?? false),
      // THE ONE DISCLAIMER, imported. packages/compliance never contains the
      // sentence — which is exactly why the composer takes it as an input.
      disclaimer: READINESS_DISCLAIMER,
      readiness: readiness
        ? {
            readinessPct: readiness.readinessPct,
            selfScoredPct: readiness.selfScoredPct,
            verifiedPct: readiness.verifiedPct,
            projectedIndex: readiness.projectedIndex,
            band: readiness.band,
            confidence: readiness.confidence,
          }
        : null,
      // Passed straight from /twin's own payload, so a finding on the Mock Visit
      // and the same finding on the Signals tab are the SAME OBJECT GRAPH.
      findings: twin.findings,
      notEvaluated: twin.notEvaluated,
      coverage: twin.coverage,
      signals: twin.signals,
      commendations,
      evidence: evidence
        ? { groups: evidence.groups, health: evidence.health, counts: evidence.counts }
        : null,
      recommendations: recommendations ? recommendations.recommendations : null,
      recommendationsBasis: recommendations ? recommendations.basis : null,
      adoptedKeys: recommendations?.adoptedKeys ?? [],
    }

    return composeMockVisit(input)
  }
}
