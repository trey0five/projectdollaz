import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PeriodsModule } from '../periods/periods.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { ImportsModule } from '../imports/imports.module.js'
import { StatementsModule } from '../statements/statements.module.js'
import { QboController } from './qbo.controller.js'
import { QboService } from './qbo.service.js'
import { QboClient } from './qbo.client.js'

/**
 * Phase 6 — external integrations (QuickBooks Online). Reuses ImportsService +
 * StatementsService (the file-upload path) so a sync feeds the same engine and
 * auto-scan. Config-gated: disabled when QB_OAUTH_CLIENT_ID is unset.
 */
@Module({
  imports: [AuthModule, PeriodsModule, BillingModule, AuditModule, ImportsModule, StatementsModule],
  controllers: [QboController],
  providers: [QboService, QboClient],
})
export class IntegrationsModule {}
