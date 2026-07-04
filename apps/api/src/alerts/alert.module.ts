import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PeriodsModule } from '../periods/periods.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { AnalyticsModule } from '../analytics/analytics.module.js'
import { AlertsController } from './alerts.controller.js'
import { AlertService } from './alert.service.js'

/**
 * Phase 4E — proactive alerts / standing requests. MIRRORS ReportScheduleModule's
 * wiring: AnalyticsModule exports AnalyticsService (threshold metric) + InsightService
 * (digest body); AuthModule supplies the guards + MailerService; PeriodsModule resolves
 * the school's snapshot period; BillingModule the EntitlementGuard; AuditModule the
 * alert.created/fired log. AlertService is EXPORTED so AssistantModule can inject it for
 * Penny's create_alert confirm-tool.
 */
@Module({
  imports: [AuthModule, PeriodsModule, BillingModule, AuditModule, AnalyticsModule],
  controllers: [AlertsController],
  providers: [AlertService],
  exports: [AlertService],
})
export class AlertModule {}
