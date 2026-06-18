import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PeriodsModule } from '../periods/periods.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { AnalyticsModule } from '../analytics/analytics.module.js'
import { ReportScheduleController } from './report-schedule.controller.js'
import { ReportScheduleService } from './report-schedule.service.js'

/**
 * Phase 3 scheduled board-summary delivery. AnalyticsModule exports InsightService
 * (the email body); AuthModule supplies guards + MailerService; PeriodsModule
 * resolves the school's latest snapshot period; BillingModule the EntitlementGuard.
 */
@Module({
  imports: [AuthModule, PeriodsModule, BillingModule, AuditModule, AnalyticsModule],
  controllers: [ReportScheduleController],
  providers: [ReportScheduleService],
})
export class ReportScheduleModule {}
