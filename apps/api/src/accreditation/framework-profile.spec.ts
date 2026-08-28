import { describe, expect, it, vi } from 'vitest'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import {
  COGNIA_DIVISIONS,
  DIVISION_CODES,
  divisionFor,
  divisionsFor,
  sealLineFor,
} from './divisions.js'
import { AccreditationCatalogService } from './catalog.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// WS1 — the DIVISION PROFILE. Two things are pinned here:
//   1. sealLineFor's composition, VERBATIM, for all three divisions + the null
//      cases — the one server-side source of the seal sentence.
//   2. The R3 INVARIANT: the profile row is OPTIONAL METADATA — writing one
//      never flips `adopted` on listFrameworks (adoption stays derived from
//      standards rows, the codebase-wide fact).
// ─────────────────────────────────────────────────────────────────────────────

describe('divisions.ts — the closed constant + the seal line', () => {
  it('exactly three divisions, on both Cognia editions and nobody else', () => {
    expect(DIVISION_CODES).toEqual(['nca_casi', 'sacs_casi', 'nwac'])
    expect(divisionsFor('cognia_2022')).toBe(COGNIA_DIVISIONS)
    expect(divisionsFor('cognia_2025')).toBe(COGNIA_DIVISIONS)
    expect(divisionsFor('msa_cess_2022')).toEqual([])
    expect(divisionsFor('acs_wasc')).toEqual([])
    expect(divisionsFor('unknown')).toEqual([])
  })

  it('seal lines are composed HERE, verbatim, and nowhere else', () => {
    expect(sealLineFor('cognia_2025', 'nca_casi')).toBe(
      'Accredited by NCA CASI, an accreditation division of Cognia',
    )
    expect(sealLineFor('cognia_2025', 'sacs_casi')).toBe(
      'Accredited by SACS CASI, an accreditation division of Cognia',
    )
    expect(sealLineFor('cognia_2022', 'nwac')).toBe(
      'Accredited by NWAC, an accreditation division of Cognia',
    )
  })

  it('null / dangling / wrong-framework division codes read as NO seal line (fail-soft)', () => {
    expect(sealLineFor('cognia_2025', null)).toBeNull()
    expect(sealLineFor('cognia_2025', undefined)).toBeNull()
    expect(sealLineFor('cognia_2025', 'advanc_ed')).toBeNull()
    expect(sealLineFor('msa_cess_2022', 'nca_casi')).toBeNull()
    expect(divisionFor('msa_cess_2022', 'nca_casi')).toBeNull()
  })

  it("'AdvancED' is never a division — alias-only, never in the picker", () => {
    expect(COGNIA_DIVISIONS.some((d) => /advanc/i.test(d.code) || /advanc/i.test(d.name))).toBe(
      false,
    )
  })
})

