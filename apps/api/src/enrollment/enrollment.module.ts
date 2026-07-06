import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PeriodsModule } from '../periods/periods.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { EnrollmentController } from './enrollment.controller.js'
import { EnrollmentService } from './enrollment.service.js'
import { EnrollmentClient } from './enrollment.client.js'
import { OneRosterCsvAdapter } from './adapters/oneroster-csv.adapter.js'
import { BlackbaudAdapter } from './adapters/blackbaud.adapter.js'
import { OneRosterApiAdapter } from './adapters/oneroster-api.adapter.js'
import { FactsAdapter } from './adapters/facts.adapter.js'
import { VeracrossAdapter } from './adapters/veracross.adapter.js'

/**
 * Phase 2 — Enrollment Intelligence. Owns the per-school SIS/roster connector and the
 * intake→promote pipeline (writes PeriodOperationalData.enrollment via a direct prisma
 * upsert). Guard chain provided by AuthModule (Jwt) + BillingModule (EntitlementGuard).
 * Deliberately does NOT import AnalyticsModule — the briefing reads the promoted
 * operational value; there is no snapshot facade in v1, so no module cycle.
 */
@Module({
  imports: [AuthModule, PeriodsModule, BillingModule, AuditModule],
  controllers: [EnrollmentController],
  providers: [
    EnrollmentService,
    EnrollmentClient,
    OneRosterCsvAdapter,
    BlackbaudAdapter,
    OneRosterApiAdapter,
    FactsAdapter,
    VeracrossAdapter,
  ],
  exports: [EnrollmentService],
})
export class EnrollmentModule {}
