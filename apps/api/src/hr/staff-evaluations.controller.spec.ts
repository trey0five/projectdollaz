import 'reflect-metadata'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { validate } from 'class-validator'
import { plainToInstance } from 'class-transformer'
import { StaffEvaluationsController } from './staff-evaluations.controller.js'
import {
  CreateStaffEvaluationDto,
  ListStaffEvaluationsQueryDto,
  STAFF_EVALUATION_STATUSES,
  UpdateStaffEvaluationDto,
} from './dto/staff-evaluation.dto.js'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase F — the staff-evaluation routes, at the boundary.
//
// The guard chain and the role split are asserted by METADATA REFLECTION rather
// than by booting Nest: a decorator deleted in a refactor is invisible to every
// functional test and visible to this one. That matters more here than anywhere
// else in the app — this register is ADULT-STAFF EMPLOYMENT PII, and the ONLY
// thing standing between a board viewer and "which named employee is overdue for
// an evaluation" is the @Roles list on each method.
// ─────────────────────────────────────────────────────────────────────────────

/** Nest stores class-level guards under this key. */
const GUARDS = '__guards__'
const ROLES = 'roles'

function guardsOn(target: object): unknown[] {
  return (Reflect.getMetadata(GUARDS, target) as unknown[]) ?? []
}

describe('StaffEvaluationsController — the guard chain', () => {
  it('carries JwtAuthGuard, RolesGuard and EntitlementGuard at the class level', () => {
    const guards = guardsOn(StaffEvaluationsController)
    expect(guards).toContain(JwtAuthGuard)
    expect(guards).toContain(RolesGuard)
    expect(guards).toContain(EntitlementGuard)
  })

  it("is gated on the 'hr' module", () => {
    // The metadata key is owned by requires-module.decorator.ts; this reads
    // whatever key it set rather than re-typing the string.
    const keys = Reflect.getMetadataKeys(StaffEvaluationsController)
    const moduleKey = keys.find((k) => String(k).toLowerCase().includes('module'))
    expect(moduleKey, 'no @RequiresModule metadata on StaffEvaluationsController').toBeDefined()
    expect(Reflect.getMetadata(moduleKey as string, StaffEvaluationsController)).toBe('hr')
  })
})

describe('StaffEvaluationsController — the PII role split (§4.1)', () => {
  const proto = StaffEvaluationsController.prototype as unknown as Record<string, object>

  it('EVERY route that can return a person NAME excludes viewer', () => {
    for (const m of ['list', 'get', 'create', 'update', 'remove']) {
      const roles = Reflect.getMetadata(ROLES, proto[m]) as string[]
      expect(roles, `${m} has no @Roles`).toEqual(['owner', 'accountant'])
      expect(roles, `${m} lets a viewer read a staff name`).not.toContain('viewer')
    }
  })

  it('/summary — COUNTS ONLY — is open to all three roles', () => {
    expect(Reflect.getMetadata(ROLES, proto.summary)).toEqual(['owner', 'accountant', 'viewer'])
  })

  it('viewer is denied the register outright — that is stricter than every other register, on purpose', () => {
    // Governance, facilities and advancement all let a viewer READ their register.
    // This one does not, because its rows name individual employees.
    const listRoles = Reflect.getMetadata(ROLES, proto.list) as string[]
    const summaryRoles = Reflect.getMetadata(ROLES, proto.summary) as string[]
    expect(listRoles).not.toContain('viewer')
    expect(summaryRoles).toContain('viewer')
  })
})

describe('StaffEvaluationsController — route ORDER', () => {
  it("declares @Get('summary') BEFORE @Get(':evaluationId')", () => {
    // Nest matches in declaration order. With the literal second, ParseUUIDPipe
    // would 400 on the string 'summary' and the one route a viewer can call would
    // be dead. Asserted over the SOURCE because the order is a property of the
    // file, not of any metadata Nest keeps.
    const src = readFileSync(
      fileURLToPath(new URL('./staff-evaluations.controller.ts', import.meta.url)),
      'utf8',
    )
    const summaryAt = src.indexOf("@Get('summary')")
    const paramAt = src.indexOf("@Get(':evaluationId')")
    expect(summaryAt).toBeGreaterThan(-1)
    expect(paramAt).toBeGreaterThan(-1)
    expect(summaryAt).toBeLessThan(paramAt)
  })
})

