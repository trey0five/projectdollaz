// #51 — record imports: preview matches by the natural key and never writes;
// commit updates matches and creates the rest through the module services.
import 'reflect-metadata'
import { describe, expect, it, vi } from 'vitest'
import { RecordImportsService } from './record-imports.service.js'
import type { CreateStandardDto } from '../accreditation/dto/create-standard.dto.js'

const file = (s: string) => ({ buffer: Buffer.from(s, 'utf8') })

function make(data: { maintenance?: unknown[]; campaigns?: unknown[]; standards?: unknown[] } = {}) {
  let seq = 0
  const id = () => `id-${(seq += 1)}`
  const prisma = {
    maintenanceItem: { findMany: vi.fn(async () => data.maintenance ?? []) },
    advancementCampaign: { findMany: vi.fn(async () => data.campaigns ?? []) },
    accreditationStandard: { findMany: vi.fn(async () => data.standards ?? []) },
  }
  const facilities = { createMaintenance: vi.fn(async () => ({ id: id() })), updateMaintenance: vi.fn(async () => ({})) }
  const advancement = {
    createCampaign: vi.fn(async (_s: string, dto: { name: string }) => ({ id: id(), name: dto.name })),
    updateCampaign: vi.fn(async () => ({})),
    createGift: vi.fn(async () => ({ id: id() })),
  }
  const accreditation = { createStandard: vi.fn(async () => ({ id: id() })), updateStandard: vi.fn(async () => ({})) }
  const svc = new RecordImportsService(prisma as never, facilities as never, advancement as never, accreditation as never)
  return { svc, facilities, advancement, accreditation }
}

describe('maintenance', () => {
  it('preview: matched by item + location; dates read; nothing written', async () => {
    const { svc, facilities } = make({ maintenance: [{ id: 'm1', title: 'Boiler inspection', location: 'Main' }] })
    const p = await svc.preview('s1', 'maintenance', file('Task,Building,Next Service,Estimate\nBoiler inspection,Main,10/1/2026,"$1,200"\nRoof repair,Gym,soon,"$18,000"\n'))
    expect(p.columns.map((c) => c.field).sort()).toEqual(['Due date', 'Estimated cost', 'Item', 'Location'])
    expect(p.rows.map((r) => [r.action, r.existingId])).toEqual([['update', 'm1'], ['skipped', null]])
    expect(p.rows[0]!.record).toMatchObject({ title: 'Boiler inspection', location: 'Main', targetDate: '2026-10-01', estimatedCost: 1200 })
    expect(facilities.createMaintenance).not.toHaveBeenCalled()
  })
  it('commit: update the match, create the rest', async () => {
    const { svc, facilities } = make({ maintenance: [{ id: 'm1', title: 'Boiler inspection', location: 'Main' }] })
    const r = await svc.commitMaintenance('s1', [{ title: 'Boiler Inspection', location: 'main' }, { title: 'Roof repair', location: 'Gym' }], 'u1')
    expect(r).toEqual({ created: 1, updated: 1, skipped: 0, total: 2 })
    expect(facilities.updateMaintenance).toHaveBeenCalledWith('s1', 'm1', { title: 'Boiler Inspection', location: 'main' }, 'u1')
  })
})

describe('gifts', () => {
  it('preview flags missing dates/amounts and in-file repeats; commit creates the campaign it names', async () => {
    const { svc, advancement } = make({ campaigns: [{ id: 'c1', name: 'Annual Fund' }] })
    const p = await svc.preview('s1', 'gifts', file('Donor,Date,Amount,Fund\nAnn Smith,9/1/2026,"$5,000",Annual Fund\nAnn Smith,9/1/2026,"$5,000",Annual Fund\nBo Diaz,,100,Gala\n'))
    expect(p.rows.map((r) => r.action)).toEqual(['new', 'skipped', 'skipped'])
    const r = await svc.commitGifts('s1', [
      { kind: 'gift', amount: 5000, occurredOn: '2026-09-01', label: 'Ann Smith', campaign: 'Annual Fund' },
      { kind: 'pledge', amount: 1000, receivedAmount: 250, occurredOn: '2026-09-02', label: 'Bo Diaz', campaign: 'Gala' },
    ], 'u1')
    expect(r).toEqual({ created: 2, updated: 0, skipped: 0, total: 2 })
    expect(advancement.createCampaign).toHaveBeenCalledWith('s1', { name: 'Gala', status: 'active' }, 'u1')
    expect(advancement.createGift).toHaveBeenNthCalledWith(1, 's1', 'c1', { kind: 'gift', amount: 5000, occurredOn: '2026-09-01', label: 'Ann Smith' }, 'u1')
  })
})

describe('standards', () => {
  it('matches by code and refuses a file without a standard column', async () => {
    const { svc, accreditation } = make({ standards: [{ id: 't1', code: '1.2' }] })
    const p = await svc.preview('s1', 'standards', file('Standard,Rating\n1.2 Mission is set,Met\n2.1 Curriculum documented,Partially met\n'))
    expect(p.rows.map((r) => [r.action, r.record])).toEqual([
      ['update', { code: '1.2', title: '1.2 Mission is set', rating: 'met' }],
      ['new', { code: '2.1', title: '2.1 Curriculum documented', rating: 'partially_met' }],
    ])
    const r = await svc.commitStandards('s1', p.rows.map((x) => x.record as CreateStandardDto), 'u1')
    expect(r).toEqual({ created: 1, updated: 1, skipped: 0, total: 2 })
    expect(accreditation.updateStandard).toHaveBeenCalledWith('s1', 't1', { code: '1.2', title: '1.2 Mission is set', rating: 'met' }, 'u1')
    const missing = await svc.preview('s1', 'standards', file('Owner,Date\nAnn,2027\n'))
    expect(missing.problem).toMatch(/Couldn’t find a standard column/)
    expect(missing.rows).toEqual([])
    expect(missing.table.needs).toMatch(/standard column/)
  })
})
