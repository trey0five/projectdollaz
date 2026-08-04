import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { StandardsController } from './standards.controller.js'
import { EvidenceController } from './evidence.controller.js'
import { EvidenceSourcesController } from './evidence-sources.controller.js'
import { AccreditationCatalogController } from './catalog.controller.js'
import { AccreditationReadinessController } from './readiness.controller.js'
import { AccreditationReadinessHistoryController } from './readiness-history.controller.js'
import { AccreditationEvidenceReadinessController } from './evidence-readiness.controller.js'
import { AccreditationService } from './accreditation.service.js'
import { AccreditationCatalogService } from './catalog.service.js'
import { AccreditationReadinessService } from './readiness.service.js'
import { AccreditationReadinessHistoryService } from './readiness-history.service.js'
import { AccreditationSnapshotService } from './readiness-snapshot.service.js'
import { AccreditationEvidenceReadinessService } from './evidence-readiness.service.js'
import { PriorVisitController } from './prior-visit.controller.js'
import { PriorVisitService } from './prior-visit.service.js'

/**
 * Phase 4 Accreditation v1 — the Standards + Evidence register module. The first
 * Phase-4 domain and the SECOND licensable module (after governance), gated by the
 * 'accreditation' entitlement.
 *
 * DEP DIRECTION (critical — no circular dep): this module imports ONLY AuthModule
 * (guards), BillingModule (the reused EntitlementGuard + BillingService), and
 * AuditModule. It does NOT import AnalyticsModule. AnalyticsModule imports THIS
 * module to inject the exported AccreditationService into BriefingService, so the
 * only edge is analytics → accreditation (acyclic). PrismaService is global.
 *
 * PHASE A adds the readiness-HISTORY controller + its two services. The nightly
 * @Cron on AccreditationSnapshotService needs NO ScheduleModule.forRoot() here —
 * RetentionModule already calls it once and the scheduler explorer discovers
 * @Cron on any provider app-wide. A second forRoot() would double-register every
 * job in the app.
 *
 * AIC PHASE F adds the PRIOR VISIT FINDINGS register (controller + service). It
 * lives here rather than in a module of its own because it is accreditation data
 * under the accreditation gate, and it needs exactly the three modules this one
 * already imports. It is NOT exported: TwinRegisterService reads the table
 * directly with its own narrow projection (phase spec §2.5), so exporting the
 * service would create a second, wider read path to the same rows for no gain.
 */
@Module({
  imports: [AuthModule, BillingModule, AuditModule],
  controllers: [
    StandardsController,
    EvidenceController,
    EvidenceSourcesController,
    AccreditationCatalogController,
    AccreditationReadinessController,
    AccreditationReadinessHistoryController,
    AccreditationEvidenceReadinessController,
    PriorVisitController,
  ],
  providers: [
    AccreditationService,
    AccreditationCatalogService,
    AccreditationReadinessService,
    AccreditationReadinessHistoryService,
    AccreditationSnapshotService,
    AccreditationEvidenceReadinessService,
    PriorVisitService,
  ],
  // AIC Phase C: the commendations endpoint (in AccreditationSignalsModule)
  // needs BOTH the signal panel and the currency service. The edge stays
  // accreditation-signals → accreditation, and accreditation imports neither —
  // still acyclic.
  // AIC Phase E: TwinRegisterService reads the readiness roll-up to build the
  // register view, so AccreditationReadinessService joins the exported set. It
  // is an EXPORT, not an import — AccreditationModule still imports neither
  // twin nor analytics, so the graph stays acyclic in the same direction.
  // AIC Phase J: Penny's read-only `explain_readiness_change` reads the SAME
  // computed diff/decomposition the readiness-history controller serves. The
  // alternative was a second copy of that arithmetic inside the assistant, which
  // is how a spoken explanation and the chart it explains come to disagree. It is
  // an EXPORT, not an import — this module still imports neither assistant nor
  // analytics, so the graph stays acyclic in the same direction.
  exports: [
    AccreditationService,
    AccreditationEvidenceReadinessService,
    AccreditationReadinessService,
    AccreditationReadinessHistoryService,
  ],
})
export class AccreditationModule {}
