import 'reflect-metadata'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { getMetadataStorage, validate } from 'class-validator'
import { plainToInstance } from 'class-transformer'
import { PortfolioController } from './portfolio.controller.js'
import { PortfolioQueryDto } from './dto/portfolio-query.dto.js'
import { PortfolioStandardsQueryDto } from './dto/portfolio-standards-query.dto.js'
import { VelocityQueryDto } from './dto/velocity-query.dto.js'
import { BulkAdoptDto } from './dto/bulk-adopt.dto.js'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase I — the routes, at the boundary. Follows twin.controller.spec.ts /
// visit.module.spec.ts exactly: reflect-metadata + class-validator + source text.
// There is no @nestjs/testing in apps/api and no attempt to boot Nest.
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

const here = fileURLToPath(new URL('.', import.meta.url))
const readSrc = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

/** Source with comments stripped — a comment NAMING a service is not an import. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

// ── API-1 ────────────────────────────────────────────────────────────────────
describe('API-1 — PortfolioModule RESOLVES', () => {
  // THIS is the one that catches a missing export. Reading `controllers` off the
  // module metadata proves only that a decorator names a class — it never asks
  // Nest to RESOLVE anything, so a provider this module injects that no imported
  // module EXPORTS still passes. That is not hypothetical: TwinModule shipped
  // injecting a service AccreditationModule did not export, every unit spec passed,
  // the nest build was clean, and the API died on BOOT with
  // UnknownDependenciesException — a failure whose production shape is a container
  // that never starts. Phase H then found a SECOND module with no `exports` array
  // at all.
  //
  // WHY THIS READS SOURCE AND NOT `design:paramtypes`: the obvious version of this
  // spec is VACUOUS here, and that was proved by deleting an export and watching it
  // stay green. vitest transforms TS with esbuild, which does not implement
  // `emitDecoratorMetadata`, so `design:paramtypes` is undefined under test and the
  // loop checks nothing. Only the tsc/nest build emits it — which is exactly why
  // that bug reached runtime. `@Module()`'s own metadata is safe to read (the
  // decorator is handed an object literal), so the import graph below is real; only
  // the ctor types come from text.
  //
  // RED PROOF (run): deleting `exports: [ImprovementService]` from
  // improvement.module.ts turns this red with
  // "PortfolioBulkAdoptService injects ImprovementService, which nothing exports".
  it('resolves the controller and both services, ctor parameter by ctor parameter', async () => {
    const { PortfolioModule } = await import('./portfolio.module.js')

    const available = new Set<string>(meta(PortfolioModule, 'providers').map(nameOf))
    for (const imp of meta(PortfolioModule, 'imports')) {
      for (const x of exportedSurface(imp)) available.add(x)
    }
    // Provided by @Global modules the app root imports.
    for (const g of ['PrismaService', 'ConfigService']) available.add(g)

    const files = readdirSync(here).filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    const sources = files.map((f) => readFileSync(join(here, f), 'utf8'))

    const unresolved: string[] = []
    for (const cls of [
      ...meta(PortfolioModule, 'providers'),
      ...meta(PortfolioModule, 'controllers'),
    ]) {
      const name = nameOf(cls)
      const src = sources.find((s) => new RegExp(`export class ${name}\\b`).test(s))
      expect(src, `source for ${name} not found under src/portfolio/`).toBeDefined()
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

  it('ImprovementModule EXPORTS ImprovementService — bulk-adopt rides Phase G’s adopt', async () => {
    // Named separately from the loop above so a regression says WHY it broke.
    const { ImprovementModule } = await import('../improvement/improvement.module.js')
    expect(exportedSurface(ImprovementModule)).toContain('ImprovementService')
  })

  it('PortfolioModule EXPORTS PortfolioService — Phase J injects it from AssistantModule', async () => {
    const { PortfolioModule } = await import('./portfolio.module.js')
    const exported = meta(PortfolioModule, 'exports')
    expect(exported.length).toBeGreaterThan(0)
    expect(exportedSurface(PortfolioModule)).toContain('PortfolioService')
  })

  it('does NOT import AnalyticsModule, TwinModule, AccreditationModule, VisitModule or StrategyModule', async () => {
    // The boot-safety rule. AnalyticsModule is the heaviest module in the graph and
    // the mutual-service dependency class has crash-looped this container twice.
    const src = code(readSrc('./portfolio.module.ts'))
    for (const forbidden of [
      'AnalyticsModule',
      'TwinModule',
      'AccreditationModule',
      'VisitModule',
      'StrategyModule',
    ]) {
      expect(src, `portfolio.module.ts must not import ${forbidden}`).not.toMatch(
        new RegExp(`\\b${forbidden}\\b`),
      )
    }
  })
})

// ── API-2 ────────────────────────────────────────────────────────────────────
describe('API-2 — the guard chain and the registration', () => {
  it('class guards are EXACTLY [JwtAuthGuard]', () => {
    // RolesGuard cannot resolve a schoolId on an org route and EntitlementGuard
    // would 402 with no school context, so "hardening" this list is a 500 or a
    // blanket 402 for a whole diocese. Org isolation and per-school entitlement are
    // enforced in the service, which is the only place they CAN be for a payload
    // spanning forty schools with forty different licences.
    const guards = (Reflect.getMetadata('__guards__', PortfolioController) as unknown[]) ?? []
    expect(guards).toEqual([JwtAuthGuard])
  })

  it('PortfolioModule declares PortfolioController', async () => {
    const { PortfolioModule } = await import('./portfolio.module.js')
    expect(meta(PortfolioModule, 'controllers')).toContain(PortfolioController)
  })

  it('AppModule imports PortfolioModule — a module nothing imports serves no route', async () => {
    const { AppModule } = await import('../app.module.js')
    const { PortfolioModule } = await import('./portfolio.module.js')
    expect(meta(AppModule, 'imports')).toContain(PortfolioModule)
  })

  it('registers PortfolioModule AFTER ImprovementModule, with the reason in the source', () => {
    const src = readFileSync(fileURLToPath(new URL('../app.module.ts', import.meta.url)), 'utf8')
    const body = src.slice(src.indexOf('@Module('))
    expect(body.indexOf('ImprovementModule,')).toBeLessThan(body.indexOf('PortfolioModule,'))
    expect(src).toMatch(/AIC Phase I/)
  })

  it('exposes exactly four routes, three GET and one POST', () => {
    const proto = PortfolioController.prototype as unknown as Record<string, object>
    const paths = ['getPortfolio', 'getStandards', 'getVelocity', 'postBulkAdopt'].map((m) =>
      Reflect.getMetadata('path', proto[m]),
    )
    expect(paths).toEqual([
      'accreditation/portfolio',
      'accreditation/portfolio/standards',
      'improvement/velocity',
      'improvement/bulk-adopt',
    ])
  })
})

// ── API-3 ────────────────────────────────────────────────────────────────────
describe('API-3 — no client-selectable sort exists anywhere in the DTOs', () => {
  // The comparator is server-frozen; that is HOW "no cross-framework index ranking
  // is reachable in the API" becomes mechanical rather than a promise. `now` is
  // server-supplied so a client cannot move the clock under a determinism claim.
  //
  // RED PROOF (run): adding `sortBy?: string` (with any validator) to
  // PortfolioQueryDto turns this red naming `sortBy`.
  const BANNED = /sort|order|rank|asOf|by$/i

  const dtos: [string, new () => object][] = [
    ['PortfolioQueryDto', PortfolioQueryDto],
    ['PortfolioStandardsQueryDto', PortfolioStandardsQueryDto],
    ['VelocityQueryDto', VelocityQueryDto],
    ['BulkAdoptDto', BulkAdoptDto],
  ]

  for (const [name, Dto] of dtos) {
    it(`${name} declares no sort/order/rank/asOf property`, () => {
      const props = validatedPropertiesOf(Dto)
      expect(props.length, `${name} exposed no validated properties`).toBeGreaterThan(0)
      const offenders = props.filter((p) => BANNED.test(p))
      expect(offenders, `${name} exposes a client-selectable ordering field`).toEqual([])
    })
  }

  it('the whole Phase-I DTO surface is exactly the expected field list', () => {
    // A positive assertion as well as a negative one: a field added without thought
    // shows up here even if it happens not to match the banned pattern.
    const all = new Set(dtos.flatMap(([, Dto]) => validatedPropertiesOf(Dto)))
    expect([...all].sort()).toEqual([
      'catalogStandardId',
      'dueDate',
      'frameworkCode',
      'lens',
      'limit',
      'mode',
      'proposalHash',
      'schoolIds',
      'targetRubricScore',
      'title',
      'windowDays',
    ])
  })
})

/**
 * The property names class-validator knows about for a DTO — which IS the list the
 * global `forbidNonWhitelisted` pipe permits. Asking the validator's own metadata
 * rather than reading source text means a field added by any route (a decorator, a
 * base class, a mixin) is visible here.
 */
