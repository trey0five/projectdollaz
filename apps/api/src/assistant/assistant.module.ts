import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PeriodsModule } from '../periods/periods.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { AnalyticsModule } from '../analytics/analytics.module.js'
import { ComplianceModule } from '../compliance/compliance.module.js'
import { BoardReportModule } from '../board-report/board-report.module.js'
import { ImportsModule } from '../imports/imports.module.js'
import { StatementsModule } from '../statements/statements.module.js'
import { WorkflowModule } from '../workflow/workflow.module.js'
import { KnowledgeModule } from '../knowledge/knowledge.module.js'
import { AssistantController } from './assistant.controller.js'
import { AssistantService } from './assistant.service.js'
import { AssistantClient } from './assistant.client.js'
import { AssistantTtsService } from './assistant-tts.service.js'
import { AssistantFilesService } from './assistant-files.service.js'

/**
 * Phase 4D+ — agentic AI assistant. Reuses AnalyticsService/BudgetService (analytics)
 * and ComplianceService/ReconciliationService (compliance) as read-only tools, plus
 * PeriodsService for period resolution. AuthModule guards; BillingModule entitlement.
 */
@Module({
  imports: [
    AuthModule,
    PeriodsModule,
    BillingModule,
    AnalyticsModule,
    ComplianceModule,
    BoardReportModule,
    ImportsModule,
    StatementsModule,
    WorkflowModule,
    KnowledgeModule,
  ],
  controllers: [AssistantController],
  providers: [AssistantService, AssistantClient, AssistantTtsService, AssistantFilesService],
})
export class AssistantModule {}
