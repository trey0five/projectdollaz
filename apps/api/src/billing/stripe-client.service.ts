import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Stripe from 'stripe'

/**
 * The ONLY place `new Stripe()` is constructed. Tolerates an empty secret key so
 * the api BOOTS with no Stripe configured (dev/test): the client is null and
 * checkout/portal report a clear error instead of crashing.
 *
 * Webhook verification depends only on STRIPE_WEBHOOK_SECRET (pure HMAC, no
 * network call), so it works in the keyless test environment when only the
 * webhook secret is set — which is exactly how Phase 1D is verified locally.
 */
@Injectable()
export class StripeClientService {
  private readonly logger = new Logger(StripeClientService.name)
  private readonly stripe: Stripe | null
  // A minimal Stripe instance used purely for webhook signature verification —
  // constructEvent is a pure HMAC check and needs no live secret key.
  private readonly verifier: Stripe

  constructor(private readonly config: ConfigService) {
    const secretKey = this.config.get<string>('stripe.secretKey') ?? ''
    // Stripe SDK refuses an empty key, so the verifier uses a harmless dummy key
    // (never used for any API call — only constructEvent's local HMAC).
    this.verifier = new Stripe(secretKey || 'sk_test_dummy_verifier', {
      apiVersion: '2025-02-24.acacia',
    })
    if (secretKey) {
      this.stripe = new Stripe(secretKey, { apiVersion: '2025-02-24.acacia' })
    } else {
      this.stripe = null
      this.logger.warn(
        'STRIPE_SECRET_KEY not set — checkout/portal are disabled (return a clear error). ' +
          'Webhook signature verification still works if STRIPE_WEBHOOK_SECRET is set.',
      )
    }
  }

  /** True when a live secret key is configured (checkout/portal usable). */
  isConfigured(): boolean {
    return this.stripe !== null
  }

  /**
   * The live Stripe client for API calls (checkout/portal/customers). Throws a
   * 503 with a clear code when no secret key is configured, instead of crashing.
   */
  getClient(): Stripe {
    if (!this.stripe) {
      throw new ServiceUnavailableException({
        code: 'STRIPE_NOT_CONFIGURED',
        message:
          'Billing is not configured on this server (no Stripe secret key). ' +
          'Set STRIPE_SECRET_KEY to enable checkout and the customer portal.',
      })
    }
    return this.stripe
  }

  /**
   * Verify + parse a webhook payload against STRIPE_WEBHOOK_SECRET using the RAW
   * request body. Throws if the secret is missing or the signature is invalid —
   * the controller maps any throw to a 400.
   */
  constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
    const webhookSecret = this.config.get<string>('stripe.webhookSecret') ?? ''
    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not configured')
    }
    return this.verifier.webhooks.constructEvent(rawBody, signature, webhookSecret)
  }
}
