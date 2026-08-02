import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { StaffEvaluationsController } from './staff-evaluations.controller.js'
import { StaffEvaluationsService } from './staff-evaluations.service.js'

/**
 * AIC Phase F — the HR module. Today it hosts exactly one register, the
 * STAFF EVALUATION cycle, gated by the 'hr' entitlement.
 *
 * DEP DIRECTION (critical — no circular dep): this module imports ONLY AuthModule
 * (guards), BillingModule (the reused EntitlementGuard + BillingService) and
 * AuditModule — the same three every register module imports. PrismaService is
 * global. It imports nothing from twin/ or analytics/, and nothing imports it, so
 * the graph stays acyclic in the direction it already runs.
 *
 * EXPORTS NOTHING, deliberately. The staff-evaluation table is read by exactly two
 * places outside this module — the twin collector and the evidence anchor — and both
 * go straight to Prisma with a narrow, name-free `select`. Exporting the service
 * would hand them a shape that carries `personName`, which is precisely the leak the
 * PII contract exists to prevent.
 */
@Module({
  imports: [AuthModule, BillingModule, AuditModule],
  controllers: [StaffEvaluationsController],
  providers: [StaffEvaluationsService],
  exports: [],
})
export class HrModule {}
