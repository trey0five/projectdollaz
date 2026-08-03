import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PeriodsModule } from '../periods/periods.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { AnalyticsModule } from '../analytics/analytics.module.js'
import { VisitModule } from '../visit/visit.module.js'
import { ReportScheduleController } from './report-schedule.controller.js'
import { ReportScheduleService } from './report-schedule.service.js'

/**
 * Phase 3 scheduled board-summary delivery. AnalyticsModule exports InsightService
 * (the email body); AuthModule supplies guards + MailerService; PeriodsModule
 * resolves the school's latest snapshot period; BillingModule the EntitlementGuard.
 *
 * AIC Phase H adds VisitModule for VisitService: the scheduled board email now
 * carries the SAME executive summary the printed Board Readiness One-Pager
 * renders, which is why the two can never drift. The edge is
 * report-schedule → visit and VisitModule imports nothing from here, so the
 * graph stays acyclic. The accreditation block is FAIL-SOFT in every degraded
 * case — an unlicensed school, no framework, or any throw leaves the email
 * byte-identical to today. NO new schedule `kind`, NO column, NO migration.
 */
@Module({
  imports: [AuthModule, PeriodsModule, BillingModule, AuditModule, AnalyticsModule, VisitModule],
  controllers: [ReportScheduleController],
  providers: [ReportScheduleService],
})
export class ReportScheduleModule {}
