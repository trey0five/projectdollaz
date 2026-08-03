import 'reflect-metadata'
import { describe, expect, it, vi } from 'vitest'
import { validate } from 'class-validator'
import { plainToInstance } from 'class-transformer'
import { VisitController } from './visit.controller.js'
import { VisitQueryDto } from './dto/visit-query.dto.js'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { REQUIRES_MODULE } from '../billing/requires-module.decorator.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase H — SPEC-API-5. The route, at the boundary.
//
// The guard chain is asserted by METADATA REFLECTION rather than by booting Nest:
// a decorator deleted in a refactor is invisible to every functional test and
// visible to this one. The module gate is what keeps an unlicensed school from
// learning how many rules exist, let alone what a visiting team would find.
// ─────────────────────────────────────────────────────────────────────────────

const GUARDS = '__guards__'
const ROLES = 'roles'

describe('VisitController — the guard chain', () => {
  it('carries JwtAuthGuard, RolesGuard and EntitlementGuard at the class level', () => {
    const guards = (Reflect.getMetadata(GUARDS, VisitController) as unknown[]) ?? []
    expect(guards).toContain(JwtAuthGuard)
    expect(guards).toContain(RolesGuard)
    expect(guards).toContain(EntitlementGuard)
  })

  it('is gated on the accreditation module', () => {
    // @RequiresModule is VARIADIC since Phase G, so a single-key route stores a
    // ONE-ELEMENT LIST. keys[0] is what the 402's `module` field carries.
    const keys = Reflect.getMetadata(REQUIRES_MODULE, VisitController) as string[]
    expect(keys).toEqual(['accreditation'])
  })

  it('VIEWER READS — a board member is the audience for "what would a team find?"', () => {
    const proto = VisitController.prototype as unknown as Record<string, object>
    expect(Reflect.getMetadata(ROLES, proto.getVisit)).toEqual(['owner', 'accountant', 'viewer'])
  })

  it('there is NO write route on this controller at all', () => {
    // The read/write role split is vacuously satisfied because adoption rides on
    // Phase G's existing idempotent POST /improvement/adopt. Phase H adds no
    // write endpoint and therefore no new @IsIn list to keep in sync.
    const proto = VisitController.prototype as unknown as Record<string, unknown>
    const methods = Object.getOwnPropertyNames(proto).filter((m) => m !== 'constructor')
    expect(methods).toEqual(['getVisit'])
  })
})

describe('VisitController — it delegates and composes nothing', () => {
  it('passes the schoolId and the validated query straight through', async () => {
    const svc = { getVisit: vi.fn(async () => ({ version: '1.0.0' })) }
    const c = new VisitController(svc as never)
    await c.getVisit('school-A', { periodId: 'p-1' })
    expect(svc.getVisit).toHaveBeenCalledWith('school-A', { periodId: 'p-1' })
  })

  it('returns the service payload untouched', async () => {
    const payload = { version: '1.0.0', acts: {} }
    const svc = { getVisit: vi.fn(async () => payload) }
    const c = new VisitController(svc as never)
    expect(await c.getVisit('school-A', {})).toBe(payload)
  })
})

describe('VisitQueryDto — the global forbidNonWhitelisted pipe has something to whitelist', () => {
  it('accepts periodId as a UUID and nothing else as periodId', async () => {
    const ok = plainToInstance(VisitQueryDto, {
      periodId: '11111111-2222-4333-8444-555555555555',
    })
    expect(await validate(ok)).toHaveLength(0)
    const bad = plainToInstance(VisitQueryDto, { periodId: 'not-a-uuid' })
    expect(await validate(bad)).not.toHaveLength(0)
  })

  it('accepts an EMPTY query — the visit needs no parameters at all', async () => {
    expect(await validate(plainToInstance(VisitQueryDto, {}))).toHaveLength(0)
  })

  it('REJECTS an unknown field under forbidNonWhitelisted', async () => {
    // `validate` alone ignores unknown keys; the production pipe runs with
    // `whitelist + forbidNonWhitelisted`, so the spec runs it the same way. A
    // `frameworkId` passthrough added "for symmetry" fails here, which is the
    // point: the twin resolves the framework and two resolvers would fork.
    const dto = plainToInstance(VisitQueryDto, { frameworkId: 'fw-1' })
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true })
    expect(errors).not.toHaveLength(0)
    expect(errors[0].property).toBe('frameworkId')
  })
})