// A slim store: only what setProfile/listFrameworks need.
function makeProfileStore() {
  let seq = 0
  const uid = (p: string) => `${p}-${++seq}`
  const frameworks = new Map<string, { id: string; code: string; active: boolean; [k: string]: unknown }>()
  const profiles: { id: string; schoolId: string; frameworkId: string; division: string | null }[] = []
  const prisma = {
    accreditationFramework: {
      upsert: vi.fn(async ({ where, create, update }: never) => {
        const w = where as { code: string }
        const ex = frameworks.get(w.code)
        if (ex) {
          Object.assign(ex, update)
          return ex
        }
        const row = { id: uid('fw'), active: true, ...(create as object) } as never
        frameworks.set(w.code, row)
        return row
      }),
      findFirst: vi.fn(async ({ where }: never) => {
        const w = where as { code?: string; active?: boolean }
        for (const f of frameworks.values()) {
          if (w.code && f.code !== w.code) continue
          if (w.active !== undefined && f.active !== w.active) continue
          return { ...f, standards: [] }
        }
        return null
      }),
      findMany: vi.fn(async () => [...frameworks.values()].map((f) => ({ ...f, standards: [] }))),
    },
    accreditationCatalogStandard: {
      upsert: vi.fn(async ({ create }: never) => ({ id: uid('cat'), ...(create as object) })),
      findMany: vi.fn(async () => []),
      update: vi.fn(async () => ({})),
    },
    accreditationCatalogRequirement: {
      upsert: vi.fn(async ({ create }: never) => ({ id: uid('req'), ...(create as object) })),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    accreditationStandard: {
      findMany: vi.fn(async () => []),
      groupBy: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      create: vi.fn(async ({ data }: never) => ({ id: uid('std'), ...(data as object) })),
    },
    accreditationFrameworkProfile: {
      findMany: vi.fn(async ({ where }: never) =>
        profiles.filter((p) => p.schoolId === (where as { schoolId: string }).schoolId),
      ),
      findFirst: vi.fn(async ({ where }: never) => {
        const w = where as { schoolId: string; frameworkId: string }
        return (
          profiles.find((p) => p.schoolId === w.schoolId && p.frameworkId === w.frameworkId) ?? null
        )
      }),
      upsert: vi.fn(async ({ where, create, update }: never) => {
        const w = (where as { schoolId_frameworkId: { schoolId: string; frameworkId: string } })
          .schoolId_frameworkId
        const ex = profiles.find(
          (p) => p.schoolId === w.schoolId && p.frameworkId === w.frameworkId,
        )
        if (ex) {
          Object.assign(ex, update)
          return ex
        }
        const row = { id: uid('prof'), division: null, ...(create as object) } as never
        profiles.push(row)
        return row
      }),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    improvementInitiative: { count: vi.fn(async () => 0) },
    $transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(prisma)),
  }
  const audit = { write: vi.fn(async () => undefined) }
  const svc = new AccreditationCatalogService(prisma as never, audit as never)
  return { svc, prisma, audit, profiles }
}

describe('WS1 — PATCH framework profile (setProfile)', () => {
  it('upserts the division, composes the seal line, audits', async () => {
    const { svc, profiles, audit } = makeProfileStore()
    await svc.seedCatalog()
    const res = await svc.setProfile('school-A', 'cognia_2025', 'nca_casi', 'user-1')
    expect(res.division).toBe('nca_casi')
    expect(res.sealLine).toBe('Accredited by NCA CASI, an accreditation division of Cognia')
    expect(profiles).toHaveLength(1)
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'accreditation.framework.profile.updated' }),
    )
  })

  it('explicit null CLEARS the division (and the seal line with it)', async () => {
    const { svc } = makeProfileStore()
    await svc.seedCatalog()
    await svc.setProfile('school-A', 'cognia_2025', 'sacs_casi', 'user-1')
    const res = await svc.setProfile('school-A', 'cognia_2025', null, 'user-1')
    expect(res.division).toBeNull()
    expect(res.sealLine).toBeNull()
  })

  it('400s a division on a framework that has none (null is the only legal value)', async () => {
    const { svc } = makeProfileStore()
    await svc.seedCatalog()
    await expect(
      svc.setProfile('school-A', 'msa_cess_2022', 'nca_casi', 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException)
    // …but clearing on such a framework is fine (idempotent no-op semantics).
    const res = await svc.setProfile('school-A', 'msa_cess_2022', null, 'user-1')
    expect(res.division).toBeNull()
  })

  it('404s an unknown framework code', async () => {
    const { svc } = makeProfileStore()
    await svc.seedCatalog()
    await expect(svc.setProfile('school-A', 'nope', 'nca_casi', 'user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it('THE R3 INVARIANT: a profile row never flips `adopted` on listFrameworks', async () => {
    const { svc } = makeProfileStore()
    await svc.seedCatalog()
    await svc.setProfile('school-A', 'cognia_2025', 'nwac', 'user-1')
    const { frameworks } = await svc.listFrameworks('school-A')
    const cognia = frameworks.find((f) => f.code === 'cognia_2025')!
    // The profile travels (division + seal line)…
    expect(cognia.division).toBe('nwac')
    expect(cognia.sealLine).toBe('Accredited by NWAC, an accreditation division of Cognia')
    // …but adoption stays derived from STANDARDS rows, of which there are none.
    expect(cognia.adopted).toBe(false)
    expect(cognia.adoptedCount).toBe(0)
    expect(cognia.upgrade).toBeNull()
  })

  it('FrameworkPublic carries recognition badges — resolved rows, absent for Cognia', async () => {
    const { svc } = makeProfileStore()
    await svc.seedCatalog()
    const { frameworks } = await svc.listFrameworks('school-A')
    // Cognia: verified absence from both lists → empty array, never a guess.
    expect(frameworks.find((f) => f.code === 'cognia_2025')!.recognitions).toEqual([])
    // SAIS: on both lists, resolved to {code, name, line} display rows.
    const sais = frameworks.find((f) => f.code === 'sais_2023')!
    expect(sais.recognitions).toEqual([
      expect.objectContaining({ code: 'ncpsa', name: 'NCPSA', line: expect.stringContaining('NCPSA') }),
      expect.objectContaining({ code: 'icaisa', name: 'ICAISA', line: expect.stringContaining('ICAISA') }),
    ])
    // NIPSA: adoptable, index-less, NCPSA-badged.
    const nipsa = frameworks.find((f) => f.code === 'nipsa_academic')!
    expect(nipsa.recognitions.map((r) => r.code)).toEqual(['ncpsa'])
    expect(nipsa.divisions).toEqual([])
  })
})