function validatedPropertiesOf(Dto: new () => object): string[] {
  const metas = getMetadataStorage().getTargetValidationMetadatas(Dto, Dto.name, false, false)
  return [...new Set(metas.map((m) => m.propertyName))].sort()
}

// ── API-6 ────────────────────────────────────────────────────────────────────
describe('API-6 — the portfolio path can never compute a live twin', () => {
  // A live twin collects 36 signals and evaluates 29 rules. Forty of those is a
  // connection-pool exhaustion and a P2024 before anything returns. The failure
  // mode this guards is an innocent-looking constructor parameter added in six
  // months by somebody who needs "just one more number".
  //
  // RED PROOF (run): adding `private readonly readiness: AccreditationReadinessService`
  // to PortfolioService's constructor turns this red.
  const FORBIDDEN = [
    'TwinService',
    'AccreditationReadinessService',
    'BriefingService',
    'EvidenceReadinessService',
    'VisitService',
    '$queryRaw',
    'getTwin(',
    'getReadiness(',
  ]

  for (const file of ['portfolio.service.ts', 'portfolio-reads.ts', 'bulk-adopt.service.ts']) {
    it(`${file} names none of the live-compute services`, () => {
      const src = code(readSrc(`./${file}`))
      for (const token of FORBIDDEN) {
        expect(src, `${file} references ${token}`).not.toContain(token)
      }
    })
  }

  it('every file under src/portfolio/ is free of raw SQL', () => {
    for (const f of readdirSync(here).filter((x) => x.endsWith('.ts') && !x.endsWith('.spec.ts'))) {
      const src = code(readFileSync(join(here, f), 'utf8'))
      expect(src, f).not.toMatch(/\$queryRaw|\$executeRaw/)
    }
  })

  // RED PROOF (run): deleting `{ id: 'asc' }` from readProgressEvents' orderBy
  // reddens the progress-event assertion below. That read is the only one in the
  // file whose leading keys (schoolId, initiativeId, observedOn) do NOT uniquely
  // identify a row — `ImprovementProgressEvent` is uniquely keyed on
  // (initiativeId, observedOn, SOURCE) — so without `id` two same-day rows tie and
  // their relative order is the database's natural order. Acceptance 6 is a
  // byte-identity claim; it may not rest on a tie.
  it('every read in the bounded layer orders on a TOTAL key', () => {
    const src = readSrc('./portfolio-reads.ts')
    const orderBys = [...src.matchAll(/orderBy:\s*\[([^\]]*)\]/g)].map((m) => m[1])
    expect(orderBys.length).toBeGreaterThan(5)
    // Every read that can return more than one row per (leading keys) must break
    // the tie on a unique column.
    const progress = src.slice(src.indexOf('export async function readProgressEvents'))
    const progressOrder = /orderBy:\s*\[([\s\S]*?)\]/.exec(progress)?.[1] ?? ''
    expect(progressOrder).toMatch(/observedOn/)
    expect(progressOrder, 'readProgressEvents has no total-order tiebreak').toMatch(
      /\{\s*id:\s*'asc'\s*\}\s*,?\s*$/,
    )
  })

  it('the bounded read layer explains why it is not DISTINCT ON', () => {
    // Without the reason in the source a reviewer WILL "restore" the plan's literal
    // form, and Prisma's `distinct` (no nativeDistinct preview feature in this
    // schema) is applied after rows are transferred — the opposite of the intent.
    const src = readSrc('./portfolio-reads.ts')
    expect(src).toMatch(/DISTINCT ON/)
    expect(src).toMatch(/nativeDistinct/)
  })
})

