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

function makeHarness(fixture: Subscription) {
  const update = vi.fn().mockResolvedValue(fixture)
  const auditWrite = vi.fn().mockResolvedValue(undefined)
  const prisma = {
    subscription: {
      findUnique: vi.fn().mockResolvedValue(fixture),
      upsert: vi.fn().mockResolvedValue(fixture),
      update,
    },
  } as unknown as PrismaService
  const stripeClient = {} as StripeClientService
  const audit = { write: auditWrite } as unknown as AuditService
  const config = { get: vi.fn().mockReturnValue(14) } as unknown as ConfigService
  return { svc: new BillingService(prisma, stripeClient, audit, config), update, auditWrite }
}

function makeService(fixture: Subscription): BillingService {
  return makeHarness(fixture).svc
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

  it('trialing (future trialEnd) + NULL → core:true, finance:true, others false (trial = active resolution)', async () => {
    const svc = makeService(sub({ status: 'trialing', trialEnd: FUTURE, licensedModules: null }))
    expect(await svc.isEntitledForModule('school-1', 'core')).toBe(true)
    expect(await svc.isEntitledForModule('school-1', 'finance')).toBe(true)
    expect(await svc.isEntitledForModule('school-1', 'planning')).toBe(false)
    expect(await svc.isEntitledForModule('school-1', 'hr')).toBe(false)
    expect(await svc.isEntitledForModule('school-1', 'governance')).toBe(false)
  })

  it('trialing + [{governance}] → governance:true, finance:false, core:true (explicit set honored during trial)', async () => {
    const svc = makeService(sub({ status: 'trialing', trialEnd: FUTURE, licensedModules: [{ key: 'governance' }] as unknown as Subscription['licensedModules'] }))
    expect(await svc.isEntitledForModule('school-1', 'governance')).toBe(true)
    expect(await svc.isEntitledForModule('school-1', 'finance')).toBe(false)
    expect(await svc.isEntitledForModule('school-1', 'core')).toBe(true)
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

  it('trialing + NULL → [{key:finance,tier:null}] (trial resolves exactly like active)', async () => {
    const svc = makeService(sub({ status: 'trialing', trialEnd: FUTURE, licensedModules: null }))
    const view = await svc.getBilling('school-1')
    expect(view.licensedModules).toEqual([{ key: 'finance', tier: null }])
  })

  it('trialing + [{finance},{governance}] → exactly that set', async () => {
    const svc = makeService(sub({ status: 'trialing', trialEnd: FUTURE, licensedModules: [{ key: 'finance' }, { key: 'governance' }] as unknown as Subscription['licensedModules'] }))
    const view = await svc.getBilling('school-1')
    expect(view.licensedModules).toEqual([
      { key: 'finance', tier: null },
      { key: 'governance', tier: null },
    ])
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

// ─────────────────────────────────────────────────────────────────────────────
// unlockModule — the PRE-STRIPE FREE UNLOCK STUB (owner-only endpoint logic).
// Resolve-first merge semantics + idempotency + sellable-key defense-in-depth.
// ─────────────────────────────────────────────────────────────────────────────
describe('BillingService.unlockModule', () => {
  it('trialing + NULL unlock governance → writes [{finance},{governance}] (finance preserved), audits, returns BillingView', async () => {
    const { svc, update, auditWrite } = makeHarness(
      sub({ status: 'trialing', trialEnd: FUTURE, licensedModules: null }),
    )
    const view = await svc.unlockModule('school-1', 'governance')

    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith({
      where: { schoolId: 'school-1' },
      data: {
        licensedModules: [
          { key: 'finance', tier: null },
          { key: 'governance', tier: null },
        ],
      },
    })
    expect(auditWrite).toHaveBeenCalledTimes(1)
    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-1',
        action: 'billing.module_unlocked',
        targetType: 'subscription',
        metadata: { module: 'governance', method: 'free_stub' },
      }),
    )
    // BillingView shape (fixture mock still returns the pre-write row; shape is
    // what matters here — the live path re-reads the updated row).
    expect(view).toEqual(
      expect.objectContaining({
        status: expect.any(String),
        isEntitled: expect.any(Boolean),
        licensedModules: expect.any(Array),
        daysLeft: expect.anything(),
      }),
    )
  })

  it('idempotent: key already owned → NO update, NO audit, still returns a BillingView', async () => {
    const { svc, update, auditWrite } = makeHarness(
      sub({
        status: 'trialing',
        trialEnd: FUTURE,
        licensedModules: [{ key: 'finance' }, { key: 'governance' }] as unknown as Subscription['licensedModules'],
      }),
    )
    const view = await svc.unlockModule('school-1', 'governance')
    expect(update).not.toHaveBeenCalled()
    expect(auditWrite).not.toHaveBeenCalled()
    expect(view.licensedModules).toEqual([
      { key: 'finance', tier: null },
      { key: 'governance', tier: null },
    ])
  })

  it('bogus key and core → BadRequestException MODULE_NOT_SELLABLE (defense-in-depth)', async () => {
    const { svc, update } = makeHarness(sub({ status: 'trialing', trialEnd: FUTURE }))
    for (const bad of ['bogus', 'core']) {
      await expect(
        svc.unlockModule('school-1', bad as never),
      ).rejects.toMatchObject({ response: { code: 'MODULE_NOT_SELLABLE' } })
    }
    expect(update).not.toHaveBeenCalled()
  })

  it('active + [{planning}] unlock hr → writes [{planning},{hr}] (explicit set extended, finance NOT re-added)', async () => {
    const { svc, update } = makeHarness(
      sub({ status: 'active', licensedModules: [{ key: 'planning' }] as unknown as Subscription['licensedModules'] }),
    )
    await svc.unlockModule('school-1', 'hr')
    expect(update).toHaveBeenCalledWith({
      where: { schoolId: 'school-1' },
      data: {
        licensedModules: [
          { key: 'planning', tier: null },
          { key: 'hr', tier: null },
        ],
      },
    })
  })
})

describe('BillingController.addModule roles metadata', () => {
  it('is owner-only', async () => {
    const { BillingController } = await import('./billing.controller.js')
    const { ROLES_KEY } = await import('../common/decorators/roles.decorator.js')
    const roles = Reflect.getMetadata(ROLES_KEY, BillingController.prototype.addModule)
    expect(roles).toEqual(['owner'])
  })
})
