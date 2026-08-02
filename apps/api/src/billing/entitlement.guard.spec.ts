import { describe, expect, it, vi } from 'vitest'
import { HttpException } from '@nestjs/common'
import type { ExecutionContext } from '@nestjs/common'
import type { Reflector } from '@nestjs/core'
import { EntitlementGuard } from './entitlement.guard.js'
import type { BillingService } from './billing.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// EntitlementGuard spec — proves (1) back-compat: NO @RequiresModule metadata =
// EXACT legacy binary isEntitled → SUBSCRIPTION_REQUIRED; (2) module path:
// licensed → 200, unlicensed → 402 MODULE_NOT_LICENSED (distinct code+module);
// (3) fail-safe direction: not entitled + metadata → SUBSCRIPTION_REQUIRED (never
// the module code). Reflector + BillingService are mocked.
// ─────────────────────────────────────────────────────────────────────────────

function ctx(req: {
  params?: Record<string, string>
  headers?: Record<string, string>
  body?: Record<string, unknown>
}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers: {}, params: {}, body: {}, ...req }) }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext
}

function guardWith(opts: {
  moduleKey?: string
  isEntitled: boolean
  isEntitledForModule?: boolean
}) {
  const billing = {
    isEntitled: vi.fn().mockResolvedValue(opts.isEntitled),
    isEntitledForModule: vi.fn().mockResolvedValue(opts.isEntitledForModule ?? false),
  } as unknown as BillingService
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(opts.moduleKey),
  } as unknown as Reflector
  return { guard: new EntitlementGuard(billing, reflector), billing }
}

/**
 * AIC Phase G — the same harness for the VARIADIC decorator. `guardWith` above is
 * left exactly as it was, mocking the metadata as a SCALAR: every case that uses
 * it still passes, which is the proof that the guard's Array.isArray
 * normalisation kept the single-key path byte-identical rather than merely
 * "compatible".
 */
function multiKeyGuard(opts: {
  keys: string[]
  isEntitled: boolean
  /** Which of `keys` the school licenses. */
  licensed: string[]
}) {
  const billing = {
    isEntitled: vi.fn().mockResolvedValue(opts.isEntitled),
    isEntitledForModule: vi.fn(async (_schoolId: string, k: string) => opts.licensed.includes(k)),
  } as unknown as BillingService
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(opts.keys),
  } as unknown as Reflector
  return { guard: new EntitlementGuard(billing, reflector), billing }
}

async function catchHttp(fn: () => Promise<unknown>): Promise<HttpException> {
  try {
    await fn()
  } catch (e) {
    return e as HttpException
  }
  throw new Error('expected an HttpException')
}

describe('EntitlementGuard — legacy (no @RequiresModule)', () => {
  it('no metadata + entitled → true (unchanged)', async () => {
    const { guard } = guardWith({ isEntitled: true })
    await expect(guard.canActivate(ctx({ params: { schoolId: 's1' } }))).resolves.toBe(true)
  })

  it('no metadata + not entitled → 402 SUBSCRIPTION_REQUIRED', async () => {
    const { guard } = guardWith({ isEntitled: false })
    const err = await catchHttp(() => guard.canActivate(ctx({ params: { schoolId: 's1' } })))
    expect(err.getStatus()).toBe(402)
    expect((err.getResponse() as { code: string }).code).toBe('SUBSCRIPTION_REQUIRED')
  })

  it('no metadata + does NOT call isEntitledForModule (byte-for-byte legacy path)', async () => {
    const { guard, billing } = guardWith({ isEntitled: true })
    await guard.canActivate(ctx({ params: { schoolId: 's1' } }))
    expect(billing.isEntitledForModule).not.toHaveBeenCalled()
  })

  it('no schoolId resolvable → 402 SUBSCRIPTION_REQUIRED (unchanged)', async () => {
    const { guard } = guardWith({ isEntitled: true })
    const err = await catchHttp(() => guard.canActivate(ctx({})))
    expect(err.getStatus()).toBe(402)
    expect((err.getResponse() as { code: string }).code).toBe('SUBSCRIPTION_REQUIRED')
  })
})

