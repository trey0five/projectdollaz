import { describe, expect, it, vi } from 'vitest'
import { SearchService } from './search.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4 Knowledge/Search v1 — the cross-domain search service. Verified WITHOUT
// booting Nest or Prisma: PrismaService (per-entity findMany) + BillingService
// (isEntitledForModule) are hand-mocked. Covers: per-entity match + shape, module
// gating (gate-before-query — locked domains are NEVER queried), tenant isolation
// (every findMany carries where.schoolId), min-length short-circuit, fail-soft,
// fail-closed billing, ranking (title-first), and the grouped response shape.
// ─────────────────────────────────────────────────────────────────────────────

const SCHOOL = '11111111-1111-1111-1111-111111111111'

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'x1',
    title: 'boiler',
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    ...over,
  }
}

/**
 * Build a SearchService with mockable prisma tables + billing gate. `gate` maps
 * moduleKey → boolean|throw; default all-true (trial-style all-access). Each
 * table's findMany defaults to [] and can be overridden per entity.
 */
function makeService(
  opts: {
    gate?: (key: string) => boolean | Promise<boolean>
    policy?: unknown[]
    committee?: unknown[]
    meeting?: unknown[]
    task?: unknown[]
    standard?: unknown[]
    evidence?: unknown[]
    maintenance?: unknown[]
    document?: unknown[]
    policyFn?: () => Promise<unknown[]>
  } = {},
) {
  const mk = (rows: unknown[] = []) => vi.fn(async () => rows)
  const prisma = {
    policy: { findMany: opts.policyFn ? vi.fn(opts.policyFn) : mk(opts.policy) },
    committee: { findMany: mk(opts.committee) },
    meeting: { findMany: mk(opts.meeting) },
    task: { findMany: mk(opts.task) },
    accreditationStandard: { findMany: mk(opts.standard) },
    accreditationEvidence: { findMany: mk(opts.evidence) },
    maintenanceItem: { findMany: mk(opts.maintenance) },
    knowledgeDocument: { findMany: mk(opts.document) },
  }
  const gate = opts.gate ?? (() => true)
  const billing = {
    isEntitledForModule: vi.fn(async (_schoolId: string, key: string) => {
      const v = gate(key)
      return v instanceof Promise ? v : v
    }),
  }
  const svc = new SearchService(prisma as never, billing as never)
  return { svc, prisma, billing }
}

describe('SearchService — matching + shape', () => {
  it('matches per entity and maps to the unified result (type/domain/link/snippet/matchedField)', async () => {
    const { svc } = makeService({
      task: [row({ id: 't1', title: 'Fix the boiler', description: null })],
      policy: [row({ id: 'p1', title: 'HR policy', category: 'HR', owner: null, notes: 'boiler mention' })],
      standard: [
        row({ id: 's1', code: 'MSA-3', title: 'Facilities', category: null, owner: null, notes: 'boiler' }),
      ],
      evidence: [row({ id: 'e1', title: 'Boiler cert', notes: null, reference: null })],
      maintenance: [row({ id: 'm1', title: 'Boiler repair', location: null, category: null, notes: null })],
      document: [row({ id: 'd1', title: 'Boiler manual', description: null, fileName: 'boiler.pdf' })],
    })
    const res = await svc.search(SCHOOL, 'boiler')

    expect(res.query).toBe('boiler')
    expect(res.total).toBe(6)
    // Groups in stable order: tasks(core), documents, governance, accreditation, facilities.
    expect(res.groups.map((g) => g.domain)).toEqual([
      'core',
      'documents',
      'governance',
      'accreditation',
      'facilities',
    ])
    const task = res.groups.find((g) => g.domain === 'core')!.items[0]
    expect(task).toMatchObject({ type: 'task', id: 't1', link: '/tasks', matchedField: 'title' })
    expect(task.snippet).toContain('boiler')
    // Documents are CORE — always searched (no gate), grouped right after Tasks.
    const doc = res.groups.find((g) => g.domain === 'documents')!.items[0]
    expect(doc).toMatchObject({ type: 'document', id: 'd1', link: '/knowledge', matchedField: 'title' })
    // Policy matched only in notes → matchedField 'notes'.
    const policy = res.groups.find((g) => g.domain === 'governance')!.items[0]
    expect(policy).toMatchObject({ type: 'policy', link: '/governance', matchedField: 'notes' })
    // Standard display title is "CODE — title".
    const acc = res.groups.find((g) => g.domain === 'accreditation')!
    const std = acc.items.find((i) => i.type === 'standard')!
    expect(std.title).toBe('MSA-3 — Facilities')
    // Accreditation group merges standards + evidence.
    expect(acc.items.map((i) => i.type).sort()).toEqual(['evidence', 'standard'])
    expect(acc.count).toBe(2)
  })

  it('total === sum of group counts; empty entitled groups are omitted', async () => {
    const { svc } = makeService({ task: [row({ id: 't1', title: 'boiler' })] })
    const res = await svc.search(SCHOOL, 'boiler')
    expect(res.groups).toHaveLength(1)
    expect(res.groups[0].domain).toBe('core')
    expect(res.total).toBe(res.groups.reduce((n, g) => n + g.count, 0))
  })
})

