import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type Stripe from 'stripe'
import type { Subscription, SubscriptionStatus, LicensedModule, ModuleKey } from '@finrep/db'
import {
  CORE_MODULE,
  DEFAULT_LICENSED_MODULES,
  MODULE_META,
  Prisma,
  SELLABLE_MODULE_KEYS,
  isModuleKey,
} from '@finrep/db'
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
  // Per-module entitlement (additive RESPONSE field). When entitled (active OR
  // live trial) this is the resolved licensed set (legacy/null → [{finance}]);
  // when not entitled it's []. Never a client-sent field, so
  // forbidNonWhitelisted is irrelevant.
  licensedModules: LicensedModule[]
}

/** One sellable-module entry in the FE billing catalog (no raw priceId leaked). */
export interface ModuleCatalogEntry {
  key: ModuleKey
  label: string
  description: string
  /** true when a Stripe price is configured for this module (checkout enabled). */
  purchasable: boolean
}

export interface ModuleCatalog {
  /** true when a core/base Stripe price is configured (modular checkout enabled). */
  coreConfigured: boolean
  modules: ModuleCatalogEntry[]
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

  // ── Per-module entitlement ──────────────────────────────────────────────────

  /**
   * FAIL-SAFE resolver (pure, no DB) mapping the stored `licensedModules` JSON to
   * a clean LicensedModule[]. The NO-LOCKOUT linchpin: NULL / empty / non-array /
   * all-invalid resolves to the DEFAULT ([{finance}]) so every existing active row
   * (NULL after the additive migration) licenses finance. Defensive against
   * garbage / hand-edited JSON — never throws, always fails toward finance.
   */
  private resolveLicensed(sub: Subscription): LicensedModule[] {
    const raw = sub.licensedModules as unknown
    if (!Array.isArray(raw)) return [...DEFAULT_LICENSED_MODULES]
    const parsed = raw
      .filter(
        (m): m is { key: string; tier?: unknown } =>
          !!m && typeof m === 'object' && isModuleKey((m as { key?: unknown }).key),
      )
      .map((m) => ({
        key: m.key as ModuleKey,
        tier: typeof m.tier === 'string' ? (m.tier as LicensedModule['tier']) : null,
      }))
    return parsed.length > 0 ? parsed : [...DEFAULT_LICENSED_MODULES]
  }

  /**
   * Module-aware entitlement. Semantics = ENTITLED (active / valid-trial) AND
   * (core OR key ∈ resolved licensed set). A not-entitled school is false for
   * EVERY module (so the guard emits SUBSCRIPTION_REQUIRED, not
   * MODULE_NOT_LICENSED). TRIALING RESOLVES IDENTICALLY TO ACTIVE: a school with
   * a legacy/NULL set resolves to finance-only, and sellable modules unlock
   * per-key via the unlock endpoint (pre-Stripe stub) / future checkout.
   */
  async isEntitledForModule(schoolId: string, moduleKey: string): Promise<boolean> {
    const sub = await this.getOrCreateSubscription(schoolId)
    if (!this.computeEntitled(sub)) return false // not paying at all → false
    if (moduleKey === CORE_MODULE) return true // core is always-on when entitled
    return this.resolveLicensed(sub).some((m) => m.key === moduleKey)
  }

