import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { PeriodsModule } from '../periods/periods.module.js'
import { AnalyticsModule } from '../analytics/analytics.module.js'
import { AccreditationSignalsController } from './signals.controller.js'
import { AccreditationSignalsService } from './signals.service.js'

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
  imports: [AuthModule, BillingModule, PeriodsModule, AnalyticsModule],
  controllers: [AccreditationSignalsController],
  providers: [AccreditationSignalsService],
})
export class AccreditationSignalsModule {}