describe('StaffEvaluationsController — it delegates and composes nothing', () => {
  it('passes the schoolId, the validated payload and the user id straight through', async () => {
    const svc = {
      list: vi.fn(async () => ({ evaluations: [], summary: {} })),
      summary: vi.fn(async () => ({ total: 0 })),
      get: vi.fn(async () => ({ evaluation: {} })),
      create: vi.fn(async () => ({ evaluation: {} })),
      update: vi.fn(async () => ({ evaluation: {} })),
      remove: vi.fn(async () => ({ id: 'e1' })),
    }
    const c = new StaffEvaluationsController(svc as never)
    const user = { id: 'user-1' } as never

    await c.list('school-A', { overdue: 'true' })
    expect(svc.list).toHaveBeenCalledWith('school-A', { overdue: 'true' })
    await c.summary('school-A')
    expect(svc.summary).toHaveBeenCalledWith('school-A')
    await c.get('school-A', 'e1')
    expect(svc.get).toHaveBeenCalledWith('school-A', 'e1')
    await c.create('school-A', { personId: 'p1', cycleLabel: 'c', dueDate: '2026-06-30' }, user)
    expect(svc.create).toHaveBeenCalledWith(
      'school-A',
      { personId: 'p1', cycleLabel: 'c', dueDate: '2026-06-30' },
      'user-1',
    )
    await c.update('school-A', 'e1', { status: 'completed' }, user)
    expect(svc.update).toHaveBeenCalledWith('school-A', 'e1', { status: 'completed' }, 'user-1')
    await c.remove('school-A', 'e1', user)
    expect(svc.remove).toHaveBeenCalledWith('school-A', 'e1', 'user-1')
  })
})

describe('the DTOs — the global forbidNonWhitelisted pipe has something to whitelist', () => {
  const base = { personId: '11111111-1111-4111-8111-111111111111', cycleLabel: '2025-26', dueDate: '2026-06-30' }

  it('CreateStaffEvaluationDto requires personId, cycleLabel and dueDate', async () => {
    expect(await validate(plainToInstance(CreateStaffEvaluationDto, base))).toHaveLength(0)
    for (const key of ['personId', 'cycleLabel', 'dueDate'] as const) {
      const missing = { ...base }
      delete (missing as Record<string, unknown>)[key]
      expect(
        await validate(plainToInstance(CreateStaffEvaluationDto, missing)),
        `${key} must be required`,
      ).not.toHaveLength(0)
    }
  })

  it('dueDate is NOT NULL — an evaluation with no due date is not a cycle record', async () => {
    expect(
      await validate(plainToInstance(CreateStaffEvaluationDto, { ...base, dueDate: null })),
    ).not.toHaveLength(0)
  })

  it('accepts every listed status and rejects an invented one', async () => {
    for (const status of STAFF_EVALUATION_STATUSES) {
      expect(await validate(plainToInstance(CreateStaffEvaluationDto, { ...base, status })), status).toHaveLength(0)
    }
    expect(
      await validate(plainToInstance(CreateStaffEvaluationDto, { ...base, status: 'partially_done' })),
    ).not.toHaveLength(0)
  })

  it('bounds cycleLabel, evaluatorName and notes', async () => {
    expect(
      await validate(plainToInstance(CreateStaffEvaluationDto, { ...base, cycleLabel: '' })),
    ).not.toHaveLength(0)
    expect(
      await validate(plainToInstance(CreateStaffEvaluationDto, { ...base, cycleLabel: 'x'.repeat(81) })),
    ).not.toHaveLength(0)
    expect(
      await validate(plainToInstance(CreateStaffEvaluationDto, { ...base, evaluatorName: 'x'.repeat(201) })),
    ).not.toHaveLength(0)
    expect(
      await validate(plainToInstance(CreateStaffEvaluationDto, { ...base, notes: 'x'.repeat(4001) })),
    ).not.toHaveLength(0)
  })

  it('nullable fields accept an explicit null (the clear-on-PATCH pattern)', async () => {
    expect(
      await validate(
        plainToInstance(UpdateStaffEvaluationDto, {
          completedDate: null,
          evaluatorName: null,
          notes: null,
        }),
      ),
    ).toHaveLength(0)
  })

  it('UpdateStaffEvaluationDto has NO personId property — a stray one is not whitelisted', () => {
    // Re-pointing an evaluation at a different person is a delete plus a create,
    // not an edit: the record would otherwise silently claim a different employee
    // was evaluated on the original dates. The global forbidNonWhitelisted pipe
    // 400s any key the class does not declare, so the guarantee is the ABSENCE of
    // a decorated `personId` — asserted over the source, since an absent property
    // has no metadata to read.
    const src = readFileSync(
      fileURLToPath(new URL('./dto/staff-evaluation.dto.ts', import.meta.url)),
      'utf8',
    )
    const from = src.indexOf('export class UpdateStaffEvaluationDto')
    expect(from).toBeGreaterThan(-1)
    const rest = src.slice(from + 1)
    const nextClass = rest.indexOf('export class ')
    const cls = nextClass === -1 ? rest : rest.slice(0, nextClass)
    expect(cls).not.toMatch(/^\s*personId[?!]?\s*:/m)
    // …and the CREATE DTO does declare one, so the assertion above is not vacuous.
    const createCls = src.slice(
      src.indexOf('export class CreateStaffEvaluationDto'),
      src.indexOf('export class UpdateStaffEvaluationDto'),
    )
    expect(createCls).toMatch(/^\s*personId[?!]?\s*:/m)
  })

  it('ListStaffEvaluationsQueryDto bounds overdue to the two query strings', async () => {
    for (const overdue of ['true', 'false']) {
      expect(await validate(plainToInstance(ListStaffEvaluationsQueryDto, { overdue }))).toHaveLength(0)
    }
    expect(
      await validate(plainToInstance(ListStaffEvaluationsQueryDto, { overdue: 'yes' })),
    ).not.toHaveLength(0)
    expect(
      await validate(plainToInstance(ListStaffEvaluationsQueryDto, { personId: 'not-a-uuid' })),
    ).not.toHaveLength(0)
  })
})

