import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { PeriodsModule } from '../periods/periods.module.js'
import { MonthlyModule } from '../monthly/monthly.module.js'
import { AnalyticsModule } from '../analytics/analytics.module.js'
import { SchedulesModule } from '../schedules/schedules.module.js'
import { ComplianceModule } from '../compliance/compliance.module.js'
import { IntegrationsModule } from '../integrations/integrations.module.js'
import { DataHubController } from './data-hub.controller.js'
import { DataHubService } from './data-hub.service.js'

/**
 * Unified "Data" hub (Phase X). A pure READ aggregation that fronts the existing
 * scattered ingestion surfaces with a single readiness endpoint
 * (GET /schools/:schoolId/periods/:periodId/data-status). It REUSES the existing
 * services unchanged:
 *  - PeriodsService          -> trial-balance roles + snapshot presence
 *  - MonthlySnapshotsService -> months-loaded count
 *  - OperationalService      -> enrollment / aid presence (from AnalyticsModule)
 *  - BudgetService           -> hasBudget (READ-ONLY .get; never mutated; from AnalyticsModule)
 *  - SchedulesService        -> capital/cash/campaign presence
 *  - ComplianceInputsService -> compliance-inputs presence
 *  - QboService              -> QuickBooks connection status
 *
 * AnalyticsModule is OFF-LIMITS and already exports BudgetService + Operational-
 * Service, so it is imported AS-IS — analytics.module.ts is NOT edited. AuthModule
 * supplies the JwtAuthGuard/RolesGuard; BillingModule the reused EntitlementGuard.
 * No new DB table, no writes, no audit.
 */
@Module({
  imports: [
    AuthModule,
    BillingModule,
    PeriodsModule,
    MonthlyModule,
    AnalyticsModule,
    SchedulesModule,
    ComplianceModule,
    IntegrationsModule,
  ],
  controllers: [DataHubController],
  providers: [DataHubService],
})
export class DataHubModule {}
