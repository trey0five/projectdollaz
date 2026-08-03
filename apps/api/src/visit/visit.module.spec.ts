import 'reflect-metadata'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { VisitController } from './visit.controller.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase H — SPEC-API-1. DOES THE MODULE ACTUALLY RESOLVE?
//
// This is the highest-value spec in the phase and it exists because of a bug that
// already happened twice. A provider injected but not EXPORTED killed the API on
// BOOT in Phase E while every unit test passed, the nest build was clean, and the
// production shape of the failure is a container that never starts.
//
// Phase H's specific exposure is `AccreditationSignalsModule`, which shipped with
// NO `exports` array at all. `VisitService` injects the commendations service it
// provides, so without the one line Phase H added to that module, this container
// dies on boot.
//
// WHY IT READS SOURCE AND NOT `design:paramtypes`: the obvious version of this
// spec is VACUOUS here. vitest transforms TS with esbuild, which does not
// implement `emitDecoratorMetadata`, so `design:paramtypes` is undefined under
// test and the loop checks nothing. Only the tsc/nest build emits it — which is
// exactly why that bug reached runtime. `@Module()`'s own metadata is safe to
// read (the decorator is handed an object literal), so the import graph below is
// real; only the ctor types come from text.
// ─────────────────────────────────────────────────────────────────────────────

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

describe('VisitModule RESOLVES — every injected provider is exported by an imported module', () => {
  it('resolves the controller and the service, ctor parameter by ctor parameter', async () => {
    const { VisitModule } = await import('./visit.module.js')

    const available = new Set<string>(meta(VisitModule, 'providers').map(nameOf))
    for (const imp of meta(VisitModule, 'imports')) {
      for (const x of exportedSurface(imp)) available.add(x)
    }
    // Provided by @Global modules the app root imports.
    for (const g of ['PrismaService', 'ConfigService']) available.add(g)

    const dir = fileURLToPath(new URL('.', import.meta.url))
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    const sources = files.map((f) => readFileSync(join(dir, f), 'utf8'))

    const unresolved: string[] = []
    for (const cls of [...meta(VisitModule, 'providers'), ...meta(VisitModule, 'controllers')]) {
      const name = nameOf(cls)
      const src = sources.find((s) => new RegExp(`export class ${name}\\b`).test(s))
      expect(src, `source for ${name} not found under src/visit/`).toBeDefined()
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

  it('AccreditationSignalsModule EXPORTS AccreditationCommendationsService — the Phase-E boot-killer class', async () => {
    // Named separately from the loop above so a regression says WHY it broke.
    // That module shipped with no `exports` array AT ALL; Act 2 of the Mock Visit
    // is its data source, so deleting this export is a container that never boots.
    const { AccreditationSignalsModule } = await import(
      '../accreditation-signals/accreditation-signals.module.js'
    )
    expect(exportedSurface(AccreditationSignalsModule)).toContain(
      'AccreditationCommendationsService',
    )
  })

  it('TwinModule EXPORTS EarlyWarningService — the REQUIRED read', async () => {
    const { TwinModule } = await import('../twin/twin.module.js')
    expect(exportedSurface(TwinModule)).toContain('EarlyWarningService')
  })

  it('AccreditationModule EXPORTS both readiness services Acts 1 and 4 need', async () => {
    const { AccreditationModule } = await import('../accreditation/accreditation.module.js')
    const surface = exportedSurface(AccreditationModule)
    expect(surface).toContain('AccreditationReadinessService')
    expect(surface).toContain('AccreditationEvidenceReadinessService')
  })

  it('ImprovementModule EXPORTS ImprovementService — Act 6 selects from Phase G’s rail', async () => {
    const { ImprovementModule } = await import('../improvement/improvement.module.js')
    expect(exportedSurface(ImprovementModule)).toContain('ImprovementService')
  })

  it('VisitModule EXPORTS VisitService — ReportScheduleModule injects it', async () => {
    const { VisitModule } = await import('./visit.module.js')
    expect(exportedSurface(VisitModule)).toContain('VisitService')
  })

  it('ReportScheduleModule IMPORTS VisitModule, and ReportScheduleService injects it', async () => {
    const { ReportScheduleModule } = await import(
      '../report-schedule/report-schedule.module.js'
    )
    const { VisitModule } = await import('./visit.module.js')
    expect(meta(ReportScheduleModule, 'imports')).toContain(VisitModule)
    // The import alone proves nothing — a module can import and never inject, and
    // an injection with no import is the boot failure. Both halves, or neither.
    const src = readFileSync(
      fileURLToPath(new URL('../report-schedule/report-schedule.service.ts', import.meta.url)),
      'utf8',
    )
    expect(src).toMatch(/private readonly visit: VisitService/)
  })

  it('AppModule registers VisitModule — a module nothing imports serves no route', async () => {
    const { AppModule } = await import('../app.module.js')
    const { VisitModule } = await import('./visit.module.js')
    expect(meta(AppModule, 'imports')).toContain(VisitModule)
  })

  it('VisitModule declares the controller', async () => {
    const { VisitModule } = await import('./visit.module.js')
    expect(meta(VisitModule, 'controllers')).toContain(VisitController)
  })

  it('NOTHING under src/visit/ imports an LLM — acceptance 7', () => {
    // No drafter, no summary, no narration touches a model. Asserted over SOURCE
    // because an import that is never called is still an import, and the whole
    // claim of this phase is that no LLM originates a finding, a number or a
    // document name.
    const dir = fileURLToPath(new URL('.', import.meta.url))
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      const src = readFileSync(join(dir, f), 'utf8')
      expect(src, f).not.toMatch(/assistant\.service|bedrock\.client|assistant\.client|narration\.compose/)
    }
  })

  it('src/visit/ writes NOTHING — there is no write route and no prisma access', () => {
    // Adoption rides on Phase G's already-idempotent POST /improvement/adopt.
    // Phase H adds no write endpoint, so the ProposedAction / APPLY_KINDS quintet
    // that has 400'd /apply twice in this repo is given no opportunity here.
    const dir = fileURLToPath(new URL('.', import.meta.url))
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts') && !x.endsWith('.spec.ts'))) {
      const src = readFileSync(join(dir, f), 'utf8')
      expect(src, f).not.toMatch(/@Post\(|@Put\(|@Patch\(|@Delete\(/)
      // Comments stripped first: visit.module.ts's header EXPLAINS that Prisma is
      // deliberately not injected, and a naive substring match would fail on the
      // sentence saying so.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      expect(code, f).not.toMatch(/PrismaService/)
    }
  })
})
