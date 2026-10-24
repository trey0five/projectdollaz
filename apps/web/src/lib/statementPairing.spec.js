// ─────────────────────────────────────────────────────────────────────────────
// #40 — half a trial balance + the other half = one.
//
// A QuickBooks Profit and Loss export is only the income half of a trial
// balance; the engine used to call it "Balanced". The intake now says "Income
// only". A same-period P&L half and its Balance Sheet half stay SEPARATE cards
// that offer Combine; only the person's Combine merges them into ONE entry (the
// parser's own mergeStatementResults), and only when they tie — a pair that
// doesn't tie is never combined (customer upload 2026-10-24: $977,876.30 apart).
// Never guesses: two P&Ls for one date stay apart.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { ingest, asStatementResult, mergeStatementResults, inferPeriod } from '@finrep/ingestion'
import {
  pairIntakeFiles,
  removeIntakeEntry,
  setRoleInRaw,
  memberHolding,
  memberIdsOf,
  isPairId,
} from './statementPairing.js'
import {
  balancePill,
  statementLines,
  numberedSummary,
  notesSummary,
  workbookNote,
  visibleWarnings,
} from './statementNotes.js'
import { HF_PL, HF_BS, workbook } from './__fixtures__/holyFamily.js'

const entry = (id, fileName, rows, extra = {}) => {
  const r = ingest(fileName, workbook({ Sheet: rows }))
  return {
    id,
    fileName,
    fileSize: 100,
    status: 'ready',
    rows: r.rows,
    metadata: r.metadata,
    warnings: r.warnings ?? [],
    role: 'cy',
    roleConfirmed: false,
    persisted: false,
    ...extra,
  }
}

const BS_DEC = HF_BS.map((row) => (row[0] === 'As of June 30, 2026' ? ['As of December 31, 2025', null] : row))
// The same P&L with the budget column a second time — a second income statement for the same date.
const pl = (id = 'pl', extra) => entry(id, 'Holy Family Profit and Loss 6-30-26.xlsx', HF_PL, extra)
const bs = (id = 'bs', extra) => entry(id, 'Holy Family Balance Sheet 6-30-26.xlsx', HF_BS, extra)
const bsDec = (id = 'bsd', extra) => entry(id, 'Holy Family Balance Sheet 12-31-25.xlsx', BS_DEC, extra)
// The same Balance Sheet with Operating Checking $977,876.30 higher — no longer matches the P&L.
const BS_OFF = HF_BS.map((row) => (String(row[0]).includes('10100 Operating Checking') ? [row[0], row[1] + 977876.3] : row))
const bsOff = (id = 'bso', extra) => entry(id, 'Holy Family Balance Sheet 6-30-26.xlsx', BS_OFF, extra)
const COMBINE = [{ plId: 'pl', bsId: 'bs' }]

describe('A40-1 — half a trial balance is never "Balanced"', () => {
  it('a P&L half says "Income only" and asks for the Balance Sheet', () => {
    const f = pl()
    expect(f.metadata.statement.partial).toBe('pl')
    expect(balancePill(f)).toEqual({ kind: 'half', half: 'pl', label: 'Income only' })
    expect(statementLines(f).map((l) => l.text)).toContain(
      'Income statement only — add a Balance Sheet export for the full picture.',
    )
  })

  it('a Balance Sheet half says "Balance sheet only"', () => {
    const f = bs()
    expect(balancePill(f).label).toBe('Balance sheet only')
    expect(statementLines(f)[0].text).toBe('Balance sheet only — add a Profit and Loss export for the full picture.')
  })
})