// ── THE DTOs ─────────────────────────────────────────────────────────────────
describe('PortfolioQueryDto', () => {
  it('accepts its legal shape', async () => {
    const dto = plainToInstance(PortfolioQueryDto, { frameworkCode: 'cognia_2022', lens: 'viewer' })
    expect(await validate(dto)).toHaveLength(0)
  })

  it('accepts an empty query — every field is optional', async () => {
    expect(await validate(plainToInstance(PortfolioQueryDto, {}))).toHaveLength(0)
  })

  it('rejects a bad lens and a hostile frameworkCode', async () => {
    expect(
      await validate(plainToInstance(PortfolioQueryDto, { lens: 'superintendent' })),
    ).not.toHaveLength(0)
    expect(
      await validate(plainToInstance(PortfolioQueryDto, { frameworkCode: "'; drop table--" })),
    ).not.toHaveLength(0)
  })
})

describe('PortfolioStandardsQueryDto', () => {
  it('coerces limit from the query string and accepts the legal shape', async () => {
    const dto = plainToInstance(PortfolioStandardsQueryDto, { limit: '25' })
    expect(await validate(dto)).toHaveLength(0)
    expect(dto.limit).toBe(25)
  })

  it('rejects an out-of-range limit at BOTH ends', async () => {
    expect(
      await validate(plainToInstance(PortfolioStandardsQueryDto, { limit: '0' })),
    ).not.toHaveLength(0)
    expect(
      await validate(plainToInstance(PortfolioStandardsQueryDto, { limit: '51' })),
    ).not.toHaveLength(0)
  })
})

