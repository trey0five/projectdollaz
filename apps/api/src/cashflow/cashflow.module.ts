import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { CashFlowService } from './cashflow.service.js'
import { CashFlowController } from './cashflow.controller.js'

/**
 * The cash-flow projection module.
 *
 * AuthModule is imported for TokenService — JwtAuthGuard injects it, and a guard
 * on the controller resolves in THIS module's context, not the root's. Leaving it
 * out compiles, passes an import-graph test, and then fails at boot with
 * "Nest can't resolve dependencies of the JwtAuthGuard" — which is exactly what
 * happened, and why the wiring spec now walks constructor parameters instead of
 * merely importing the file.
 *
 * BillingModule because EntitlementGuard resolves the licence. PrismaModule for
 * the school's own data. Nothing else: the projection reads tables directly
 * rather than reaching through BudgetService or QboService, so a cash forecast
 * cannot be broken by a change to somebody else's service surface.
 */
@Module({
  imports: [AuthModule, PrismaModule, BillingModule],
  controllers: [CashFlowController],
  providers: [CashFlowService],
  exports: [CashFlowService],
})
export class CashFlowModule {}
