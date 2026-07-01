import { describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import type { Subscription, SubscriptionStatus } from '@finrep/db'
import { BillingService } from './billing.service.js'
import type { PrismaService } from '../prisma/prisma.service.js'
import type { StripeClientService } from './stripe-client.service.js'
import type { AuditService } from '../common/audit/audit.service.js'
import type { ConfigService } from '@nestjs/config'

// ─────────────────────────────────────────────────────────────────────────────
// Per-module Stripe billing — pure mapping + webhook reconciliation (FAIL-SAFE)
// + modular checkout line-items + back-compat. Framework-free: we build the
// service with a config STUB (so stripe.modulePrices/priceCore/priceMonthly are
// fixtures) and a mock prisma whose upsert captures its args.
// ─────────────────────────────────────────────────────────────────────────────

const FUTURE = new Date(Date.now() + 30 * 86_400_000)

const CONFIG: Record<string, unknown> = {
  'stripe.priceCore': 'price_core',
  'stripe.priceMonthly': 'price_monthly',
  'stripe.priceYearly': 'price_yearly',
  'stripe.modulePrices': { governance: 'price_gov', planning: 'price_plan' },
  'stripe.successUrl': 'https://s',
  'stripe.cancelUrl': 'https://c',
  'stripe.trialDays': 14,
}

function existingSub(over: Partial<Subscription> = {}): Subscription {
  return {
    id: 's1',
    schoolId: 'school-1',
    stripeCustomerId: 'cus_1',
    stripeSubscriptionId: 'sub_1',
    plan: null,
    stripePriceId: null,
    status: 'active' as SubscriptionStatus,
    currentPeriodEnd: FUTURE,
    trialEnd: null,
    cancelAtPeriodEnd: false,
    licensedModules: null,
    createdAt: new Date(),
    // updatedAt in the PAST so the replay guard never trips by default.
    updatedAt: new Date(Date.now() - 3600_000),
    ...over,
  } as Subscription
}

function makeService(opts: {
  existing?: Subscription | null
  stripe?: Partial<StripeClientService>
} = {}) {
  const upsert = vi.fn().mockResolvedValue(existingSub())
  const findUnique = vi.fn().mockResolvedValue(opts.existing ?? existingSub())
  const prisma = {
    subscription: { findUnique, upsert, update: vi.fn(), findFirst: vi.fn() },
  } as unknown as PrismaService
  const stripeClient = (opts.stripe ?? {}) as StripeClientService
  const audit = { write: vi.fn() } as unknown as AuditService
  const config = {
    get: vi.fn((k: string) => CONFIG[k]),
  } as unknown as ConfigService
  const svc = new BillingService(prisma, stripeClient, audit, config)
  return { svc, upsert, findUnique }
}

// Build a fake Stripe.Subscription with the given priceIds as items.
function fakeSub(priceIds: string[], over: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  return {
    id: 'sub_1',
    customer: 'cus_1',
    status: 'active',
    cancel_at_period_end: false,
    metadata: { schoolId: 'school-1' },
    current_period_end: Math.floor(FUTURE.getTime() / 1000),
    items: { data: priceIds.map((id) => ({ price: { id } })) },
    ...over,
  } as unknown as Stripe.Subscription
}

// Invoke the private reconciliation through the public event handler.
async function reconcile(
  svc: BillingService,
  priceIds: string[],
  over: Partial<Stripe.Subscription> = {},
  created = Math.floor(Date.now() / 1000),
) {
  await svc.handleEvent({
    id: 'evt_1',
    type: 'customer.subscription.updated',
    created,
    data: { object: fakeSub(priceIds, over) },
  } as unknown as Stripe.Event)
}

// ── A) Pure mapping helpers (via reconciliation observable behavior) ──────────
// The mapping helpers are private; we assert them through reconciliation output.

describe('module ↔ price mapping (config-driven, via reconciliation)', () => {
  it('recognized module price → that module key; core/unknown excluded', async () => {
    const { svc, upsert } = makeService()
    await reconcile(svc, ['price_gov'])
    expect(upsert.mock.calls[0][0].update.licensedModules).toEqual([
      { key: 'governance', tier: null },
    ])
  })
})

// ── B) Webhook reconciliation — the FAIL-SAFE core ────────────────────────────

describe('reconcileModules (FAIL-SAFE)', () => {
  it('multi-item [core, governance, planning] → exact sellable set (core excluded)', async () => {
    const { svc, upsert } = makeService()
    await reconcile(svc, ['price_core', 'price_gov', 'price_plan'])
    const data = upsert.mock.calls[0][0].update
    expect(data.licensedModules).toEqual([
      { key: 'governance', tier: null },
      { key: 'planning', tier: null },
    ])
  })

  it('core-only [price_core] → writes [] (meaningful; read layer floors to finance)', async () => {
    const { svc, upsert } = makeService()
    await reconcile(svc, ['price_core'])
    expect(upsert.mock.calls[0][0].update.licensedModules).toEqual([])
  })

  it('legacy base [price_monthly] → recognized-core → writes []; plan still "monthly"', async () => {
    const { svc, upsert } = makeService()
    await reconcile(svc, ['price_monthly'])
    const data = upsert.mock.calls[0][0].update
    expect(data.licensedModules).toEqual([])
    expect(data.plan).toBe('monthly')
    expect(data.stripePriceId).toBe('price_monthly')
    expect(data.status).toBe('active')
  })

  it('unknown-price-only → licensed_modules key OMITTED (UNTOUCHED, not wiped)', async () => {
    const { svc, upsert } = makeService()
    await reconcile(svc, ['price_unknown'])
    const data = upsert.mock.calls[0][0].update
    expect('licensedModules' in data).toBe(false)
    // status/plan/period still written even when modules are untouched.
    expect(data.status).toBe('active')
    expect('stripePriceId' in data).toBe(true)
  })

  it('mixed [governance, unknown] → writes [{governance}] (junk ignored, still recognized)', async () => {
    const { svc, upsert } = makeService()
    await reconcile(svc, ['price_gov', 'price_unknown'])
    expect(upsert.mock.calls[0][0].update.licensedModules).toEqual([
      { key: 'governance', tier: null },
    ])
  })

  it('no items at all → licensed_modules key OMITTED (UNTOUCHED)', async () => {
    const { svc, upsert } = makeService()
    await reconcile(svc, [])
    expect('licensedModules' in upsert.mock.calls[0][0].update).toBe(false)
  })

  it('duplicate module price → deduped once', async () => {
    const { svc, upsert } = makeService()
    await reconcile(svc, ['price_gov', 'price_gov'])
    expect(upsert.mock.calls[0][0].update.licensedModules).toEqual([
      { key: 'governance', tier: null },
    ])
  })

  it('replay guard: stale event (older than row.updatedAt) skips upsert entirely', async () => {
    const rowUpdatedAt = new Date()
    const { svc, upsert } = makeService({
      existing: existingSub({ updatedAt: rowUpdatedAt, stripeSubscriptionId: 'sub_1' }),
    })
    // event.created 1 hour BEFORE the row's updatedAt → replay → skip.
    await reconcile(svc, ['price_gov'], {}, Math.floor((rowUpdatedAt.getTime() - 3600_000) / 1000))
    expect(upsert).not.toHaveBeenCalled()
  })
})

// ── C) Modular checkout line-item construction ────────────────────────────────

describe('createCheckoutSession — modular line items', () => {
  function stripeMock() {
    const create = vi.fn().mockResolvedValue({ url: 'https://checkout' })
    const client = {
      customers: { create: vi.fn().mockResolvedValue({ id: 'cus_new' }) },
      checkout: { sessions: { create } },
    }
    return {
      stripe: { getClient: () => client, isConfigured: () => true } as unknown as StripeClientService,
      create,
    }
  }

  it('[governance, planning] → line_items [core, gov, plan] (core first)', async () => {
    const { stripe, create } = stripeMock()
    const { svc } = makeService({ stripe, existing: existingSub({ stripeCustomerId: 'cus_1' }) })
    await svc.createCheckoutSession('school-1', { modules: ['governance', 'planning'] })
    expect(create.mock.calls[0][0].line_items).toEqual([
      { price: 'price_core', quantity: 1 },
      { price: 'price_gov', quantity: 1 },
      { price: 'price_plan', quantity: 1 },
    ])
  })

  it("'core' pseudo-key ignored in the loop (core still present once as base)", async () => {
    const { stripe, create } = stripeMock()
    const { svc } = makeService({ stripe, existing: existingSub({ stripeCustomerId: 'cus_1' }) })
    await svc.createCheckoutSession('school-1', { modules: ['core', 'governance'] })
    expect(create.mock.calls[0][0].line_items).toEqual([
      { price: 'price_core', quantity: 1 },
      { price: 'price_gov', quantity: 1 },
    ])
  })

  it('unknown / unpriced module → MODULE_PRICE_NOT_CONFIGURED (400)', async () => {
    const { stripe } = stripeMock()
    const { svc } = makeService({ stripe, existing: existingSub({ stripeCustomerId: 'cus_1' }) })
    await expect(
      svc.createCheckoutSession('school-1', { modules: ['bogus'] }),
    ).rejects.toMatchObject({ response: { code: 'MODULE_PRICE_NOT_CONFIGURED' } })
  })

  it('keyless getClient() throws → propagates (no prisma / customer touched)', async () => {
    const throwing = {
      getClient: () => {
        throw new Error('STRIPE_NOT_CONFIGURED')
      },
    } as unknown as StripeClientService
    const { svc } = makeService({ stripe: throwing })
    await expect(
      svc.createCheckoutSession('school-1', { modules: ['governance'] }),
    ).rejects.toThrow('STRIPE_NOT_CONFIGURED')
  })

  it('back-compat: legacy plan checkout still builds a single base line item', async () => {
    const { stripe, create } = stripeMock()
    const { svc } = makeService({ stripe, existing: existingSub({ stripeCustomerId: 'cus_1' }) })
    await svc.createCheckoutSession('school-1', 'monthly')
    expect(create.mock.calls[0][0].line_items).toEqual([{ price: 'price_monthly', quantity: 1 }])
  })
})

// ── D) getCatalog (pure, keyless) ─────────────────────────────────────────────

describe('getCatalog', () => {
  it('marks configured modules purchasable, unset ones not; coreConfigured true', () => {
    const { svc } = makeService()
    const cat = svc.getCatalog()
    expect(cat.coreConfigured).toBe(true)
    const gov = cat.modules.find((m) => m.key === 'governance')
    const hr = cat.modules.find((m) => m.key === 'hr')
    expect(gov?.purchasable).toBe(true)
    expect(hr?.purchasable).toBe(false)
    // no raw priceIds leaked
    expect(JSON.stringify(cat)).not.toContain('price_gov')
  })
})
