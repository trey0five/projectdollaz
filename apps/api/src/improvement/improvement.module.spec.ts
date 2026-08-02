import 'reflect-metadata'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ImprovementController } from './improvement.controller.js'
import { ImprovementService } from './improvement.service.js'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { REQUIRES_MODULE } from '../billing/requires-module.decorator.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase G — DOES THE MODULE ACTUALLY RESOLVE?
//
// This is the highest-value spec in the phase, and it exists because of a bug
// that already happened. TwinModule once shipped injecting a service that no
// imported module EXPORTED. Every unit spec passed, the nest build was clean, and
// the API died on BOOT with UnknownDependenciesException — whose production shape
// is a container that never starts.
//
// WHY IT READS SOURCE AND NOT `design:paramtypes`: the obvious version of this
// spec — reflect the constructor types and look them up — is VACUOUS here. vitest
// transforms TS with esbuild, which does not implement `emitDecoratorMetadata`, so
// `design:paramtypes` is undefined under test and the loop checks nothing. Only
// the tsc/nest build emits it, which is exactly why that bug reached runtime.
// `@Module()`'s own metadata is safe to read (the decorator is handed an object
// literal), so the import graph below is real; only the ctor types come from text.
//
// Phase G's specific exposure: ImprovementService injects StrategyProgressService,
// which StrategyModule did NOT export before this phase.
// ─────────────────────────────────────────────────────────────────────────────

const GUARDS = '__guards__'
const ROLES = 'roles'

const meta = (m: unknown, key: string): unknown[] =>
  (Reflect.getMetadata(key, m as object) as unknown[]) ?? []
const isModule = (c: unknown) => Reflect.hasMetadata('imports', c as object)
const nameOf = (c: unknown) => (c as { name?: string })?.name ?? ''

/** What an imported module makes visible, following module re-exports. */
function exportedSurface(m: unknown, seen = new Set<unknown>()): Set<string> {
  const out = new Set<string>()
  if (seen.has(m)) return out
  seen.add(m)
  for (const e of meta(m, 'exports')) {
    if (isModule(e)) for (const x of exportedSurface(e, seen)) out.add(x)
    else out.add(nameOf(e))
  }
  return out
}

/** Every module reachable from `m` through `imports`, transitively. */
function importClosure(m: unknown, seen = new Set<unknown>()): Set<unknown> {
  if (seen.has(m)) return seen
  seen.add(m)
  for (const imp of meta(m, 'imports')) importClosure(imp, seen)
  return seen
}

