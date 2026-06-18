import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { BillingService } from './billing.service.js'
import { CreateCheckoutDto } from './dto/create-checkout.dto.js'

@Controller('schools/:schoolId/billing')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  // Current billing status. All active members may READ it (viewers see it
  // read-only in the UI). Mutations below stay owner-only.
  @Get()
  @Roles('owner', 'accountant', 'viewer')
  get(@Param('schoolId') schoolId: string) {
    return this.billing.getBilling(schoolId)
  }

  // Create a Stripe Checkout Session. OWNER only. Requires a live STRIPE_SECRET_KEY
  // (otherwise returns 503 STRIPE_NOT_CONFIGURED).
  @Post('checkout')
  @Roles('owner')
  checkout(
    @CurrentUser() _user: User,
    @Param('schoolId') schoolId: string,
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.billing.createCheckoutSession(schoolId, dto.plan)
  }

  // Create a Customer Portal session. OWNER only.
  @Post('portal')
  @Roles('owner')
  portal(@CurrentUser() _user: User, @Param('schoolId') schoolId: string) {
    return this.billing.createPortalSession(schoolId)
  }
}
