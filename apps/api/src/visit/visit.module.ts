import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { TwinModule } from '../twin/twin.module.js'
import { AccreditationModule } from '../accreditation/accreditation.module.js'
import { AccreditationSignalsModule } from '../accreditation-signals/accreditation-signals.module.js'
import { ImprovementModule } from '../improvement/improvement.module.js'
import { VisitController } from './visit.controller.js'
import { VisitService } from './visit.service.js'

/**
 * AIC Phase H — the MOCK VISIT.
 *
 * WHY THIS IS ITS OWN MODULE AND NOT A ROUTE ON TwinModule. twin.module.ts
 * carries a hand-argued acyclic edge set with an explicit "TwinModule must NEVER
 * be imported by AccreditationModule or AnalyticsModule" rule, and the Mock Visit
 * needs four services from three other modules. Adding those imports to
 * TwinModule would disturb an edge set that has already crash-looped this
 * container twice. Nest route paths are independent of module placement, so the
 * client still sees ONE coherent /schools/:schoolId/accreditation surface.
 *
 * THE FOUR EDGES, each to a module that imports nothing from here:
 *   • TwinModule — EarlyWarningService, the REQUIRED read.
 *   • AccreditationModule — AccreditationEvidenceReadinessService (Act 4) and
 *     AccreditationReadinessService (Act 1). Both already exported.
 *   • AccreditationSignalsModule — AccreditationCommendationsService (Act 2).
 *     That module shipped with no `exports` array at all; Phase H added one.
 *   • ImprovementModule — ImprovementService, Phase G's recommendation rail,
 *     which Act 6 SELECTS and ORDERS but never re-derives.
 *
 * VisitModule EXPORTS VisitService for exactly one consumer: ReportScheduleModule,
 * whose board-summary email carries the same executive summary the printed
 * one-pager renders. Nothing else imports VisitModule except AppModule, so the
 * graph stays acyclic — and `visit.module.spec.ts` asserts the export by reading
 * module metadata, because a provider injected but not EXPORTED killed the API on
 * BOOT in Phase E while every unit test passed.
 *
 * AuthModule supplies the guards, BillingModule the EntitlementGuard.
 * PrismaService is global and is not injected here at all: this service reads
 * nothing directly, by design.
 */
@Module({
  imports: [
    AuthModule,
    BillingModule,
    TwinModule,
    AccreditationModule,
    AccreditationSignalsModule,
    ImprovementModule,
  ],
  controllers: [VisitController],
  providers: [VisitService],
  exports: [VisitService],
})
export class VisitModule {}
