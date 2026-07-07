import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PeriodsModule } from '../periods/periods.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { ImportsModule } from '../imports/imports.module.js'
import { StatementsModule } from '../statements/statements.module.js'
import { MonthlyModule } from '../monthly/monthly.module.js'
import { MappingModule } from '../mapping/mapping.module.js'
import { QboController } from './qbo.controller.js'
import { QboOrgController } from './qbo-org.controller.js'
import { QboCompanyController } from './qbo-company.controller.js'
import { QboService } from './qbo.service.js'
import { QboOrgService } from './qbo-org.service.js'
import { OrgQboCompanyService } from './qbo-company.service.js'
import { QboDrillService } from './qbo-drill.service.js'
import { QboAgingService } from './qbo-aging.service.js'
import { OrgQboTokenService } from './qbo-org-token.service.js'
import { QboCashFlowService } from './qbo-cashflow.service.js'
import { QboSyncSchedulerService } from './qbo-sync-scheduler.service.js'
import { QboClient } from './qbo.client.js'

/**
 * Phase 6 — external integrations (QuickBooks Online). Reuses ImportsService +
 * StatementsService (the file-upload path) so a sync feeds the same engine and
 * auto-scan. Config-gated: disabled when QB_OAUTH_CLIENT_ID is unset.
 */
@Module({
  imports: [
    AuthModule,
    PeriodsModule,
    BillingModule,
    AuditModule,
    ImportsModule,
    StatementsModule,
    MonthlyModule,
    MappingModule,
  ],
  controllers: [QboController, QboOrgController, QboCompanyController],
  providers: [
    QboService,
    QboOrgService,
    OrgQboCompanyService,
    QboDrillService,
    QboAgingService,
    OrgQboTokenService,
    QboCashFlowService,
    QboSyncSchedulerService,
    QboClient,
  ],
  // QboDrillService is exported so AssistantModule's get_account_transactions handler
  // can reuse the exact same drill orchestrator the REST route uses. QboAgingService is
  // exported so the /cash controller + Penny's get_cash_collections tool (AssistantModule)
  // share the one aging orchestrator; the briefing does NOT use it (it reads the snapshot
  // directly via Prisma — the module rule that keeps AnalyticsModule off IntegrationsModule).
  // QboCashFlowService is exported for the same reason (the /cash cashflow route + Penny's
  // get_cash_flow tool share the one orchestrator; the briefing reads its snapshot via Prisma).
  // OrgQboTokenService is exported so QboAgingService can resolve it via ModuleRef
  // (lazy, cycle-safe) and any future org-fed consumer can reuse the one org-token
  // accessor. It's a LEAF (Prisma + QboClient only) so exporting adds no graph risk.
  exports: [QboService, QboDrillService, QboAgingService, OrgQboTokenService, QboCashFlowService],
})
export class IntegrationsModule {}