describe('SearchService — module gating (gate BEFORE query)', () => {
  it('finance-only school finds tasks + documents (both CORE); locked domains NEVER queried', async () => {
    const { svc, prisma } = makeService({
      gate: (key) => key === 'core', // governance/accreditation/facilities → false
      task: [row({ id: 't1', title: 'boiler' })],
      document: [row({ id: 'd1', title: 'boiler', description: null, fileName: 'b.pdf' })],
    })
    const res = await svc.search(SCHOOL, 'boiler')

    // Documents are CORE — a finance-only school STILL finds them (no gate).
    expect(res.groups.map((g) => g.domain)).toEqual(['core', 'documents'])
    // The security boundary: locked-domain findMany is never invoked.
    expect(prisma.policy.findMany).not.toHaveBeenCalled()
    expect(prisma.committee.findMany).not.toHaveBeenCalled()
    expect(prisma.meeting.findMany).not.toHaveBeenCalled()
    expect(prisma.accreditationStandard.findMany).not.toHaveBeenCalled()
    expect(prisma.accreditationEvidence.findMany).not.toHaveBeenCalled()
    expect(prisma.maintenanceItem.findMany).not.toHaveBeenCalled()
    // Tasks + documents (core) always run.
    expect(prisma.task.findMany).toHaveBeenCalledOnce()
    expect(prisma.knowledgeDocument.findMany).toHaveBeenCalledOnce()
  })

  it('trial school (all gates true) queries all entities incl. documents', async () => {
    const { svc, prisma } = makeService()
    await svc.search(SCHOOL, 'boiler')
    expect(prisma.task.findMany).toHaveBeenCalledOnce()
    expect(prisma.knowledgeDocument.findMany).toHaveBeenCalledOnce()
    expect(prisma.policy.findMany).toHaveBeenCalledOnce()
    expect(prisma.committee.findMany).toHaveBeenCalledOnce()
    expect(prisma.meeting.findMany).toHaveBeenCalledOnce()
    expect(prisma.accreditationStandard.findMany).toHaveBeenCalledOnce()
    expect(prisma.accreditationEvidence.findMany).toHaveBeenCalledOnce()
    expect(prisma.maintenanceItem.findMany).toHaveBeenCalledOnce()
  })

  it('governance domain returns committee + meeting results alongside policies', async () => {
    const { svc } = makeService({
      committee: [row({ id: 'c1', name: 'Finance boiler committee', kind: 'finance', chair: null, description: null })],
      meeting: [row({ id: 'mtg1', title: 'Boiler review meeting', agenda: null, decisions: null, minutes: null })],
    })
    const res = await svc.search(SCHOOL, 'boiler')
    const gov = res.groups.find((g) => g.domain === 'governance')!
    const types = gov.items.map((i) => i.type)
    expect(types).toContain('committee')
    expect(types).toContain('meeting')
    for (const it of gov.items) expect(it.link).toBe('/governance')
  })

  it('fail-CLOSED: a billing error for facilities excludes it (never queried)', async () => {
    const { svc, prisma } = makeService({
      gate: (key) => {
        if (key === 'facilities') throw new Error('billing down')
        return true
      },
    })
    const res = await svc.search(SCHOOL, 'boiler')
    expect(prisma.maintenanceItem.findMany).not.toHaveBeenCalled()
    expect(res.groups.some((g) => g.domain === 'facilities')).toBe(false)
  })
})

describe('SearchService — tenant isolation', () => {
  it('every findMany is scoped to the path schoolId', async () => {
    const { svc, prisma } = makeService()
    await svc.search(SCHOOL, 'boiler')
    for (const table of [
      prisma.task,
      prisma.knowledgeDocument,
      prisma.policy,
      prisma.accreditationStandard,
      prisma.accreditationEvidence,
      prisma.maintenanceItem,
    ]) {
      const arg = (table.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(arg.where.schoolId).toBe(SCHOOL)
    }
  })
})

describe('SearchService — min length', () => {
  it('q shorter than 2 returns empty with ZERO prisma/billing calls', async () => {
    for (const q of ['', 'a', '  ', ' x ']) {
      const { svc, prisma, billing } = makeService()
      const res = await svc.search(SCHOOL, q)
      expect(res).toEqual({ query: '', total: 0, groups: [] })
      expect(prisma.task.findMany).not.toHaveBeenCalled()
      expect(billing.isEntitledForModule).not.toHaveBeenCalled()
    }
  })

  it('undefined q short-circuits to empty', async () => {
    const { svc, prisma } = makeService()
    const res = await svc.search(SCHOOL, undefined)
    expect(res.total).toBe(0)
    expect(prisma.task.findMany).not.toHaveBeenCalled()
  })
})

describe('SearchService — fail-soft', () => {
  it('one rejecting domain query still resolves 200 with the other groups', async () => {
    const { svc } = makeService({
      policyFn: async () => {
        throw new Error('policy query blew up')
      },
      task: [row({ id: 't1', title: 'boiler' })],
    })
    const res = await svc.search(SCHOOL, 'boiler')
    // Governance failed → contributes []; tasks still present; no throw.
    expect(res.groups.some((g) => g.domain === 'governance')).toBe(false)
    expect(res.groups.some((g) => g.domain === 'core')).toBe(true)
  })
})

describe('SearchService — ranking', () => {
  it('a title match sorts above a body-only match within an entity', async () => {
    const { svc } = makeService({
      task: [
        // body-only match, but NEWER updatedAt (would win on recency alone)
        row({ id: 'body', title: 'Unrelated', description: 'boiler', updatedAt: new Date('2026-01-01') }),
        // title match, OLDER
        row({ id: 'title', title: 'Boiler check', description: null, updatedAt: new Date('2025-01-01') }),
      ],
    })
    const res = await svc.search(SCHOOL, 'boiler')
    const ids = res.groups.find((g) => g.domain === 'core')!.items.map((i) => i.id)
    expect(ids).toEqual(['title', 'body'])
  })

  it('case-insensitive matching (BOILER matches boiler)', async () => {
    const { svc } = makeService({ task: [row({ id: 't1', title: 'boiler' })] })
    const res = await svc.search(SCHOOL, 'BOILER')
    expect(res.total).toBe(1)
    expect(res.groups[0].items[0].matchedField).toBe('title')
  })
})