describe('EntitlementGuard — module-aware (@RequiresModule)', () => {
  it('metadata finance + entitled + licensed → true (200)', async () => {
    const { guard } = guardWith({ moduleKey: 'finance', isEntitled: true, isEntitledForModule: true })
    await expect(guard.canActivate(ctx({ params: { schoolId: 's1' } }))).resolves.toBe(true)
  })

  it('metadata planning + entitled but NOT licensed → 402 MODULE_NOT_LICENSED + module', async () => {
    const { guard } = guardWith({ moduleKey: 'planning', isEntitled: true, isEntitledForModule: false })
    const err = await catchHttp(() => guard.canActivate(ctx({ params: { schoolId: 's1' } })))
    expect(err.getStatus()).toBe(402)
    const body = err.getResponse() as { code: string; module: string }
    expect(body.code).toBe('MODULE_NOT_LICENSED')
    expect(body.module).toBe('planning')
  })

  it('metadata planning + NOT entitled at all → 402 SUBSCRIPTION_REQUIRED (not the module code)', async () => {
    const { guard, billing } = guardWith({ moduleKey: 'planning', isEntitled: false })
    const err = await catchHttp(() => guard.canActivate(ctx({ params: { schoolId: 's1' } })))
    expect((err.getResponse() as { code: string }).code).toBe('SUBSCRIPTION_REQUIRED')
    expect(billing.isEntitledForModule).not.toHaveBeenCalled()
  })

  it('resolves schoolId from x-school-id header', async () => {
    const { guard } = guardWith({ moduleKey: 'finance', isEntitled: true, isEntitledForModule: true })
    await expect(
      guard.canActivate(ctx({ headers: { 'x-school-id': 's9' } })),
    ).resolves.toBe(true)
  })

  it('a SINGLE-key 402 body carries NO `modules` field — byte-identical to what shipped', async () => {
    const { guard } = guardWith({ moduleKey: 'planning', isEntitled: true, isEntitledForModule: false })
    const err = await catchHttp(() => guard.canActivate(ctx({ params: { schoolId: 's1' } })))
    const body = err.getResponse() as Record<string, unknown>
    expect('modules' in body).toBe(false)
    expect(body.message).toBe(
      "The Planning & Forecasting module isn't included on your plan — add it to continue.",
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase G — MULTI-KEY, **OR** SEMANTICS.
//
// /improvement rides on `accreditation` OR `strategy` because there is
// deliberately no `improvement` module key and no third SKU. The guard is the
// only place that OR exists, so it is the only place it can be got wrong.
// ─────────────────────────────────────────────────────────────────────────────
describe('EntitlementGuard — @RequiresModule(a, b) is OR, not AND', () => {
  it('licensing the FIRST key admits the route, and SHORT-CIRCUITS', async () => {
    const { guard, billing } = multiKeyGuard({
      keys: ['accreditation', 'strategy'],
      isEntitled: true,
      licensed: ['accreditation'],
    })
    await expect(guard.canActivate(ctx({ params: { schoolId: 's1' } }))).resolves.toBe(true)
    // ONE round-trip, not two: a school that already qualifies must not pay for
    // a second lookup it cannot need.
    expect(billing.isEntitledForModule).toHaveBeenCalledTimes(1)
    expect(billing.isEntitledForModule).toHaveBeenCalledWith('s1', 'accreditation')
  })

  it('licensing the SECOND key admits the route', async () => {
    const { guard, billing } = multiKeyGuard({
      keys: ['accreditation', 'strategy'],
      isEntitled: true,
      licensed: ['strategy'],
    })
    await expect(guard.canActivate(ctx({ params: { schoolId: 's1' } }))).resolves.toBe(true)
    expect(billing.isEntitledForModule).toHaveBeenCalledTimes(2)
  })

  it('licensing NEITHER 402s, names the PRIMARY key, and lists both', async () => {
    const { guard } = multiKeyGuard({
      keys: ['accreditation', 'strategy'],
      isEntitled: true,
      licensed: [],
    })
    const err = await catchHttp(() => guard.canActivate(ctx({ params: { schoolId: 's1' } })))
    expect(err.getStatus()).toBe(402)
    const body = err.getResponse() as { code: string; module: string; modules: string[]; message: string }
    expect(body.code).toBe('MODULE_NOT_LICENSED')
    // `module` stays the single primary key: apps/web's moduleKeyFromError reads
    // exactly this field and was not changed.
    expect(body.module).toBe('accreditation')
    expect(body.modules).toEqual(['accreditation', 'strategy'])
    // The sentence offers a CHOICE. Telling a school it needs both when either
    // will do is an upsell for a module it does not need.
    expect(body.message).toBe(
      'This needs the Accreditation or Strategic Planning module — add either one to continue.',
    )
  })

  it('NOT entitled at all still beats "not licensed", even multi-key', async () => {
    const { guard, billing } = multiKeyGuard({
      keys: ['accreditation', 'strategy'],
      isEntitled: false,
      licensed: ['strategy'],
    })
    const err = await catchHttp(() => guard.canActivate(ctx({ params: { schoolId: 's1' } })))
    expect((err.getResponse() as { code: string }).code).toBe('SUBSCRIPTION_REQUIRED')
    expect(billing.isEntitledForModule).not.toHaveBeenCalled()
  })

  it('an EMPTY key list is the legacy path, not an open door', async () => {
    // A route decorated `@RequiresModule()` must not become ungated.
    const { guard, billing } = multiKeyGuard({ keys: [], isEntitled: true, licensed: [] })
    await expect(guard.canActivate(ctx({ params: { schoolId: 's1' } }))).resolves.toBe(true)
    expect(billing.isEntitledForModule).not.toHaveBeenCalled()
    const denied = multiKeyGuard({ keys: [], isEntitled: false, licensed: [] })
    const err = await catchHttp(() => denied.guard.canActivate(ctx({ params: { schoolId: 's1' } })))
    expect((err.getResponse() as { code: string }).code).toBe('SUBSCRIPTION_REQUIRED')
  })
})
