import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type Stripe from 'stripe'
import type { Subscription, SubscriptionStatus } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import { StripeClientService } from './stripe-client.service.js'
import type { BillingPlan } from './dto/create-checkout.dto.js'

export interface BillingView {
  status: SubscriptionStatus
  plan: string | null
  trialEnd: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  daysLeft: number | null
  isEntitled: boolean
}

const MS_PER_DAY = 1000 * 60 * 60 * 24

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeClient: StripeClientService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  // ── Trial + lazy provisioning ──────────────────────────────────────────────

  /**
   * Idempotently ensure a subscriptions row exists for a school. A brand-new
   * school gets a LOCAL trial (status 'trialing', trialEnd = now + trialDays) —
   * no Stripe call required. Upsert on the school_id UNIQUE key stays safe under
   * concurrent first-reads.
   */
  async getOrCreateSubscription(schoolId: string): Promise<Subscription> {
    const existing = await this.prisma.subscription.findUnique({ where: { schoolId } })
    if (existing) return existing

    const trialDays = this.config.get<number>('stripe.trialDays') ?? 14
    const trialEnd = new Date(Date.now() + trialDays * MS_PER_DAY)

    return this.prisma.subscription.upsert({
      where: { schoolId },
      update: {},
      create: { schoolId, status: 'trialing', trialEnd },
    })
  }

  /** Trial-on-creation hook called from SchoolsService.createSchool (best-effort). */
  async establishTrial(schoolId: string): Promise<void> {
    try {
      await this.getOrCreateSubscription(schoolId)
    } catch (err) {
      // The lazy path in getBilling/isEntitled is the safety net; never block
      // school creation on the billing row.
      this.logger.warn(`establishTrial failed for ${schoolId}: ${String(err)}`)
    }
  }

  // ── Entitlement (single source of truth) ────────────────────────────────────

  private computeEntitled(sub: Subscription): boolean {
    if (sub.status === 'active') return true
    if (sub.status === 'trialing' && sub.trialEnd && sub.trialEnd.getTime() > Date.now()) {
      return true
    }
    return false
  }

  /** Lazily ensures the trial row so a never-billed school passes during trial. */
  async isEntitled(schoolId: string): Promise<boolean> {
    const sub = await this.getOrCreateSubscription(schoolId)
    return this.computeEntitled(sub)
  }

  // ── Read ────────────────────────────────────────────────────────────────────

  async getBilling(schoolId: string): Promise<BillingView> {
    const sub = await this.getOrCreateSubscription(schoolId)
    const isEntitled = this.computeEntitled(sub)

    // daysLeft from trialEnd while trialing, else from currentPeriodEnd.
    const anchor =
      sub.status === 'trialing' ? sub.trialEnd : (sub.currentPeriodEnd ?? sub.trialEnd)
    let daysLeft: number | null = null
    if (anchor) {
      daysLeft = Math.max(0, Math.ceil((anchor.getTime() - Date.now()) / MS_PER_DAY))
    }

    return {
      status: sub.status,
      plan: sub.plan,
      trialEnd: sub.trialEnd ? sub.trialEnd.toISOString() : null,
      currentPeriodEnd: sub.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      daysLeft,
      isEntitled,
    }
  }

  // ── Checkout / Portal (require a live secret key) ────────────────────────────

  private resolvePriceId(plan: BillingPlan): string {
    const priceId =
      plan === 'monthly'
        ? (this.config.get<string>('stripe.priceMonthly') ?? '')
        : (this.config.get<string>('stripe.priceYearly') ?? '')
    if (!priceId) {
      throw new BadRequestException({
        code: 'PRICE_NOT_CONFIGURED',
        message: `No Stripe price configured for the ${plan} plan.`,
      })
    }
    return priceId
  }

  /** Create-or-reuse the Stripe customer for a school; persists the id. */
  private async ensureCustomer(schoolId: string): Promise<string> {
    const sub = await this.getOrCreateSubscription(schoolId)
    if (sub.stripeCustomerId) return sub.stripeCustomerId

    const stripe = this.stripeClient.getClient()
    const customer = await stripe.customers.create({ metadata: { schoolId } })
    await this.prisma.subscription.update({
      where: { schoolId },
      data: { stripeCustomerId: customer.id },
    })
    return customer.id
  }

  async createCheckoutSession(schoolId: string, plan: BillingPlan): Promise<{ url: string }> {
    const stripe = this.stripeClient.getClient()
    const priceId = this.resolvePriceId(plan)
    const customer = await this.ensureCustomer(schoolId)

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: this.config.get<string>('stripe.successUrl') ?? '',
      cancel_url: this.config.get<string>('stripe.cancelUrl') ?? '',
      metadata: { schoolId },
      subscription_data: { metadata: { schoolId } },
    })
    if (!session.url) {
      throw new BadRequestException('Stripe did not return a checkout URL.')
    }
    return { url: session.url }
  }

  async createPortalSession(schoolId: string): Promise<{ url: string }> {
    const stripe = this.stripeClient.getClient()
    const sub = await this.getOrCreateSubscription(schoolId)
    if (!sub.stripeCustomerId) {
      throw new BadRequestException({
        code: 'NO_CUSTOMER',
        message: 'No billing customer yet — subscribe first.',
      })
    }
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: this.config.get<string>('stripe.portalReturnUrl') ?? '',
    })
    return { url: session.url }
  }

  // ── Webhook → subscriptions UPSERT ──────────────────────────────────────────

  /** Map Stripe's subscription status onto our local enum. */
  private mapStatus(stripeStatus: string): SubscriptionStatus {
    switch (stripeStatus) {
      case 'active':
        return 'active'
      case 'trialing':
        return 'trialing'
      case 'past_due':
      case 'unpaid':
        return 'past_due'
      case 'canceled':
      case 'incomplete_expired':
        return 'canceled'
      default:
        return 'none'
    }
  }

  /** Resolve our schoolId from a subscription's metadata or by stripe customer id. */
  private async resolveSchoolId(
    metadataSchoolId: string | undefined,
    stripeCustomerId: string | undefined,
  ): Promise<string | null> {
    if (metadataSchoolId) return metadataSchoolId
    if (stripeCustomerId) {
      const row = await this.prisma.subscription.findFirst({
        where: { stripeCustomerId },
      })
      if (row) return row.schoolId
    }
    return null
  }

  async handleEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const schoolId = await this.resolveSchoolId(
          session.metadata?.schoolId,
          typeof session.customer === 'string' ? session.customer : undefined,
        )
        if (!schoolId) {
          this.logger.warn('checkout.session.completed without resolvable schoolId — ignoring')
          return
        }
        await this.prisma.subscription.upsert({
          where: { schoolId },
          update: {
            stripeCustomerId:
              typeof session.customer === 'string' ? session.customer : undefined,
            stripeSubscriptionId:
              typeof session.subscription === 'string' ? session.subscription : undefined,
          },
          create: {
            schoolId,
            stripeCustomerId:
              typeof session.customer === 'string' ? session.customer : null,
            stripeSubscriptionId:
              typeof session.subscription === 'string' ? session.subscription : null,
            status: 'active',
          },
        })
        await this.audit.write({
          schoolId,
          action: 'billing.checkout_completed',
          targetType: 'subscription',
          metadata: { eventType: event.type },
        })
        return
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        await this.upsertFromSubscription(sub, event.type, event.created)
        return
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const schoolId = await this.resolveSchoolId(
          sub.metadata?.schoolId,
          typeof sub.customer === 'string' ? sub.customer : undefined,
        )
        if (!schoolId) return
        await this.prisma.subscription.upsert({
          where: { schoolId },
          update: { status: 'canceled', cancelAtPeriodEnd: false },
          create: { schoolId, status: 'canceled' },
        })
        await this.audit.write({
          schoolId,
          action: 'billing.canceled',
          targetType: 'subscription',
          metadata: { eventType: event.type },
        })
        return
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const schoolId = await this.resolveSchoolId(
          undefined,
          typeof invoice.customer === 'string' ? invoice.customer : undefined,
        )
        if (!schoolId) return
        await this.prisma.subscription.upsert({
          where: { schoolId },
          update: { status: 'past_due' },
          create: { schoolId, status: 'past_due' },
        })
        await this.audit.write({
          schoolId,
          action: 'billing.payment_failed',
          targetType: 'subscription',
          metadata: { eventType: event.type },
        })
        return
      }

      default:
        // Unhandled events are acknowledged (200) so Stripe stops retrying.
        return
    }
  }

  private async upsertFromSubscription(
    sub: Stripe.Subscription,
    eventType: string,
    eventCreatedUnix?: number,
  ): Promise<void> {
    const customerId = typeof sub.customer === 'string' ? sub.customer : undefined
    const schoolId = await this.resolveSchoolId(sub.metadata?.schoolId, customerId)
    if (!schoolId) {
      this.logger.warn(`${eventType} without resolvable schoolId — ignoring`)
      return
    }

    // Replay / out-of-order guard: Stripe subscription events for a row are
    // last-write-by-state, but a re-delivered OLDER event could regress an
    // already-applied newer one (e.g. re-apply 'active' over a newer
    // 'past_due'). When the event predates the row's last update, skip it.
    // (No new column needed — we compare event.created against updatedAt.)
    if (eventCreatedUnix) {
      const existing = await this.prisma.subscription.findUnique({
        where: { schoolId },
        select: { updatedAt: true, stripeSubscriptionId: true },
      })
      if (
        existing &&
        existing.stripeSubscriptionId === sub.id &&
        existing.updatedAt.getTime() > eventCreatedUnix * 1000
      ) {
        this.logger.warn(
          `${eventType} for ${schoolId} is older than current row (event ${new Date(
            eventCreatedUnix * 1000,
          ).toISOString()} < row ${existing.updatedAt.toISOString()}) — skipping replay`,
        )
        return
      }
    }

    const status = this.mapStatus(sub.status)
    const item = sub.items?.data?.[0]
    const priceId = item?.price?.id ?? null
    // current_period_end lives on the subscription item in newer API versions; we
    // read whichever is present (kept loose to tolerate SDK version drift).
    const periodEndUnix =
      (sub as unknown as { current_period_end?: number }).current_period_end ??
      (item as unknown as { current_period_end?: number } | undefined)?.current_period_end
    const trialEndUnix = (sub as unknown as { trial_end?: number | null }).trial_end ?? null

    const data = {
      stripeCustomerId: customerId ?? null,
      stripeSubscriptionId: sub.id,
      stripePriceId: priceId,
      plan: this.planFromPrice(priceId),
      status,
      currentPeriodEnd: periodEndUnix ? new Date(periodEndUnix * 1000) : null,
      trialEnd: trialEndUnix ? new Date(trialEndUnix * 1000) : null,
      cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    }

    await this.prisma.subscription.upsert({
      where: { schoolId },
      update: data,
      create: { schoolId, ...data },
    })
    await this.audit.write({
      schoolId,
      action: 'billing.subscription_updated',
      targetType: 'subscription',
      metadata: { eventType, status },
    })
  }

  /** Map a Stripe price id back to our plan label using configured prices. */
  private planFromPrice(priceId: string | null): string | null {
    if (!priceId) return null
    if (priceId === this.config.get<string>('stripe.priceMonthly')) return 'monthly'
    if (priceId === this.config.get<string>('stripe.priceYearly')) return 'yearly'
    return null
  }
}