describe('A40-2 — pairIntakeFiles', () => {
  it('one P&L and one Balance Sheet on the same date stay separate and offer Combine', () => {
    const out = pairIntakeFiles([pl(), bs()])
    expect(out.map((f) => f.id)).toEqual(['pl', 'bs'])
    expect(out[0].pairNote).toMatchObject({ why: 'can-combine', partnerId: 'bs' })
    expect(out[1].pairNote).toMatchObject({ why: 'can-combine', partnerId: 'pl' })
    const line = statementLines(out[0]).find((l) => l.key === 'pair')
    expect(line.action).toMatchObject({ kind: 'combine', partnerId: 'bs' })
  })

  it('Combine (the person’s choice) merges a pair that ties into ONE full entry', () => {
    const a = pl()
    const b = bs()
    const out = pairIntakeFiles([a, b], COMBINE)
    expect(out).toHaveLength(1)
    const m = out[0]
    expect(isPairId(m.id)).toBe(true)
    expect(m.metadata.statement.partial).toBe('full')
    expect(m.mergedFrom).toEqual(['pl', 'bs'])
    expect(m.persisted).toBe(false)
    expect(m.fileName).toBe('Holy Family Profit and Loss 6-30-26.xlsx + Holy Family Balance Sheet 6-30-26.xlsx')
    const ref = mergeStatementResults(
      asStatementResult(a.rows, a.metadata, a.warnings),
      asStatementResult(b.rows, b.metadata, b.warnings),
    )
    expect(m.metadata.statement.balancePlug ?? null).toEqual(ref.metadata.statement.balancePlug ?? null)
    expect(m.rows).toEqual(ref.rows)
    expect(balancePill(m).kind).not.toBe('half')
    expect(statementLines(m)[0].text).toBe('Profit and Loss + Balance Sheet combined.')
  })

  it('P&L into This year, then its Balance Sheet into the Last-year box → ONE This-year entry, Jun 30, 2026', () => {
    // Live repro: the BS dropped into the nearest empty box ("Last year's
    // trial balance") pinned the merged pair to PY and left This year empty,
    // with the period falling back to Jun 30, 2027. The half placed FIRST
    // decides; a later slot drop only means "here is the other half".
    const a = pl('pl', { role: 'cy', roleConfirmed: true, roleFromSlot: true })
    const b = bs('bs', { role: 'py', roleConfirmed: true, roleFromSlot: true })
    expect(pairIntakeFiles([a, b])[0].pairNote.why).toBe('can-combine')
    const out = pairIntakeFiles([a, b], COMBINE)
    expect(out).toHaveLength(1)
    expect(out[0].metadata.statement.partial).toBe('full')
    expect(out[0].role).toBe('cy')
    expect(out[0].roleConfirmed).toBe(true)
    expect(inferPeriod(out[0].metadata).periodEndDate).toBe('2026-06-30')
    // …and the same the other way round (BS first, then the P&L into PY).
    const out2 = pairIntakeFiles([
      bs('bs', { role: 'cy', roleConfirmed: true, roleFromSlot: true }),
      pl('pl', { role: 'py', roleConfirmed: true, roleFromSlot: true }),
    ], COMBINE)
    expect(out2).toHaveLength(1)
    expect(out2[0].role).toBe('cy')
  })

  it('a role a person PICKED on each half still keeps them apart', () => {
    const out = pairIntakeFiles([
      pl('pl', { role: 'cy', roleConfirmed: true, roleFromSlot: false }),
      bs('bs', { role: 'py', roleConfirmed: true, roleFromSlot: false }),
    ])
    expect(out).toHaveLength(2)
  })

  it('the half line offers "Add its Balance Sheet" / "Add its Profit and Loss" into the SAME slot', () => {
    const [p] = pairIntakeFiles([pl('pl', { role: 'cy', roleConfirmed: true })])
    const half = statementLines(p).find((l) => l.key === 'half')
    expect(half.text).toBe('Income statement only — add a Balance Sheet export for the full picture.')
    expect(half.action).toEqual({ kind: 'addHalf', label: 'Add its Balance Sheet', role: 'cy' })
    const [b] = pairIntakeFiles([bs('bs', { role: 'cy' })])
    expect(statementLines(b).find((l) => l.key === 'half').action.label).toBe('Add its Profit and Loss')
    // Nothing to add on a saved-history card.
    expect(statementLines({ ...p, fromHistory: true }).find((l) => l.key === 'half').action).toBeNull()
  })

  it('the merged file name fits the API’s 255-character limit', () => {
    const long = 'x'.repeat(200)
    const out = pairIntakeFiles([pl('pl', { fileName: `${long}.xlsx` }), bs('bs', { fileName: `${long}.xlsx` })], COMBINE)
    expect(out).toHaveLength(1)
    expect(out[0].fileName.length).toBeLessThanOrEqual(255)
  })

  it('a saved P&L half + a new Balance Sheet, combined, become an UNSAVED entry', () => {
    const out = pairIntakeFiles([pl('pl', { persisted: true, importId: 'imp1' }), bs()], COMBINE)
    expect(out).toHaveLength(1)
    expect(out[0].persisted).toBe(false)
    expect(out[0].members.map((m) => m.persisted)).toEqual([true, false])
  })

  it('two SAVED halves are left as they are', () => {
    const a = pl('pl', { persisted: true })
    const b = bs('bs', { persisted: true })
    const out = pairIntakeFiles([a, b])
    expect(out.map((f) => f.id)).toEqual(['pl', 'bs'])
  })

  it('two P&Ls and one Balance Sheet on one date: nothing merges, all three say why', () => {
    const out = pairIntakeFiles([pl('p1'), pl('p2'), bs()])
    expect(out).toHaveLength(3)
    for (const f of out) expect(f.pairNote.why).toBe('ambiguous')
    expect(out[0].pairNote.doubled).toBe('pl')
    expect(statementLines(out[0])[0].text).toBe('Two income statements end Jun 30, 2026 — remove one to combine.')
  })

  it('different dates stay apart, saying the other date — and offer "Combine anyway"', () => {
    const out = pairIntakeFiles([pl(), bsDec()])
    expect(out).toHaveLength(2)
    const p = out.find((f) => f.id === 'pl')
    expect(p.pairNote).toMatchObject({ why: 'date-mismatch', partnerDate: '2025-12-31', partnerId: 'bsd' })
    const line = statementLines(p)[0]
    expect(line.text).toBe('Its Balance Sheet is for Dec 31, 2025, so we kept them apart.')
    expect(line.action).toMatchObject({ kind: 'combine', label: 'Combine anyway', partnerId: 'bsd' })
  })

  it('"Combine anyway" (a manual pair) forces the merge', () => {
    const out = pairIntakeFiles([pl(), bsDec()], [{ plId: 'bsd', bsId: 'pl' }])
    expect(out).toHaveLength(1)
    expect(out[0].metadata.statement.partial).toBe('full')
  })

  it('a same-date pair that does NOT tie is never combined — even when the person clicks Combine', () => {
    for (const manual of [[], [{ plId: 'pl', bsId: 'bso' }]]) {
      const out = pairIntakeFiles([pl(), bsOff()], manual)
      expect(out.map((f) => f.id)).toEqual(['pl', 'bso'])
      expect(out.some((f) => (f.rows || []).some((r) => r.acct === 399))).toBe(false)
      expect(out[0].pairNote).toMatchObject({ why: 'no-tie', partnerId: 'bso' })
      expect(out[0].pairNote.gap).toBeCloseTo(977876.3, 2)
      const line = statementLines(out[0]).find((l) => l.key === 'pair')
      expect(line.text).toBe(
        'This and Holy Family Balance Sheet 6-30-26.xlsx are $977,876.30 apart, so they can’t be combined — check both are for the same company, period and accounting basis.',
      )
      expect(line.action).toBeNull()
    }
  })

  it('a role the person confirmed differently on each half keeps them apart', () => {
    const out = pairIntakeFiles([
      pl('pl', { role: 'cy', roleConfirmed: true }),
      bs('bs', { role: 'py', roleConfirmed: true }),
    ])
    expect(out).toHaveLength(2)
  })

  it('a plain trial balance passes through untouched', () => {
    const tb = { id: 't', status: 'ready', rows: [{ acct: 1010, desc: 'Cash', total: 1 }], metadata: {} }
    expect(pairIntakeFiles([tb])).toEqual([tb])
  })
})

