import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PeriodsModule } from '../periods/periods.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { AnalyticsModule } from '../analytics/analytics.module.js'
import { SchedulesModule } from '../schedules/schedules.module.js'
import { AssistantClient } from '../assistant/assistant.client.js'
import { BoardReportController } from './board-report.controller.js'
import { BoardReportService } from './board-report.service.js'

/**
 * Phase-1 Board Report. Reuses AnalyticsService + BudgetService (AnalyticsModule)
 * for the budget-vs-actual + statement assembly, PeriodsService for tenant-checked
 * lookups, AuditModule for the saved audit. AuthModule supplies the guards;
 * BillingModule the reused EntitlementGuard.
 *
 * The AssistantClient is RE-PROVIDED here (a stateless leaf that only needs the
 * global ConfigService) rather than importing AssistantModule — AssistantModule
 * imports THIS module (for the board-report assistant tools), so importing it
 * back would be a circular dependency. A second AssistantClient instance is
 * harmless, exactly as AnalyticsModule does for BudgetService.advise().
 */
@Module({
  imports: [AuthModule, PeriodsModule, BillingModule, AuditModule, AnalyticsModule, SchedulesModule],
  controllers: [BoardReportController],
  providers: [BoardReportService, AssistantClient],
  exports: [BoardReportService],
})
export class BoardReportModule {}
