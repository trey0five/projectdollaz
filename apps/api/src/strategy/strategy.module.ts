import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { PlansController } from './plans.controller.js'
import { PillarsController } from './pillars.controller.js'
import { GoalsController } from './goals.controller.js'
import { InitiativesController } from './initiatives.controller.js'
import { StrategyService } from './strategy.service.js'
import { StrategyProgressService } from './strategy-progress.service.js'
import { StrategyPlanDrafterService } from './strategy-plan-drafter.service.js'

/**
 * Phase 5 Strategic Planning v1 — the plan → pillar → goal → initiative register and
 * the 7th licensable module ('strategy'), gated by the 'strategy' entitlement.
 *
 * BOOT-SAFETY (the #1 risk on this feature class — it has crash-looped the container
 * twice with "Cannot access 'X' before initialization"): this module imports ONLY
 * AuthModule (guards), BillingModule (the reused EntitlementGuard + BillingService),
 * and AuditModule. It does NOT import AnalyticsModule. The heavy metric compute is
 * done by StrategyProgressService, which injects **PrismaService ONLY** + the PURE
 * @finrep/analytics functions — never AnalyticsService/OperationalService/Tasks/
 * Briefing. The ONLY new module edge is AnalyticsModule → StrategyModule (analytics
 * injects the exported StrategyService into BriefingService for STEP 2.13). That edge
 * is one-directional/acyclic — StrategyModule NEVER imports AnalyticsModule.
 * Byte-for-byte the AccreditationModule posture.
 */
@Module({
  imports: [AuthModule, BillingModule, AuditModule],
  controllers: [PlansController, PillarsController, GoalsController, InitiativesController],
  // StrategyPlanDrafterService (Penny's "draft the plan" generator) is EXPORTED so the
  // AssistantModule (which already imports StrategyModule one-directionally) can inject
  // it — no new module edge. It injects Prisma + StrategyProgressService + pure
  // @finrep/analytics only (same boot-safe posture as StrategyProgressService).
  providers: [StrategyService, StrategyProgressService, StrategyPlanDrafterService],
  exports: [StrategyService, StrategyPlanDrafterService],
})
export class StrategyModule {}
