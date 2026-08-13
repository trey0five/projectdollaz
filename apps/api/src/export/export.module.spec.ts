import 'reflect-metadata'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DataExportController } from './export.controller.js'
import { DataExportService } from './export.service.js'
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

/**
 * A module that COMPILES but cannot RESOLVE takes the whole API down at boot,
 * and nothing in this directory would notice: the service constructs fine in
 * isolation and every unit test passes. That is not hypothetical here —
 * DataExportModule shipped without AuthModule, all seven manifest tests were
 * green, and the container crash-looped on "Nest can't resolve dependencies of
 * the JwtAuthGuard". This spec is what turns that into a red test.
 */
describe('DataExportModule RESOLVES — every injected provider is reachable', () => {
  it('resolves the controller and the service, ctor parameter by ctor parameter', async () => {
    const { DataExportModule } = await import('./export.module.js')

    const available = new Set<string>(meta(DataExportModule, 'providers').map(nameOf))
    for (const imp of meta(DataExportModule, 'imports')) {
      for (const x of exportedSurface(imp)) available.add(x)
    }
    for (const g of ['PrismaService', 'ConfigService']) available.add(g)

    const dir = fileURLToPath(new URL('.', import.meta.url))
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    const sources = files.map((f) => readFileSync(join(dir, f), 'utf8'))

    const unresolved: string[] = []
    for (const cls of [
      ...meta(DataExportModule, 'providers'),
      ...meta(DataExportModule, 'controllers'),
    ]) {
      const name = nameOf(cls)
      const src = sources.find((s) => new RegExp(`export class ${name}\\b`).test(s))
      expect(src, `source for ${name} not found under src/export/`).toBeDefined()
      const bodyText = src!.slice(src!.indexOf(`export class ${name}`))
      const ctor = /constructor\s*\(([\s\S]*?)\)\s*\{/.exec(bodyText)
      if (!ctor) continue
      for (const raw of ctor[1].split(/,(?![^(]*\))/)) {
        const param = raw.trim()
        if (!param) continue
        if (/@Optional|@Inject/.test(param)) continue
        const m = /:\s*([A-Za-z_$][\w$]*)/.exec(param)
        if (!m) continue
        if (!available.has(m[1])) unresolved.push(`${name} needs ${m[1]}`)
      }
    }
    expect(unresolved, 'unresolved constructor dependencies').toEqual([])
  })

  it('the GUARD chain resolves too — JwtAuthGuard needs TokenService', async () => {
    const { DataExportModule } = await import('./export.module.js')
    const surface = new Set<string>()
    for (const imp of meta(DataExportModule, 'imports')) {
      for (const x of exportedSurface(imp)) surface.add(x)
    }
    // The exact miss that crash-looped the container.
    expect(surface.has('TokenService'), 'JwtAuthGuard cannot resolve without AuthModule').toBe(true)
  })

  it('AppModule imports DataExportModule — a module nothing imports serves no route', async () => {
    const { AppModule } = await import('../app.module.js')
    const { DataExportModule } = await import('./export.module.js')
    expect(meta(AppModule, 'imports')).toContain(DataExportModule)
  })

  it('declares the controller', async () => {
    const { DataExportModule } = await import('./export.module.js')
    expect(meta(DataExportModule, 'controllers')).toContain(DataExportController)
    expect(meta(DataExportModule, 'providers')).toContain(DataExportService)
  })
})
