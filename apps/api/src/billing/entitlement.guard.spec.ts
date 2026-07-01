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
})
