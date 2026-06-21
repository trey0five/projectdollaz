import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PeriodsModule } from '../periods/periods.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { AnalyticsModule } from '../analytics/analytics.module.js'
import { ComplianceModule } from '../compliance/compliance.module.js'
import { AssistantController } from './assistant.controller.js'
import { AssistantService } from './assistant.service.js'
import { AssistantClient } from './assistant.client.js'

/**
 * Phase 4D+ — agentic AI assistant. Reuses AnalyticsService/BudgetService (analytics)
 * and ComplianceService/ReconciliationService (compliance) as read-only tools, plus
 * PeriodsService for period resolution. AuthModule guards; BillingModule entitlement.
 */
@Module({
  imports: [AuthModule, PeriodsModule, BillingModule, AnalyticsModule, ComplianceModule],
  controllers: [AssistantController],
  providers: [AssistantService, AssistantClient],
})
export class AssistantModule {}
