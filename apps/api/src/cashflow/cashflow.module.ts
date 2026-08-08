import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { QboClient } from '../integrations/qbo.client.js'
import { CashFlowService } from './cashflow.service.js'
import { QboEventsService } from './qbo-events.service.js'
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
  // QboClient is provided DIRECTLY rather than by importing IntegrationsModule:
  // it is a leaf (ConfigService only), while IntegrationsModule drags the whole
  // QBO service graph in — and QboEventsService already reaches the stateful
  // services (QboService, QboAgingService) lazily via ModuleRef with
  // strict:false, which resolves them from wherever they actually live.
  providers: [CashFlowService, QboEventsService, QboClient],
  exports: [CashFlowService],
})
export class CashFlowModule {}