describe('A40-3 — actions on a merged entry', () => {
  it('removing it removes only the halves added this session, and never deletes on the server', () => {
    const raw = [pl('pl', { persisted: true, importId: 'imp1' }), bs()]
    const derived = pairIntakeFiles(raw, COMBINE)
    const r = removeIntakeEntry(raw, [{ plId: 'pl', bsId: 'bs' }], derived, derived[0].id)
    expect(r.rawFiles.map((f) => f.id)).toEqual(['pl'])
    expect(r.manualPairs).toEqual([])
    expect(r.deleteImport).toBeNull()
  })

  it('removing a saved plain file still deletes its import', () => {
    const tb = { id: 't', status: 'ready', persisted: true, importId: 'imp9', rows: [], metadata: {} }
    expect(removeIntakeEntry([tb], [], [tb], 't').deleteImport).toBe(tb)
  })

  it('a role set on the merged entry is set on both halves', () => {
    const raw = [pl(), bs()]
    const derived = pairIntakeFiles(raw, COMBINE)
    const next = setRoleInRaw(raw, derived, derived[0].id, 'py')
    expect(next.map((f) => [f.role, f.roleConfirmed])).toEqual([
      ['py', true],
      ['py', true],
    ])
    expect(memberIdsOf(derived, derived[0].id)).toEqual(['pl', 'bs'])
  })

  it('re-keying an account finds the half that holds it', () => {
    const raw = [pl(), bs()]
    const derived = pairIntakeFiles(raw, COMBINE)
    expect(memberHolding(raw, derived, derived[0].id, 40100).id).toBe('pl')
    expect(memberHolding(raw, derived, derived[0].id, 10100).id).toBe('bs')
  })
})

