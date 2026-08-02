import 'reflect-metadata'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { validate } from 'class-validator'
import { plainToInstance } from 'class-transformer'
import { TwinController } from './twin.controller.js'
import { TwinQueryDto } from './dto/twin-query.dto.js'
import { MuteFindingDto } from './dto/mute-finding.dto.js'
import { FindingStatusDto } from './dto/finding-status.dto.js'
import { AckFindingDto } from './dto/ack-finding.dto.js'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase E — the routes, at the boundary.
//
// The guard chain is asserted by METADATA REFLECTION rather than by booting Nest:
// a decorator that is deleted in a refactor is invisible to every functional test
// and visible to this one. The module gate is what makes acceptance 7 true at the
// route level — a finance-only school never reaches the engine at all.
// ─────────────────────────────────────────────────────────────────────────────

/** Nest stores class-level guards under this key. */
const GUARDS = '__guards__'
const ROLES = 'roles'

function guardsOn(target: object): unknown[] {
  return (Reflect.getMetadata(GUARDS, target) as unknown[]) ?? []
}

describe('TwinController — the guard chain', () => {
  it('carries JwtAuthGuard, RolesGuard and EntitlementGuard at the class level', () => {
    const guards = guardsOn(TwinController)
    expect(guards).toContain(JwtAuthGuard)
    expect(guards).toContain(RolesGuard)
    expect(guards).toContain(EntitlementGuard)
  })

  it('is gated on the accreditation module', () => {
    // The decorator's metadata key is owned by requires-module.decorator.ts; the
    // assertion reads whatever key it set rather than re-typing the string.
    const keys = Reflect.getMetadataKeys(TwinController)
    const moduleKey = keys.find((k) => String(k).toLowerCase().includes('module'))
    expect(moduleKey, 'no @RequiresModule metadata on TwinController').toBeDefined()
    // AIC Phase G made @RequiresModule VARIADIC (OR semantics for /improvement),
    // so a single-key route stores a ONE-ELEMENT LIST. The decorator call site on
    // TwinController is unchanged.
    expect(Reflect.getMetadata(moduleKey as string, TwinController)).toEqual(['accreditation'])
  })

  it('READ is open to all three roles; every WRITE excludes viewer', () => {
    const proto = TwinController.prototype as unknown as Record<string, object>
    expect(Reflect.getMetadata(ROLES, proto.getTwin)).toEqual(['owner', 'accountant', 'viewer'])
    for (const m of ['ack', 'mute', 'setStatus']) {
      const roles = Reflect.getMetadata(ROLES, proto[m]) as string[]
      expect(roles).toEqual(['owner', 'accountant'])
      expect(roles).not.toContain('viewer')
    }
  })
})

describe('TwinController — it delegates and composes nothing', () => {
  it('passes the schoolId and the validated query straight through', async () => {
    const svc = {
      getTwin: vi.fn(async () => ({ findings: [] })),
      ack: vi.fn(async () => ({ id: 'f-1' })),
      mute: vi.fn(async () => ({ id: 'f-1' })),
      setStatus: vi.fn(async () => ({ id: 'f-1' })),
    }
    const c = new TwinController(svc as never)
    await c.getTwin('school-A', { severity: 'critical' })
    expect(svc.getTwin).toHaveBeenCalledWith('school-A', { severity: 'critical' })

    const user = { id: 'user-1' } as never
    await c.ack('school-A', 'f-1', { reason: 'r' }, user)
    expect(svc.ack).toHaveBeenCalledWith('school-A', 'f-1', { reason: 'r' }, 'user-1')
    await c.mute('school-A', 'f-1', { days: 5, reason: 'r' }, user)
    expect(svc.mute).toHaveBeenCalledWith('school-A', 'f-1', { days: 5, reason: 'r' }, 'user-1')
    await c.setStatus('school-A', 'f-1', { status: 'resolved' }, user)
    expect(svc.setStatus).toHaveBeenCalledWith('school-A', 'f-1', { status: 'resolved' }, 'user-1')
  })
})

describe('the DTOs — the global forbidNonWhitelisted pipe has something to whitelist', () => {
  it('TwinQueryDto accepts a real ruleId and REJECTS an invented one', async () => {
    const ok = plainToInstance(TwinQueryDto, { ruleId: 'ACC-ASSURANCE-GAP' })
    expect(await validate(ok)).toHaveLength(0)
    const bad = plainToInstance(TwinQueryDto, { ruleId: 'NOT-A-RULE' })
    expect(await validate(bad)).not.toHaveLength(0)
  })

  it('TwinQueryDto coerces includeCleared from the query string', async () => {
    const dto = plainToInstance(TwinQueryDto, { includeCleared: 'true' })
    expect(await validate(dto)).toHaveLength(0)
    expect(dto.includeCleared).toBe(true)
  })

  it('TwinQueryDto rejects an unknown severity', async () => {
    const dto = plainToInstance(TwinQueryDto, { severity: 'catastrophic' })
    expect(await validate(dto)).not.toHaveLength(0)
  })

  it('MuteFindingDto REQUIRES a reason — a mute with no reason is a forgotten finding', async () => {
    expect(await validate(plainToInstance(MuteFindingDto, { days: 30 }))).not.toHaveLength(0)
    expect(
      await validate(plainToInstance(MuteFindingDto, { days: 30, reason: 'Board retreat' })),
    ).toHaveLength(0)
  })

  it('MuteFindingDto caps the window at 180 days — longer is a decision to stop tracking', async () => {
    expect(
      await validate(plainToInstance(MuteFindingDto, { days: 365, reason: 'x' })),
    ).not.toHaveLength(0)
    expect(await validate(plainToInstance(MuteFindingDto, { days: 0, reason: 'x' }))).toHaveLength(0)
  })

  it('FindingStatusDto offers open/resolved/dismissed and NOT acknowledged or muted', async () => {
    for (const status of ['open', 'resolved', 'dismissed']) {
      expect(await validate(plainToInstance(FindingStatusDto, { status }))).toHaveLength(0)
    }
    for (const status of ['acknowledged', 'muted']) {
      expect(await validate(plainToInstance(FindingStatusDto, { status }))).not.toHaveLength(0)
    }
  })

  it('AckFindingDto bounds its reason', async () => {
    expect(await validate(plainToInstance(AckFindingDto, {}))).toHaveLength(0)
    expect(
      await validate(plainToInstance(AckFindingDto, { reason: 'x'.repeat(281) })),
    ).not.toHaveLength(0)
  })
})

