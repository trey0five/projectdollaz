import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Subscription, SubscriptionStatus } from '@finrep/db'
import { BillingService } from './billing.service.js'
import type { PrismaService } from '../prisma/prisma.service.js'
import type { StripeClientService } from './stripe-client.service.js'
import type { AuditService } from '../common/audit/audit.service.js'
import type { ConfigService } from '@nestjs/config'

// ─────────────────────────────────────────────────────────────────────────────
// BillingService per-module entitlement spec — framework-free (no Nest boot, no
// real Prisma/Stripe). We stub subscription.findUnique to return a fixture and
// assert the isEntitledForModule matrix + resolveLicensed no-lockout behavior +
// getBilling's licensedModules surface.
// ─────────────────────────────────────────────────────────────────────────────

const FUTURE = new Date(Date.now() + 30 * 86_400_000)
const PAST = new Date(Date.now() - 30 * 86_400_000)

function sub(over: Partial<Subscription>): Subscription {
  return {
    id: 's1',
    schoolId: 'school-1',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    plan: null,
    stripePriceId: null,
    status: 'active' as SubscriptionStatus,
    currentPeriodEnd: FUTURE,
    trialEnd: null,
    cancelAtPeriodEnd: false,
    licensedModules: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as Subscription
}

function makeService(fixture: Subscription): BillingService {
  const prisma = {
    subscription: {
      findUnique: vi.fn().mockResolvedValue(fixture),
      upsert: vi.fn().mockResolvedValue(fixture),
    },
  } as unknown as PrismaService
  const stripeClient = {} as StripeClientService
  const audit = { write: vi.fn() } as unknown as AuditService
  const config = { get: vi.fn().mockReturnValue(14) } as unknown as ConfigService
  return new BillingService(prisma, stripeClient, audit, config)
}

describe('BillingService.isEntitledForModule', () => {
  it('active + NULL licensedModules → core:true, finance:true (legacy), planning:false', async () => {
    const svc = makeService(sub({ status: 'active', licensedModules: null }))
    expect(await svc.isEntitledForModule('school-1', 'core')).toBe(true)
    expect(await svc.isEntitledForModule('school-1', 'finance')).toBe(true)
    expect(await svc.isEntitledForModule('school-1', 'planning')).toBe(false)
  })

  it('active + [{finance}] → finance:true, planning:false, core:true', async () => {
    const svc = makeService(sub({ status: 'active', licensedModules: [{ key: 'finance' }] as unknown as Subscription['licensedModules'] }))
    expect(await svc.isEntitledForModule('school-1', 'finance')).toBe(true)
    expect(await svc.isEntitledForModule('school-1', 'planning')).toBe(false)
    expect(await svc.isEntitledForModule('school-1', 'core')).toBe(true)
  })

  it('active + [{planning}] → planning:true, finance:false (explicit set replaces default)', async () => {
    const svc = makeService(sub({ status: 'active', licensedModules: [{ key: 'planning' }] as unknown as Subscription['licensedModules'] }))
    expect(await svc.isEntitledForModule('school-1', 'planning')).toBe(true)
    expect(await svc.isEntitledForModule('school-1', 'finance')).toBe(false)
    expect(await svc.isEntitledForModule('school-1', 'core')).toBe(true)
  })

  it('active + [] (empty) → resolves to finance (no lockout)', async () => {
    const svc = makeService(sub({ status: 'active', licensedModules: [] as unknown as Subscription['licensedModules'] }))
    expect(await svc.isEntitledForModule('school-1', 'finance')).toBe(true)
    expect(await svc.isEntitledForModule('school-1', 'planning')).toBe(false)
  })

  it('trialing (future trialEnd) → EVERY module true (all-access)', async () => {
    const svc = makeService(sub({ status: 'trialing', trialEnd: FUTURE, licensedModules: null }))
    for (const k of ['core', 'finance', 'planning', 'hr', 'governance', 'facilities']) {
      expect(await svc.isEntitledForModule('school-1', k)).toBe(true)
    }
  })

  it('trialing EXPIRED trialEnd → all false (not entitled beats all-access)', async () => {
    const svc = makeService(sub({ status: 'trialing', trialEnd: PAST, licensedModules: null }))
    expect(await svc.isEntitledForModule('school-1', 'core')).toBe(false)
    expect(await svc.isEntitledForModule('school-1', 'finance')).toBe(false)
    expect(await svc.isEntitledForModule('school-1', 'planning')).toBe(false)
  })

  it('past_due / canceled / none → all false including core', async () => {
    for (const status of ['past_due', 'canceled', 'none'] as SubscriptionStatus[]) {
      const svc = makeService(sub({ status, trialEnd: null }))
      expect(await svc.isEntitledForModule('school-1', 'core')).toBe(false)
      expect(await svc.isEntitledForModule('school-1', 'finance')).toBe(false)
    }
  })

  it('active + garbage licensedModules (non-array / bogus keys) → finance (fail-safe, never throws)', async () => {
    const garbage = makeService(sub({ status: 'active', licensedModules: 'not-an-array' as unknown as Subscription['licensedModules'] }))
    expect(await garbage.isEntitledForModule('school-1', 'finance')).toBe(true)
    expect(await garbage.isEntitledForModule('school-1', 'planning')).toBe(false)

    const bogus = makeService(sub({ status: 'active', licensedModules: [{ key: 'bogus' }, { nope: 1 }] as unknown as Subscription['licensedModules'] }))
    expect(await bogus.isEntitledForModule('school-1', 'finance')).toBe(true)
    expect(await bogus.isEntitledForModule('school-1', 'planning')).toBe(false)
  })

  it('active + [{hr},{bogus}] → hr passes, bogus filtered (finance NOT re-added since a valid key exists)', async () => {
    const svc = makeService(sub({ status: 'active', licensedModules: [{ key: 'hr' }, { key: 'bogus' }] as unknown as Subscription['licensedModules'] }))
    expect(await svc.isEntitledForModule('school-1', 'hr')).toBe(true)
    expect(await svc.isEntitledForModule('school-1', 'finance')).toBe(false)
  })
})

describe('BillingService.getBilling licensedModules', () => {
  it('active + NULL set → [{key:finance}]', async () => {
    const svc = makeService(sub({ status: 'active', licensedModules: null }))
    const view = await svc.getBilling('school-1')
    expect(view.licensedModules).toEqual([{ key: 'finance', tier: null }])
  })

  it('active + [{finance, tier:pro}] → tier preserved', async () => {
    const svc = makeService(sub({ status: 'active', licensedModules: [{ key: 'finance', tier: 'plus' }] as unknown as Subscription['licensedModules'] }))
    const view = await svc.getBilling('school-1')
    expect(view.licensedModules).toEqual([{ key: 'finance', tier: 'plus' }])
  })

  it('trialing → full sellable set (all non-core keys), all-access mirror', async () => {
    const svc = makeService(sub({ status: 'trialing', trialEnd: FUTURE, licensedModules: null }))
    const view = await svc.getBilling('school-1')
    const keys = view.licensedModules.map((m) => m.key)
    expect(keys).toContain('finance')
    expect(keys).toContain('planning')
    expect(keys).not.toContain('core')
  })

  it('not entitled (canceled) → []', async () => {
    const svc = makeService(sub({ status: 'canceled', trialEnd: null }))
    const view = await svc.getBilling('school-1')
    expect(view.licensedModules).toEqual([])
  })
})

describe('BillingService.isEntitled (legacy default unchanged)', () => {
  beforeEach(() => vi.clearAllMocks())
  it('active → true; canceled → false', async () => {
    expect(await makeService(sub({ status: 'active' })).isEntitled('school-1')).toBe(true)
    expect(await makeService(sub({ status: 'canceled', trialEnd: null })).isEntitled('school-1')).toBe(false)
  })
})