describe('the card’s quiet lines', () => {
  it('counts the parser’s notes and KYRO-numbered accounts', () => {
    const f = { status: 'ready', warnings: ['a', 'b'], metadata: { statement: { synthesized: [{ acct: 41234, name: 'Tuition', section: 'revenue' }, { acct: 120, name: 'Cash', section: 'asset' }] } } }
    expect(notesSummary(f)).toBe('2 notes')
    expect(numberedSummary(f)).toBe('1 account had no number, so KYRO numbered it.')
    expect(notesSummary({ warnings: [] })).toBeNull()
  })

  it('"Read with your columns · Change" only while this tab still has the bytes', () => {
    const base = { status: 'ready', metadata: { layout: { source: 'picked' } } }
    expect(statementLines({ ...base, bytes: new ArrayBuffer(1) }).find((l) => l.key === 'layout')).toMatchObject({
      text: 'Read with your columns',
      action: { kind: 'columns', label: 'Change' },
    })
    expect(statementLines(base).find((l) => l.key === 'layout').action).toBeNull()
    expect(
      statementLines({ status: 'ready', metadata: { layout: { source: 'remembered' } } }).find((l) => l.key === 'layout').text,
    ).toBe('Read with your saved columns')
  })
})

describe('a workbook with more statements than one picture', () => {
  const WARN = 'This workbook has 3 statements: we used "P&L FY26" + "Balance Sheet". Use Add years for the others ("P&L Jan 2026").'
  const f = {
    status: 'ready',
    warnings: [WARN, 'Another note'],
    metadata: {
      statement: {
        partial: 'full',
        workbook: { code: 'other-statement-sheets', statements: 3, used: ['P&L FY26', 'Balance Sheet'], unused: ['P&L Jan 2026'] },
      },
    },
  }

  it('says which sheets KYRO used, in plain sight, with the way to the others', () => {
    const line = statementLines(f).find((l) => l.key === 'workbook')
    expect(line.text).toBe(
      'This workbook has 3 statements: we used “P&L FY26” + “Balance Sheet”. Use Add years for the others (“P&L Jan 2026”).',
    )
    expect(line.action).toEqual({ kind: 'addYears', label: 'Open Add years' })
  })

  it('…and does not repeat it under "N notes"', () => {
    expect(visibleWarnings(f)).toEqual(['Another note'])
    expect(notesSummary(f)).toBe('1 note')
  })

  it('replaces the half line when only half could be used; keyed on the object (no code on older saves)', () => {
    const half = {
      status: 'ready',
      warnings: [],
      metadata: { statement: { partial: 'pl', workbook: { statements: 2, used: ['P&L Jan 2026'], unused: ['P&L FY26'] } } },
    }
    const keys = statementLines(half).map((l) => l.key)
    expect(keys).toContain('workbook')
    expect(keys).not.toContain('half')
    expect(workbookNote({ metadata: { statement: {} } })).toBeNull()
  })
})
