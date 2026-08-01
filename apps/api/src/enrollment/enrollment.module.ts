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
import { DiocesanEnrollmentController } from './diocesan/diocesan-enrollment.controller.js'
import { DiocesanEnrollmentService } from './diocesan/diocesan-enrollment.service.js'
import { NameMatchService } from './diocesan/name-match.service.js'
import { StudentsController } from './students/students.controller.js'
import { StudentsService } from './students/students.service.js'

/**
 * Phase 2 — Enrollment Intelligence. Owns the per-school SIS/roster connector and the
 * intake→promote pipeline (writes PeriodOperationalData.enrollment via a direct prisma
 * upsert). Guard chain provided by AuthModule (Jwt) + BillingModule (EntitlementGuard).
 * Deliberately does NOT import AnalyticsModule — the briefing reads the promoted
 * operational value; there is no snapshot facade in v1, so no module cycle.
 */
@Module({
  imports: [AuthModule, PeriodsModule, BillingModule, AuditModule],
  controllers: [EnrollmentController, DiocesanEnrollmentController, StudentsController],
  providers: [
    EnrollmentService,
    StudentsService,
    EnrollmentClient,
    OneRosterCsvAdapter,
    BlackbaudAdapter,
    OneRosterApiAdapter,
    FactsAdapter,
    VeracrossAdapter,
    DiocesanEnrollmentService,
    NameMatchService,
  ],
  // AIC Phase D: StudentsService is exported so the accreditation twin can read
  // FERPA-safe AGGREGATE roster counts through the service that owns them, rather
  // than issuing its own prisma.student query. Additive; no behaviour change.
  exports: [EnrollmentService, DiocesanEnrollmentService, StudentsService],
})
export class EnrollmentModule {}
