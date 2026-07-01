import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PeriodsModule } from '../periods/periods.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { MappingModule } from '../mapping/mapping.module.js'
import { ComplianceModule } from '../compliance/compliance.module.js'
import { GovernanceModule } from '../governance/governance.module.js'
import { WorkflowModule } from '../workflow/workflow.module.js'
import { AccreditationModule } from '../accreditation/accreditation.module.js'
import { AnalyticsController } from './analytics.controller.js'
import { AnalyticsService } from './analytics.service.js'
import { InsightService } from './insight.service.js'
import { BriefingService } from './briefing.service.js'
import { OperationalController } from './operational.controller.js'
import { OperationalService } from './operational.service.js'
import { BudgetController } from './budget.controller.js'
import { BudgetService } from './budget.service.js'
import { BudgetRollupController } from './budget-rollup.controller.js'
import { BudgetRollupService } from './budget-rollup.service.js'
import { StatementsRollupController } from './statements-rollup.controller.js'
import { StatementsRollupService } from './statements-rollup.service.js'
import { OrgMetricsController } from './org-metrics.controller.js'
import { OrgMetricsService } from './org-metrics.service.js'
import { OrgBriefingController } from './org-briefing.controller.js'
import { OrgBriefingService } from './org-briefing.service.js'
import { DashboardController } from './dashboard.controller.js'
import { DashboardService } from './dashboard.service.js'
import { AssistantClient } from '../assistant/assistant.client.js'

/**
 * Phase 4A Analytics & Insights. Reads existing statement_snapshots (no new DB
 * table/migration) and computes Tier-1 financial metrics via the pure
 * @finrep/analytics package. AuthModule supplies JwtAuthGuard/RolesGuard;
 * BillingModule supplies the reused EntitlementGuard; PeriodsModule supplies
 * tenant-checked period lookups. PrismaService is global.
 */
@Module({
  // GovernanceModule exports PoliciesService for BriefingService's 'governance'
  // STEP; WorkflowModule exports TasksService for the 'workflow' STEP. Both edges
  // are analytics → X ONLY (neither imports analytics) — acyclic. BillingModule
  // already here supplies BillingService for the governance gate.
  imports: [
    AuthModule,
    PeriodsModule,
    BillingModule,
    AuditModule,
    MappingModule,
    ComplianceModule,
    GovernanceModule,
    WorkflowModule,
    // Exports AccreditationService for BriefingService's 'accreditation' STEP.
    // Edge is analytics → accreditation ONLY (accreditation does not import
    // analytics) — acyclic, same as governance.
    AccreditationModule,
  ],
  controllers: [
    AnalyticsController,
    OperationalController,
    BudgetController,
    BudgetRollupController,
    StatementsRollupController,
    OrgMetricsController,
    OrgBriefingController,
    DashboardController,
  ],
  providers: [
    AnalyticsService,
    InsightService,
    BriefingService,
    OperationalService,
    BudgetService,
    BudgetRollupService,
    StatementsRollupService,
    OrgMetricsService,
    OrgBriefingService,
    DashboardService,
    // Re-provide the STATELESS leaf AssistantClient here (it only needs the
    // global ConfigService) for BudgetService.advise(). We deliberately do NOT
    // import AssistantModule — it already imports AnalyticsModule, so that would
    // be a circular import. A second AssistantClient instance is harmless.
    AssistantClient,
  ],
  exports: [InsightService, AnalyticsService, OperationalService, BudgetService, BudgetRollupService, StatementsRollupService, OrgMetricsService, BriefingService],
})
export class AnalyticsModule {}
