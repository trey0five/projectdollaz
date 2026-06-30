import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PeriodsModule } from '../periods/periods.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { MappingModule } from '../mapping/mapping.module.js'
import { AnalyticsController } from './analytics.controller.js'
import { AnalyticsService } from './analytics.service.js'
import { InsightService } from './insight.service.js'
import { OperationalController } from './operational.controller.js'
import { OperationalService } from './operational.service.js'
import { BudgetController } from './budget.controller.js'
import { BudgetService } from './budget.service.js'
import { BudgetRollupController } from './budget-rollup.controller.js'
import { BudgetRollupService } from './budget-rollup.service.js'
import { StatementsRollupController } from './statements-rollup.controller.js'
import { StatementsRollupService } from './statements-rollup.service.js'
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
  imports: [AuthModule, PeriodsModule, BillingModule, AuditModule, MappingModule],
  controllers: [
    AnalyticsController,
    OperationalController,
    BudgetController,
    BudgetRollupController,
    StatementsRollupController,
    DashboardController,
  ],
  providers: [
    AnalyticsService,
    InsightService,
    OperationalService,
    BudgetService,
    BudgetRollupService,
    StatementsRollupService,
    DashboardService,
    // Re-provide the STATELESS leaf AssistantClient here (it only needs the
    // global ConfigService) for BudgetService.advise(). We deliberately do NOT
    // import AssistantModule — it already imports AnalyticsModule, so that would
    // be a circular import. A second AssistantClient instance is harmless.
    AssistantClient,
  ],
  exports: [InsightService, AnalyticsService, OperationalService, BudgetService, BudgetRollupService, StatementsRollupService],
})
export class AnalyticsModule {}
