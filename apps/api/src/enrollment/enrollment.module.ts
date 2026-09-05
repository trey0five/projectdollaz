import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PeriodsModule } from '../periods/periods.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { AnalyticsModule } from '../analytics/analytics.module.js'
import { KnowledgeModule } from '../knowledge/knowledge.module.js'
import { EnrollmentController } from './enrollment.controller.js'
import { EnrollmentService } from './enrollment.service.js'
import { RosterUploadService } from './roster-upload.service.js'
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
import { EnrollmentAnalyticsService } from './analytics/enrollment-analytics.service.js'

/**
 * Phase 2 — Enrollment Intelligence. Owns the per-school SIS/roster connector and the
 * intake→promote pipeline (writes PeriodOperationalData.enrollment via a direct prisma
 * upsert). Guard chain provided by AuthModule (Jwt) + BillingModule (EntitlementGuard).
 * Deliberately does NOT import AnalyticsModule — the briefing reads the promoted
 * operational value; there is no snapshot facade in v1, so no module cycle.
 */
@Module({
  // AnalyticsModule is imported for ONE exported provider: EnrollmentPlanService,
  // which owns the plan-resolution CONTRACT the analytics tab needs per grade. The
  // edge is enrollment → analytics ONLY — AnalyticsModule imports neither this
  // module nor anything that reaches it (academics/twin/assistant are the only
  // importers of EnrollmentModule, and analytics imports none of them), so it is
  // acyclic. The plan service itself is PrismaService-only, which is what makes
  // this safe rather than merely currently-true.
  // KnowledgeModule supplies DocumentsService so RosterUploadService can RETAIN
  // the original roster file (sourceType 'roster_import'). Acyclic: Knowledge
  // reads prisma-direct and imports no domain module, so enrollment → knowledge
  // is a one-way edge.
  imports: [AuthModule, PeriodsModule, BillingModule, AuditModule, AnalyticsModule, KnowledgeModule],
  controllers: [EnrollmentController, DiocesanEnrollmentController, StudentsController],
  providers: [
    EnrollmentService,
    StudentsService,
    // Orchestrates one upload into records + exactly one promote. NOT exported —
    // it injects both neighbours, and nothing outside this module should be able
    // to reach a second writer for periodOperationalData.enrollment.
    RosterUploadService,
    EnrollmentClient,
    OneRosterCsvAdapter,
    BlackbaudAdapter,
    OneRosterApiAdapter,
    FactsAdapter,
    VeracrossAdapter,
    DiocesanEnrollmentService,
    NameMatchService,
    // The analytics tab's read model.
    EnrollmentAnalyticsService,
  ],
  // AIC Phase D: StudentsService is exported so the accreditation twin can read
  // FERPA-safe AGGREGATE roster counts through the service that owns them, rather
  // than issuing its own prisma.student query. Additive; no behaviour change.
  // Penny coverage Phase 1: EnrollmentAnalyticsService is exported so the
  // ASSISTANT reads the analytics tab through the service that OWNS those
  // figures rather than acquiring a second way to compute them — which is
  // precisely the reason it was unexported before, and precisely why exporting
  // it (rather than re-deriving in the assistant) is the honest fix. The rule
  // it protects is "one place computes a number", not "nobody else may read it".
  // RosterUploadService stays unexported: that one is the single WRITER.
  exports: [
    EnrollmentService,
    DiocesanEnrollmentService,
    StudentsService,
    EnrollmentAnalyticsService,
  ],
})
export class EnrollmentModule {}