describe('module wiring — HrModule', () => {
  it('HrModule declares the controller and the service', async () => {
    const mod = await import('./hr.module.js')
    expect(mod.HrModule).toBeDefined()
    expect(Reflect.getMetadata('controllers', mod.HrModule)).toContain(StaffEvaluationsController)
    const providers = Reflect.getMetadata('providers', mod.HrModule) as { name: string }[]
    expect(providers.map((p) => p.name)).toContain('StaffEvaluationsService')
  })

  it('HrModule exports NOTHING — the PII shape does not leave this module', async () => {
    const { HrModule } = await import('./hr.module.js')
    // StaffEvaluationPublic carries personName. The two places outside this module
    // that read the table (the twin collector and the evidence anchor) go straight
    // to Prisma with a narrow, name-free select; handing them this service would
    // hand them the name.
    expect((Reflect.getMetadata('exports', HrModule) as unknown[]) ?? []).toEqual([])
  })

  // THIS is the one that catches a missing export. Reading `controllers`/`providers`
  // off the module metadata (above) proves only that a decorator names a class — it
  // never asks Nest to RESOLVE anything, so a provider this module injects but that
  // no imported module EXPORTS still passes. That is not hypothetical: Phase E
  // shipped exactly that bug. Every unit spec passed, the nest build was clean, and
  // the API died on BOOT with UnknownDependenciesException — a failure whose
  // production shape is a container that never starts.
  //
  // WHY THIS READS SOURCE AND NOT `design:paramtypes`: the obvious version of this
  // spec — reflect the constructor types and look them up — is VACUOUS here. vitest
  // transforms TS with esbuild, which does not implement `emitDecoratorMetadata`, so
  // `design:paramtypes` is undefined under test and the loop checks nothing. Only
  // the tsc/nest build emits it, which is exactly why the bug reached runtime.
  // `@Module()`'s own metadata is safe to read (the decorator is handed the object
  // literal), so the import graph below is real; only the ctor types come from text.
  it('HrModule RESOLVES — every injected provider is actually exported by an imported module', async () => {
    const { HrModule } = await import('./hr.module.js')

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

    const available = new Set<string>(meta(HrModule, 'providers').map(nameOf))
    for (const imp of meta(HrModule, 'imports')) {
      for (const x of exportedSurface(imp)) available.add(x)
    }
    // Provided by @Global modules the app root imports — reachable from every
    // module without HrModule naming them.
    for (const g of ['PrismaService', 'ConfigService']) available.add(g)

    const dir = fileURLToPath(new URL('.', import.meta.url))
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    const sources = files.map((f) => readFileSync(join(dir, f), 'utf8'))

    const unresolved: string[] = []
    for (const cls of [...meta(HrModule, 'providers'), ...meta(HrModule, 'controllers')]) {
      const name = nameOf(cls)
      const src = sources.find((s) => new RegExp(`export class ${name}\\b`).test(s))
      expect(src, `source for ${name} not found under src/hr/`).toBeDefined()
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

  it('AppModule imports HrModule — a module nothing imports serves no route', async () => {
    const { AppModule } = await import('../app.module.js')
    const { HrModule } = await import('./hr.module.js')
    expect(Reflect.getMetadata('imports', AppModule)).toContain(HrModule)
  })
})
