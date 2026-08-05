import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { StaffEvaluationsController } from './staff-evaluations.controller.js'
import { StaffEvaluationsService } from './staff-evaluations.service.js'
import { ClearancesController } from './clearances.controller.js'
import { ClearancesService } from './clearances.service.js'
import { ProfessionalDevelopmentController } from './professional-development.controller.js'
import { ProfessionalDevelopmentService } from './professional-development.service.js'

/**
 * AIC Phase F — the HR module. AIC Phase K took it to THREE registers, all gated
 * by the 'hr' entitlement: the STAFF EVALUATION cycle, SAFE-ENVIRONMENT
 * CLEARANCES, and PROFESSIONAL DEVELOPMENT.
 *
 * DEP DIRECTION (critical — no circular dep): this module imports ONLY AuthModule
 * (guards), BillingModule (the reused EntitlementGuard + BillingService) and
 * AuditModule — the same three every register module imports. PrismaService is
 * global. It imports nothing from twin/ or analytics/, and nothing imports it, so
 * the graph stays acyclic in the direction it already runs.
 *
 * EXPORTS NOTHING, deliberately, and Phase K did not change that. All three
 * registers are read outside this module ONLY by the twin collector and the
 * register builder, both of which go straight to Prisma with a narrow, name-free
 * `select` that no-staff-pii.spec.ts parses at build time. Exporting any of these
 * services would hand a caller a shape carrying `personName` — precisely the leak
 * the PII contract exists to prevent, and the clearance register is the one place
 * in this product where that leak would be least forgivable.
 */
@Module({
  imports: [AuthModule, BillingModule, AuditModule],
  controllers: [
    StaffEvaluationsController,
    ClearancesController,
    ProfessionalDevelopmentController,
  ],
  providers: [StaffEvaluationsService, ClearancesService, ProfessionalDevelopmentService],
  exports: [],
})
export class HrModule {}
