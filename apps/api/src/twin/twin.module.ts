import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { AnalyticsModule } from '../analytics/analytics.module.js'
import { AccreditationModule } from '../accreditation/accreditation.module.js'
import { EnrollmentModule } from '../enrollment/enrollment.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { TwinSignalsService } from './twin-signals.service.js'
import { TwinReconciliationService } from './twin-reconciliation.service.js'
import { TwinRegisterService } from './twin-register.service.js'
import { TwinPriorFactsService } from './twin-prior-facts.service.js'
import { EarlyWarningService } from './early-warning.service.js'
import { TwinController } from './twin.controller.js'

/**
 * AIC Phase D — the accreditation TWIN. Phase E routes it.
 *
 * THE CONTROLLER ARRIVED, AND IT ARRIVED WITH THE FULL HOUSE CHAIN:
 * @Controller('schools/:schoolId/accreditation'), @Param('schoolId',
 * ParseUUIDPipe), @UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard),
 * @RequiresModule('accreditation'), and every query/body field explicitly
 * decorated or the global forbidNonWhitelisted pipe 400s.
 *
 * DEPENDENCY DIRECTION INSIDE THIS MODULE, and why it is one-way:
 * TwinReconciliationService injects EarlyWarningService (to prepare the rule
 * context before it evaluates); EarlyWarningService injects the collector, the
 * register builder and the prior-fact reader — and NEVER the reconciliation.
 * Nest resolves the edge in exactly one direction, and a module-init spec asserts
 * it, because a forwardRef here would be a cycle nobody would notice until a
 * 4AM job stopped running.
 *
 * AuditModule is imported because ack/mute/status are HUMAN actions and every
 * one of them is written to the audit log — the ledger records the decision, the
 * audit log records who made it.
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
  imports: [
    AuthModule,
    BillingModule,
    AnalyticsModule,
    AccreditationModule,
    EnrollmentModule,
    AuditModule,
  ],
  controllers: [TwinController],
  providers: [
    TwinSignalsService,
    TwinRegisterService,
    TwinPriorFactsService,
    EarlyWarningService,
    TwinReconciliationService,
  ],
  // EarlyWarningService is exported for exactly ONE consumer: Penny's read-only
  // get_early_warnings tool. AssistantModule imports TwinModule; TwinModule
  // imports nothing from assistant, so that edge is acyclic too.
  exports: [TwinSignalsService, EarlyWarningService],
})
export class TwinModule {}