describe('VelocityQueryDto', () => {
  it('accepts a legal window and coerces it', async () => {
    const dto = plainToInstance(VelocityQueryDto, { windowDays: '365' })
    expect(await validate(dto)).toHaveLength(0)
    expect(dto.windowDays).toBe(365)
  })

  it('rejects an out-of-range windowDays at BOTH ends', async () => {
    // Below 30 days almost nothing clears MIN_PROJECTION_SPAN_DAYS; above 730 the
    // window spans framework changes and the readings stop being comparable.
    expect(await validate(plainToInstance(VelocityQueryDto, { windowDays: '29' }))).not.toHaveLength(
      0,
    )
    expect(await validate(plainToInstance(VelocityQueryDto, { windowDays: '731' }))).not.toHaveLength(
      0,
    )
  })
})

describe('BulkAdoptDto', () => {
  const UUID = '11111111-1111-4111-8111-111111111111'
  const school = (n: number) => `2222222${n}-2222-4222-8222-222222222222`
  const HASH = 'a'.repeat(64)

  const legal = (over: Record<string, unknown> = {}) =>
    plainToInstance(BulkAdoptDto, {
      mode: 'propose',
      catalogStandardId: UUID,
      schoolIds: [school(1), school(2)],
      title: 'Close the COG-14 evidence gap',
      ...over,
    })

  it('accepts a legal propose', async () => {
    expect(await validate(legal())).toHaveLength(0)
  })

  it('accepts a legal confirm WITH a hash', async () => {
    expect(await validate(legal({ mode: 'confirm', proposalHash: HASH }))).toHaveLength(0)
  })

  it('REJECTS confirm with no proposalHash — you confirm the list you were shown', async () => {
    const errs = await validate(legal({ mode: 'confirm' }))
    expect(errs.map((e) => e.property)).toContain('proposalHash')
  })

  it('REJECTS confirm with a non-hex / wrong-length hash', async () => {
    expect(await validate(legal({ mode: 'confirm', proposalHash: 'z'.repeat(64) }))).not.toHaveLength(
      0,
    )
    expect(await validate(legal({ mode: 'confirm', proposalHash: 'a'.repeat(63) }))).not.toHaveLength(
      0,
    )
  })

  it('REJECTS a hash smuggled into a PROPOSE call', async () => {
    // §6.2: a stale hash must not be accepted and silently ignored on propose.
    const errs = await validate(legal({ mode: 'propose', proposalHash: HASH }))
    expect(errs.map((e) => e.property)).toContain('proposalHash')
  })

  it('REJECTS a 61-element schoolIds and an empty one', async () => {
    const many = Array.from({ length: 61 }, (_, i) => `3333333${i % 10}-3333-4333-8333-333333333333`)
    expect(await validate(legal({ schoolIds: many }))).not.toHaveLength(0)
    expect(await validate(legal({ schoolIds: [] }))).not.toHaveLength(0)
  })

  it('REJECTS a non-UUID catalogStandardId and a non-UUID school id', async () => {
    expect(await validate(legal({ catalogStandardId: 'COG-14' }))).not.toHaveLength(0)
    expect(await validate(legal({ schoolIds: [school(1), 'not-a-uuid'] }))).not.toHaveLength(0)
  })

  it('REJECTS an unknown mode and a too-short title', async () => {
    expect(await validate(legal({ mode: 'apply' }))).not.toHaveLength(0)
    expect(await validate(legal({ title: 'x' }))).not.toHaveLength(0)
  })

  it('bounds dueDate and targetRubricScore', async () => {
    expect(await validate(legal({ dueDate: '30-09-2026' }))).not.toHaveLength(0)
    expect(await validate(legal({ dueDate: '2026-09-30' }))).toHaveLength(0)
    expect(await validate(legal({ targetRubricScore: 5 }))).not.toHaveLength(0)
    expect(await validate(legal({ targetRubricScore: 3 }))).toHaveLength(0)
  })
})
