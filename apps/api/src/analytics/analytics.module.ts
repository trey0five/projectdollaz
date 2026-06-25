import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PeriodsModule } from '../periods/periods.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { AnalyticsController } from './analytics.controller.js'
import { AnalyticsService } from './analytics.service.js'
import { InsightService } from './insight.service.js'
import { OperationalController } from './operational.controller.js'
import { OperationalService } from './operational.service.js'
import { BudgetController } from './budget.controller.js'
import { BudgetService } from './budget.service.js'
import { BudgetRollupController } from './budget-rollup.controller.js'
import { BudgetRollupService } from './budget-rollup.service.js'
import { DashboardController } from './dashboard.controller.js'
import { DashboardService } from './dashboard.service.js'

/**
 * Phase 4A Analytics & Insights. Reads existing statement_snapshots (no new DB
 * table/migration) and computes Tier-1 financial metrics via the pure
 * @finrep/analytics package. AuthModule supplies JwtAuthGuard/RolesGuard;
 * BillingModule supplies the reused EntitlementGuard; PeriodsModule supplies
 * tenant-checked period lookups. PrismaService is global.
 */
@Module({
  imports: [AuthModule, PeriodsModule, BillingModule, AuditModule],
  controllers: [
    AnalyticsController,
    OperationalController,
    BudgetController,
    BudgetRollupController,
    DashboardController,
  ],
  providers: [
    AnalyticsService,
    InsightService,
    OperationalService,
    BudgetService,
    BudgetRollupService,
    DashboardService,
  ],
  exports: [InsightService, AnalyticsService, BudgetService, BudgetRollupService],
})
export class AnalyticsModule {}
