import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { CashFlowService } from './cashflow.service.js'
import { CashFlowController } from './cashflow.controller.js'

/**
 * The cash-flow projection module. PrismaModule for the school's own data,
 * BillingModule because EntitlementGuard resolves the licence. No other module
 * is imported: the projection reads tables directly rather than reaching through
 * BudgetService or QboService, so a cash forecast cannot be broken by a change
 * to somebody else's service surface.
 */
@Module({
  imports: [PrismaModule, BillingModule],
  controllers: [CashFlowController],
  providers: [CashFlowService],
  exports: [CashFlowService],
})
export class CashFlowModule {}