describe('module wiring — the one-way edge', () => {
  it('TwinModule declares the controller', async () => {
    const mod = await import('./twin.module.js')
    expect(mod.TwinModule).toBeDefined()
    const controllers = Reflect.getMetadata('controllers', mod.TwinModule) as unknown[]
    expect(controllers).toContain(TwinController)
  })

  // THIS is the one that catches a missing export. Reading `controllers` off the
  // module metadata (above) proves only that a decorator names a class — it never
  // asks Nest to RESOLVE anything, so a provider this module injects but that no
  // imported module EXPORTS still passes. That is not hypothetical: TwinModule
  // shipped injecting AccreditationReadinessService while AccreditationModule
  // exported only two of its six providers. Every unit spec here passed, the nest
  // build was clean, and the API died on BOOT with UnknownDependenciesException —
  // a failure whose production shape is a container that never starts.
  //
  // WHY THIS READS SOURCE AND NOT `design:paramtypes`: the obvious version of this
  // spec — reflect the constructor types and look them up — is VACUOUS here, and I
  // proved it by deleting the export and watching it stay green. vitest transforms
  // TS with esbuild, which does not implement `emitDecoratorMetadata`, so
  // `design:paramtypes` is undefined under test and the loop checks nothing. Only
  // the tsc/nest build emits it, which is exactly why the bug reached runtime.
  // `@Module()`'s own metadata is safe to read (the decorator is handed the object
  // literal), so the import graph below is real; only the ctor types come from text.
  it('TwinModule RESOLVES — every injected provider is actually exported by an imported module', async () => {
    const { TwinModule } = await import('./twin.module.js')

    const meta = (m: unknown, key: string): unknown[] =>
      (Reflect.getMetadata(key, m as object) as unknown[]) ?? []
    const isModule = (c: unknown) => Reflect.hasMetadata('imports', c as object)
    const nameOf = (c: unknown) => (c as { name?: string })?.name ?? ''

    /** What an imported module makes visible, following module re-exports. */
    const exportedSurface = (m: unknown, seen = new Set<unknown>()): Set<string> => {
      const out = new Set<string>()
      if (seen.has(m)) return out
      seen.add(m)
      for (const e of meta(m, 'exports')) {
        if (isModule(e)) for (const x of exportedSurface(e, seen)) out.add(x)
        else out.add(nameOf(e))
      }
      return out
    }

    const available = new Set<string>(meta(TwinModule, 'providers').map(nameOf))
    for (const imp of meta(TwinModule, 'imports')) {
      for (const x of exportedSurface(imp)) available.add(x)
    }
    // Provided by @Global modules the app root imports — reachable from every
    // module without TwinModule naming them.
    for (const g of ['PrismaService', 'ConfigService']) available.add(g)

    const dir = fileURLToPath(new URL('.', import.meta.url))
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    const sources = files.map((f) => readFileSync(join(dir, f), 'utf8'))

    const unresolved: string[] = []
    for (const cls of [...meta(TwinModule, 'providers'), ...meta(TwinModule, 'controllers')]) {
      const name = nameOf(cls)
      const src = sources.find((s) => new RegExp(`export class ${name}\\b`).test(s))
      expect(src, `source for ${name} not found under src/twin/`).toBeDefined()
      const body = src!.slice(src!.indexOf(`export class ${name}`))
      const ctor = /constructor\s*\(([\s\S]*?)\)\s*\{/.exec(body)
      if (!ctor) continue
      for (const raw of ctor[1].split(/,(?![^(]*\))/)) {
        const param = raw.trim()
        if (!param) continue
        // @Optional()/@Inject() params are not resolved by type — Nest either
        // tolerates their absence or looks them up by token.
        if (/@Optional|@Inject/.test(param)) continue
        const m = /:\s*([A-Za-z_$][\w$]*)/.exec(param)
        if (!m) continue
        const dep = m[1]
        if (!available.has(dep)) unresolved.push(`${name} injects ${dep}, which nothing exports`)
      }
    }

    expect(unresolved).toEqual([])
  })

  it('EarlyWarningService does NOT import TwinReconciliationService — the edge is ONE-WAY', () => {
    // Asserted over the SOURCE, not over DI metadata: the cycle this guards
    // against is an import cycle, and an import that is never constructed is
    // still an import. TwinReconciliationService injects EarlyWarningService;
    // the reverse edge would make Nest resolve a partially-initialised provider
    // and the 4AM job would stop running with no test failing anywhere.
    const src = readFileSync(
      fileURLToPath(new URL('./early-warning.service.ts', import.meta.url)),
      'utf8',
    )
    expect(src).not.toMatch(/twin-reconciliation/)
  })
})
