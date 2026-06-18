import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common'
import type { Request } from 'express'
import { BillingService } from './billing.service.js'
import { StripeClientService } from './stripe-client.service.js'

/**
 * PUBLIC route (no Jwt/Roles guards) — authenticity comes from Stripe's signature
 * over the RAW body, verified against STRIPE_WEBHOOK_SECRET. main.ts wires an
 * express.raw() parser for THIS path only so req.body is a Buffer here while all
 * other routes keep JSON parsing.
 */
@Controller('stripe')
export class WebhookController {
  constructor(
    private readonly billing: BillingService,
    private readonly stripeClient: StripeClientService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  async handle(
    @Req() req: Request & { rawBody?: Buffer; body: Buffer },
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<{ received: true }> {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header.')
    }
    // express.raw() puts the raw Buffer on req.body; Nest's rawBody option also
    // exposes req.rawBody — accept whichever is a Buffer.
    const raw = Buffer.isBuffer(req.rawBody)
      ? req.rawBody
      : Buffer.isBuffer(req.body)
        ? req.body
        : null
    if (!raw) {
      throw new BadRequestException('Missing raw request body for signature verification.')
    }

    let event
    try {
      event = this.stripeClient.constructWebhookEvent(raw, signature)
    } catch (err) {
      throw new BadRequestException(`Webhook signature verification failed: ${String(err)}`)
    }

    await this.billing.handleEvent(event)
    return { received: true }
  }
}
