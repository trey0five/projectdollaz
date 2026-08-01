import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { AnalyticsModule } from '../analytics/analytics.module.js'
import { AccreditationModule } from '../accreditation/accreditation.module.js'
import { EnrollmentModule } from '../enrollment/enrollment.module.js'
import { TwinSignalsService } from './twin-signals.service.js'
import { TwinReconciliationService } from './twin-reconciliation.service.js'

/**
 * AIC Phase D — the accreditation TWIN.
 *
 * NO CONTROLLER. Nothing in this phase is user-visible, so nothing is routable.
 * Phase E adds the routes and, at that moment, the house rule applies in full:
 * @Controller('schools/:schoolId/accreditation/…'), @Param('schoolId',
 * ParseUUIDPipe), @UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard),
 * @RequiresModule('accreditation'), and every query field explicitly decorated or
 * the global forbidNonWhitelisted pipe 400s. An engineer who adds a controller
 * here has misread the phase.
 *
 * DEP DIRECTION (the reason this is its own module). AnalyticsModule already
 * imports AccreditationModule; AccreditationModule imports neither. The edges
 * added here are twin -> analytics -> accreditation and twin -> accreditation,
 * both acyclic, exactly mirroring the note atop accreditation-signals.module.ts.
 *
 * TwinModule must NEVER be imported by AccreditationModule or AnalyticsModule —
 * that is the cycle, and it is the reason the reconciliation is chained off the
 * CLOCK (4AM, one hour after the Phase-A 3AM capture) rather than off
 * AccreditationSnapshotService.captureAll()'s tail.
 *
 * EnrollmentModule is here for ONE provider: StudentsService, the service that
 * owns the roster. No file under this directory may query student rows directly
 * (acceptance criterion 5) — aggregate counts arrive through the owner and pass
 * through small-cell suppression before they can reach a payload. EnrollmentModule
 * imports neither analytics nor accreditation, so this edge is acyclic too.
 *
 * The @Cron on TwinReconciliationService needs NO ScheduleModule.forRoot() here:
 * RetentionModule already calls it once and the scheduler explorer discovers
 * @Cron on any provider app-wide. A second forRoot() would double-register every
 * job in the app. PrismaService is global.
 */
@Module({
  imports: [AuthModule, BillingModule, AnalyticsModule, AccreditationModule, EnrollmentModule],
  providers: [TwinSignalsService, TwinReconciliationService],
  exports: [TwinSignalsService],
})
export class TwinModule {}