describe('ImprovementModule RESOLVES — every injected provider is exported by an imported module', () => {
  it('resolves the controller and the service, ctor parameter by ctor parameter', async () => {
    const { ImprovementModule } = await import('./improvement.module.js')

    const available = new Set<string>(meta(ImprovementModule, 'providers').map(nameOf))
    for (const imp of meta(ImprovementModule, 'imports')) {
      for (const x of exportedSurface(imp)) available.add(x)
    }
    // Provided by @Global modules the app root imports.
    for (const g of ['PrismaService', 'ConfigService']) available.add(g)

    const dir = fileURLToPath(new URL('.', import.meta.url))
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    const sources = files.map((f) => readFileSync(join(dir, f), 'utf8'))

    const unresolved: string[] = []
    for (const cls of [
      ...meta(ImprovementModule, 'providers'),
      ...meta(ImprovementModule, 'controllers'),
    ]) {
      const name = nameOf(cls)
      const src = sources.find((s) => new RegExp(`export class ${name}\\b`).test(s))
      expect(src, `source for ${name} not found under src/improvement/`).toBeDefined()
      const body = src!.slice(src!.indexOf(`export class ${name}`))
      const ctor = /constructor\s*\(([\s\S]*?)\)\s*\{/.exec(body)
      if (!ctor) continue
      for (const raw of ctor[1].split(/,(?![^(]*\))/)) {
        const param = raw.trim()
        if (!param) continue
        if (/@Optional|@Inject/.test(param)) continue
        const m = /:\s*([A-Za-z_$][\w$]*)/.exec(param)
        if (!m) continue
        if (!available.has(m[1])) unresolved.push(`${name} injects ${m[1]}, which nothing exports`)
      }
    }

    expect(unresolved).toEqual([])
  })

  it('StrategyModule EXPORTS StrategyProgressService — the exact Phase E failure mode', async () => {
    // Named separately from the loop above so a regression says WHY it broke
    // rather than just listing an unresolved symbol.
    const { StrategyModule } = await import('../strategy/strategy.module.js')
    expect(exportedSurface(StrategyModule)).toContain('StrategyProgressService')
  })

  it('AccreditationModule EXPORTS AccreditationReadinessService', async () => {
    const { AccreditationModule } = await import('../accreditation/accreditation.module.js')
    expect(exportedSurface(AccreditationModule)).toContain('AccreditationReadinessService')
  })

  it('BillingModule EXPORTS BillingService — the rail’s per-source entitlement gate', async () => {
    // ImprovementService injects it to check `accreditation` before it reads the
    // readiness gaps or the findings ledger. BillingModule was already imported
    // (the guard needs it); this pins that what the service injects is EXPORTED,
    // which is the Phase E boot failure exactly.
    const { BillingModule } = await import('../billing/billing.module.js')
    expect(exportedSurface(BillingModule)).toContain('BillingService')
  })

  it('ImprovementModule EXPORTS ImprovementService — AssistantModule injects it', async () => {
    const { ImprovementModule } = await import('./improvement.module.js')
    expect(exportedSurface(ImprovementModule)).toContain('ImprovementService')
  })

  it('does NOT import AnalyticsModule, directly or TRANSITIVELY', async () => {
    // The boot-safety rule that has crash-looped this container twice. Checked
    // over the whole closure, because an indirect edge crashes exactly the same.
    const { ImprovementModule } = await import('./improvement.module.js')
    const names = [...importClosure(ImprovementModule)].map(nameOf)
    expect(names).not.toContain('AnalyticsModule')
  })

  it('nothing under src/improvement/ imports the assistant — the edge is ONE-WAY', () => {
    // AssistantModule imports ImprovementModule. The reverse edge would make Nest
    // resolve a partially-initialised provider, and an import that is never
    // constructed is still an import — so this reads SOURCE, not DI metadata.
    const dir = fileURLToPath(new URL('.', import.meta.url))
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      expect(readFileSync(join(dir, f), 'utf8'), f).not.toMatch(/from '\.\.\/assistant\//)
    }
  })

  it('AppModule imports ImprovementModule — a module nothing imports serves no route', async () => {
    const { AppModule } = await import('../app.module.js')
    const { ImprovementModule } = await import('./improvement.module.js')
    expect(meta(AppModule, 'imports')).toContain(ImprovementModule)
  })

  it('ImprovementModule declares the controller', async () => {
    const { ImprovementModule } = await import('./improvement.module.js')
    expect(meta(ImprovementModule, 'controllers')).toContain(ImprovementController)
  })
})

describe('ImprovementController — the guard chain and the role split', () => {
  it('carries the full house chain', () => {
    const guards = (Reflect.getMetadata(GUARDS, ImprovementController) as unknown[]) ?? []
    expect(guards).toContain(JwtAuthGuard)
    expect(guards).toContain(RolesGuard)
    expect(guards).toContain(EntitlementGuard)
  })

  it('is gated on accreditation OR strategy, with accreditation as the PRIMARY', () => {
    const keys = Reflect.getMetadata(REQUIRES_MODULE, ImprovementController) as string[]
    expect(keys).toEqual(['accreditation', 'strategy'])
    // keys[0] is what the 402's `module` field carries, and apps/web's
    // moduleKeyFromError reads exactly that field.
    expect(keys[0]).toBe('accreditation')
  })

  it('READS are open to viewer; every WRITE excludes them', () => {
    const proto = ImprovementController.prototype as unknown as Record<string, object>
    for (const m of ['get', 'recommendations']) {
      expect(Reflect.getMetadata(ROLES, proto[m])).toEqual(['owner', 'accountant', 'viewer'])
    }
    for (const m of ['create', 'update', 'remove', 'adopt', 'recordProgress']) {
      const roles = Reflect.getMetadata(ROLES, proto[m]) as string[]
      expect(roles, m).toEqual(['owner', 'accountant'])
      expect(roles, m).not.toContain('viewer')
    }
  })

  it('delegates and composes nothing', async () => {
    const svc = {
      getImprovement: async () => ({ initiatives: [] }),
      getRecommendations: async () => ({ recommendations: [] }),
      createInitiative: async () => ({ id: 'i1' }),
      updateInitiative: async () => ({ id: 'i1' }),
      removeInitiative: async () => ({ id: 'i1' }),
      adopt: async () => ({ id: 'i1' }),
      recordProgress: async () => ({ id: 'e1' }),
    }
    const calls: unknown[][] = []
    const spied = Object.fromEntries(
      Object.entries(svc).map(([k, fn]) => [
        k,
        (...args: unknown[]) => {
          calls.push([k, ...args])
          return (fn as () => unknown)()
        },
      ]),
    ) as unknown as ImprovementService
    const c = new ImprovementController(spied)
    const user = { id: 'user-1' } as never
    await c.get('school-A')
    await c.create('school-A', { title: 'T' }, user)
    await c.update('school-A', 'i1', { title: 'T2' }, user)
    await c.remove('school-A', 'i1', user)
    expect(calls).toEqual([
      ['getImprovement', 'school-A'],
      ['createInitiative', 'school-A', { title: 'T' }, 'user-1'],
      ['updateInitiative', 'school-A', 'i1', { title: 'T2' }, 'user-1'],
      ['removeInitiative', 'school-A', 'i1', 'user-1'],
    ])
  })
})
