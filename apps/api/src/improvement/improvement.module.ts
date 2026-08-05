import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { StrategyModule } from '../strategy/strategy.module.js'
import { AccreditationModule } from '../accreditation/accreditation.module.js'
import { ImprovementController } from './improvement.controller.js'
import { ImprovementService } from './improvement.service.js'
import { ImprovementPlanDrafterService } from './improvement-plan-drafter.service.js'
import { TaskRollupRecorderService } from './task-rollup-recorder.service.js'

/**
 * AIC Phase G — the Continuous Improvement Manager.
 *
 * BOOT SAFETY, WHICH ON THIS CODEBASE IS NOT A THEORETICAL CONCERN. This module
 * does NOT import AnalyticsModule, directly or transitively: AuthModule,
 * BillingModule, AuditModule, StrategyModule and AccreditationModule each import
 * only Auth/Billing/Audit. The mutual-service dependency class ("Cannot access 'X'
 * before initialization") has crash-looped this container twice, and the metric
 * numbers this feature needs arrive through StrategyProgressService — which
 * injects PrismaService plus the PURE @finrep/analytics functions and no service
 * at all.
 *
 * THE TWO INJECTED DOMAIN SERVICES, and why they are services rather than a
 * second copy of their maths:
 *   • StrategyProgressService — `resolveCurrentMetric` / `resolveCurrentMetrics`,
 *     so a metric-bound initiative shows the SAME number as the dashboard and the
 *     strategic plan. StrategyModule did not export it before this phase; it does
 *     now, and `improvement.module.spec.ts` is what makes that provable rather
 *     than hoped for.
 *   • AccreditationReadinessService — the gaps and their index lifts, VERBATIM.
 *     Recomputing gaps here is how the recommendation rail and the readiness hero
 *     would end up quoting different numbers for the same move.
 *   • BillingService — the PER-SOURCE entitlement check. The controller's
 *     @RequiresModule is OR over ('accreditation','strategy'), which is right for
 *     the page; the recommendation rail is built from accreditation-module data
 *     and needs the narrower gate. BillingModule was already imported for the
 *     guard and exports the service, so the module graph is unchanged.
 *
 * The edges added are improvement → strategy and improvement → accreditation.
 * Both already exist from analytics; neither target imports this module, so the
 * graph stays acyclic. AssistantModule imports THIS module (for Penny's
 * create_initiative), never the reverse.
 */
@Module({
  imports: [AuthModule, BillingModule, AuditModule, StrategyModule, AccreditationModule],
  controllers: [ImprovementController],
  // AIC Phase J — ImprovementPlanDrafterService is Penny's MODE-A drafter. It
  // injects PrismaService + ImprovementService only (no LLM client, by spec MA-3),
  // so it adds no module edge at all: everything it needs is already in this
  // module's graph.
  // TaskRollupRecorderService is the nightly recorder the ImprovementProgressEvent
  // schema comment promised: it injects PrismaService ONLY, adds no module edge,
  // and is deliberately NOT exported — nothing calls it; it runs on its own clock.
  providers: [ImprovementService, ImprovementPlanDrafterService, TaskRollupRecorderService],
  // EXPORTED for exactly one consumer: AssistantModule, for Penny's
  // create_initiative tool and its reverser. A provider injected but not exported
  // killed the API on boot in Phase E while every unit test passed. The drafter
  // joins the exported set for exactly the same reason and the same consumer.
  exports: [ImprovementService, ImprovementPlanDrafterService],
})
export class ImprovementModule {}