  /**
   * PRE-STRIPE FREE UNLOCK STUB — owner-only instant unlock of one sellable
   * module. When per-module Stripe billing ships this becomes
   * createCheckoutSession({ modules: [key] }) + webhook reconciliation; the
   * route shape and BillingView response stay identical.
   *
   * Semantics:
   *   • Resolve FIRST via resolveLicensed(sub) — the critical step: the first
   *     unlock from a NULL/legacy set MATERIALIZES the resolved default
   *     ([{finance}]) plus the new key, so finance is never dropped. An explicit
   *     stored set is extended as-is (finance is NOT re-added).
   *   • IDEMPOTENT: adding an already-owned key is a 200 no-op (no DB write, no
   *     audit entry).
   *   • Audit only on a real write: billing.module_unlocked / method free_stub.
   *   • Returns the fresh BillingView (same shape as GET billing).
   * No locking — this is a rare owner-only manual action; last-write-wins is
   * acceptable.
   */
  async unlockModule(schoolId: string, key: ModuleKey): Promise<BillingView> {
    // Defense-in-depth: the DTO's @IsIn(SELLABLE_MODULE_KEYS) already 400s bad
    // keys (incl. 'core') at the pipe; this only fires on direct service calls.
    if (!SELLABLE_MODULE_KEYS.includes(key)) {
      throw new BadRequestException({
        code: 'MODULE_NOT_SELLABLE',
        message: `'${key}' is not a sellable module.`,
      })
    }

    const sub = await this.getOrCreateSubscription(schoolId)
    const resolved = this.resolveLicensed(sub)

    if (!resolved.some((m) => m.key === key)) {
      const next: LicensedModule[] = [...resolved, { key, tier: null }]
      await this.prisma.subscription.update({
        where: { schoolId },
        data: { licensedModules: next as unknown as Prisma.InputJsonValue },
      })
      await this.audit.write({
        schoolId,
        action: 'billing.module_unlocked',
        targetType: 'subscription',
        metadata: { module: key, method: 'free_stub' },
      })
    }

    return this.getBilling(schoolId)
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

    // Surface the licensed set so the FE matches the guard. TRIALING RESOLVES
    // EXACTLY LIKE ACTIVE: the resolved set (legacy/null → [{finance}]);
    // not entitled → [] (nothing to render).
    const licensedModules: LicensedModule[] = isEntitled ? this.resolveLicensed(sub) : []

    return {
      status: sub.status,
      plan: sub.plan,
      trialEnd: sub.trialEnd ? sub.trialEnd.toISOString() : null,
      currentPeriodEnd: sub.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      daysLeft,
      isEntitled,
      licensedModules,
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

  // ── Pure, config-driven module ↔ priceId map (never throws) ─────────────────

  /** The configured sellable moduleKey → priceId map (empty entries excluded). */
  private modulePriceMap(): Record<string, string> {
    return this.config.get<Record<string, string>>('stripe.modulePrices') ?? {}
  }

  /** The configured core/base priceId, or null when unset. */
  private corePriceId(): string | null {
    return this.config.get<string>('stripe.priceCore') || null
  }

  /**
   * priceId → sellable ModuleKey (webhook reconciliation direction). The core
   * price, the legacy base prices, and any unknown/unconfigured price all map to
   * null (caller distinguishes recognized-core via isCorePrice). Never throws.
   */
  private moduleFromPrice(priceId: string | null | undefined): ModuleKey | null {
    if (!priceId) return null
    const map = this.modulePriceMap()
    for (const [key, pid] of Object.entries(map)) {
      if (pid && pid === priceId && isModuleKey(key) && key !== CORE_MODULE) {
        return key as ModuleKey
      }
    }
    return null
  }

  /**
   * True when the priceId is a RECOGNIZED base/core price: the dedicated
   * `priceCore` OR the legacy `priceMonthly`/`priceYearly` base. A recognized
   * core price contributes NO sellable module but marks the catalog as understood
   * (so a legacy single-base sub is not mistaken for an "unknown catalog").
   */
  private isCorePrice(priceId: string | null | undefined): boolean {
    if (!priceId) return false
    const core = this.corePriceId()
    if (core && priceId === core) return true
    const monthly = this.config.get<string>('stripe.priceMonthly') || null
    const yearly = this.config.get<string>('stripe.priceYearly') || null
    return priceId === monthly || priceId === yearly
  }

  /** ModuleKey → configured priceId (checkout direction); null when unconfigured. */
  private priceForModule(key: string): string | null {
    const map = this.modulePriceMap()
    return map[key] || null
  }

  // ── Module catalog (FE picker) ──────────────────────────────────────────────

  /**
   * Sellable-module catalog for the FE picker. Pure (config + MODULE_META only) —
   * makes NO Stripe call, so it works keyless. Raw priceIds are NOT exposed; only
   * a `purchasable` boolean (a price is configured). Amounts are deferred (v1).
   */
  getCatalog(): ModuleCatalog {
    return {
      coreConfigured: !!this.corePriceId(),
      modules: SELLABLE_MODULE_KEYS.map((key) => ({
        key,
        label: MODULE_META[key].label,
        description: MODULE_META[key].description,
        purchasable: !!this.priceForModule(key),
      })),
    }
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

  /**
   * Build the line_items for a MODULAR checkout: the core/base price first (always,
   * so the sub carries the platform floor), then one item per requested sellable
   * module. Pure (no Stripe call) → unit-testable. Rejects the always-on `core`
   * pseudo-key and any module whose price is unconfigured with a clear 400.
   */
  private buildModuleLineItems(modules: string[]): { price: string; quantity: number }[] {
    const items: { price: string; quantity: number }[] = []
    const core = this.corePriceId()
    if (core) items.push({ price: core, quantity: 1 })

    const unknown: string[] = []
    const seen = new Set<string>()
    for (const key of modules) {
      if (key === CORE_MODULE) continue // core is implicit, never a line item here
      if (seen.has(key)) continue // de-dupe
      seen.add(key)
      const price = this.priceForModule(key)
      if (price) items.push({ price, quantity: 1 })
      else unknown.push(key)
    }
    if (unknown.length) {
      throw new BadRequestException({
        code: 'MODULE_PRICE_NOT_CONFIGURED',
        message: `No Stripe price configured for module(s): ${unknown.join(', ')}.`,
      })
    }
    if (items.length === 0) {
      throw new BadRequestException({
        code: 'NO_LINE_ITEMS',
        message:
          'No purchasable line items — configure a core price or at least one module price.',
      })
    }
    return items
  }

  // Overloads: legacy base-plan checkout OR modular per-module checkout. Both are
  // gated by getClient() (503 when keyless — FIRST, before any work / DB write).
  async createCheckoutSession(schoolId: string, plan: BillingPlan): Promise<{ url: string }>
  async createCheckoutSession(
    schoolId: string,
    opts: { modules: string[]; interval?: BillingPlan },
  ): Promise<{ url: string }>
  async createCheckoutSession(
    schoolId: string,
    arg: BillingPlan | { modules: string[]; interval?: BillingPlan },
  ): Promise<{ url: string }> {
    const stripe = this.stripeClient.getClient() // keyless → 503 before any work
    const lineItems =
      typeof arg === 'string'
        ? [{ price: this.resolvePriceId(arg), quantity: 1 }] // legacy base plan
        : this.buildModuleLineItems(arg.modules) // modular per-module
    const customer = await this.ensureCustomer(schoolId)

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer,
      line_items: lineItems,
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

    // ── Reconcile licensed modules from ALL line items (per-module billing) ──
    // FAIL-SAFE rule (see the no-lockout truth table):
    //   • ≥1 recognized MODULE price          → write that exact sellable set.
    //   • only a recognized core/legacy base   → write [] (genuine core-only sub;
    //     the READ layer resolveLicensed still floors [] → finance → no lockout).
    //   • items present but NONE recognized    → LEAVE licensed_modules UNTOUCHED
    //     (omit the key) — never wipe a paid set on an unknown/misconfigured
    //     catalog or a malformed payload. This is the #1 fail-safe.
    //   • no items at all                      → LEAVE UNTOUCHED (omit the key).
    // The stored set is honored in EVERY entitled status (trialing resolves like
    // active), so webhook writes during a trial take effect immediately.
    const items = sub.items?.data ?? []
    const recognizedModules: ModuleKey[] = []
    let sawRecognizedPrice = false
    for (const it of items) {
      const pid = it?.price?.id ?? null
      const mod = this.moduleFromPrice(pid)
      if (mod) {
        sawRecognizedPrice = true
        if (!recognizedModules.includes(mod)) recognizedModules.push(mod)
      } else if (this.isCorePrice(pid)) {
        sawRecognizedPrice = true // recognized core → no sellable module contributed
      }
      // else: unknown price → contributes nothing; does NOT set sawRecognizedPrice
    }

    const data: Record<string, unknown> = {
      stripeCustomerId: customerId ?? null,
      stripeSubscriptionId: sub.id,
      stripePriceId: priceId,
      plan: this.planFromPrice(priceId),
      status,
      currentPeriodEnd: periodEndUnix ? new Date(periodEndUnix * 1000) : null,
      trialEnd: trialEndUnix ? new Date(trialEndUnix * 1000) : null,
      cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    }

    if (sawRecognizedPrice) {
      // Catalog understood → the recognized sellable set is authoritative, even if
      // empty (core-only purchase writes []; read layer floors [] → finance).
      data.licensedModules = recognizedModules.map((key) => ({ key, tier: null }))
    } else if (items.length > 0) {
      // Items present but NOT ONE recognized → do NOT touch licensed_modules.
      this.logger.warn(
        `${eventType} for ${schoolId}: ${items.length} item(s) but no recognized price ` +
          `(unknown catalog / misconfig) — leaving licensed_modules UNTOUCHED. ` +
          `priceIds seen: ${items.map((i) => i?.price?.id ?? '?').join(', ')}`,
      )
    }
    // items.length === 0 → also leave untouched (data.licensedModules omitted).

    await this.prisma.subscription.upsert({
      where: { schoolId },
      update: data,
      create: { schoolId, ...data },
    })
    await this.audit.write({
      schoolId,
      action: 'billing.subscription_updated',
      targetType: 'subscription',
      metadata: {
        eventType,
        status,
        licensedModules:
          data.licensedModules !== undefined
            ? (data.licensedModules as LicensedModule[]).map((m) => m.key)
            : 'untouched',
      },
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
