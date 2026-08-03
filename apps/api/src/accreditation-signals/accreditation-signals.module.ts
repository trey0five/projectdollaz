import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { PeriodsModule } from '../periods/periods.module.js'
import { AnalyticsModule } from '../analytics/analytics.module.js'
import { AccreditationModule } from '../accreditation/accreditation.module.js'
import { AccreditationSignalsController } from './signals.controller.js'
import { AccreditationSignalsService } from './signals.service.js'
import { AccreditationCommendationsController } from './commendations.controller.js'
import { AccreditationCommendationsService } from './commendations.service.js'

/**
 * AIC Phase B — the accreditation SIGNAL PANEL.
 *
 * DEP DIRECTION (the reason this is its own module): the signal panel needs
 * AnalyticsService, and AnalyticsModule already imports AccreditationModule to
 * feed the briefing's accreditation STEP. Putting this endpoint inside
 * AccreditationModule would therefore create accreditation ↔ analytics — a
 * genuine cycle, not a stylistic one. The edge here is
 * accreditation-signals → analytics → accreditation, which is acyclic.
 *
 * The ROUTE is still /schools/:schoolId/accreditation/signals: Nest route paths
 * are independent of module placement, so the client sees one coherent surface.
 *
 * AuthModule supplies the guards, BillingModule the EntitlementGuard +
 * BillingService (the module-entitlement reason strings), PeriodsModule the
 * tenant-checked period lookup. PrismaService is global.
 */
@Module({
  // AIC Phase C adds a DIRECT AccreditationModule import for the currency
  // service the commendations engine needs. The graph stays acyclic:
  // accreditation-signals → accreditation, and accreditation imports neither
  // this module nor analytics. (AnalyticsModule already imports
  // AccreditationModule; Nest resolves the shared provider once.)
  imports: [AuthModule, BillingModule, PeriodsModule, AnalyticsModule, AccreditationModule],
  controllers: [AccreditationSignalsController, AccreditationCommendationsController],
  providers: [AccreditationSignalsService, AccreditationCommendationsService],
  // AIC Phase H. This module shipped with NO `exports` array at all, so Act 2 of
  // the Mock Visit — the commendations engine, already built in Phase C — could
  // not be injected anywhere else. VisitModule needs it. A provider injected but
  // not EXPORTED killed the API on BOOT in Phase E while every unit test passed,
  // so `visit.module.spec.ts` asserts this line by reading the module metadata
  // rather than trusting a comment.
  exports: [AccreditationCommendationsService],
})
export class AccreditationSignalsModule {}
