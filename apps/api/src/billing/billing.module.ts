import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AuthModule } from '../auth/auth.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { BillingController } from './billing.controller.js'
import { WebhookController } from './webhook.controller.js'
import { BillingService } from './billing.service.js'
import { StripeClientService } from './stripe-client.service.js'
import { EntitlementGuard } from './entitlement.guard.js'

/**
 * Stripe subscription billing (Phase 1D). PrismaModule is global. AuthModule
 * provides JwtAuthGuard/RolesGuard for the billing controller. Exports
 * BillingService + EntitlementGuard so Statements/Imports/Schools can use them.
 */
@Module({
  imports: [ConfigModule, AuthModule, AuditModule],
  controllers: [BillingController, WebhookController],
  providers: [StripeClientService, BillingService, EntitlementGuard],
  exports: [BillingService, EntitlementGuard],
})
export class BillingModule {}
