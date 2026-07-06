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
  providers: [QboService, QboOrgService, OrgQboCompanyService, QboDrillService, QboClient],
  // QboDrillService is exported so AssistantModule's get_account_transactions handler
  // can reuse the exact same drill orchestrator the REST route uses.
  exports: [QboService, QboDrillService],
})
export class IntegrationsModule {}
