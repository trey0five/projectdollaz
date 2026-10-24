// KYRO's import_trial_balance tool executes AUTONOMOUSLY (then offers Undo). A
// QuickBooks income-statement export is only HALF a trial balance; importing it
// as the active current-year TB overwrote a real one in a live test with no
// warning. Two seams must agree, and this spec pins both:
//   1. the attachment DIGEST (AssistantFilesService.prepare) marks the file
//      PARTIAL STATEMENT with the user-facing notice and tells the model not to
//      import on its own;
//   2. partialStatementNotice() — the same text buildImportProposal throws
//      unless importPartial: true — is null for a full TB and set for a half.
import { describe, expect, it } from 'vitest'
import { AssistantFilesService, CARRIED_NOTE, partialStatementNotice } from './assistant-files.service.js'
import { AssistantService } from './assistant.service.js'
import { Redactor } from './redaction.js'

const config = { get: () => true } as unknown as ConstructorParameters<typeof AssistantFilesService>[0]
const svc = (): AssistantFilesService => new AssistantFilesService(config)

const csvAttachment = (name: string, lines: string[]) => ({
  name,
  kind: 'csv' as const,
  mimeType: 'text/csv',
  size: 0,
  dataBase64: Buffer.from(lines.join('\r\n'), 'utf8').toString('base64'),
})

/** A Statement of Activity export (income statement only), 9 numbered accounts. */
const SOA = csvAttachment('Statement of Activity 6-30-26.csv', [
  'Sample School',
  'Statement of Activity',
  'July 2025 - June 2026',
  '',
  'Acct,Desc,Actual',
  ',Income,',
  '40000,Tuition,500000',
  '40010,Fees,20000',
  '40020,Donations,15000',
  '40030,Interest,1000',
  ',Total Income,536000',
  ',Expenses,',
  '60100,Salaries,300000',
  '60200,Benefits,60000',
  '60300,Supplies,25000',
  '60400,Utilities,12000',
  '60500,Insurance,8000',
  ',Total Expenses,405000',
  ',Net Income,131000',
])

/** A plain trial balance — the autonomous import must keep working unchanged. */
const TB = csvAttachment('TB_CurrentYear_FY26.csv', [
  'Sample School — Current Year Trial Balance',
  'Fiscal Year FY26 — As of June 30, 2026',
  '',
  'Number,Description,Debit,Credit,Total',
  '100,Cash,500000,,500000',
  '120,Receivable,30000,,30000',
  '200,Payable,,20000,-20000',
  '300,Net assets,,374000,-374000',
  '401,Tuition,,500000,-500000',
  '402,Fees,,20000,-20000',
  '500,Salaries,300000,,300000',
  '510,Benefits,60000,,60000',
  '600,Supplies,24000,,24000',
])

describe('partialStatementNotice', () => {
  it('is null for a plain trial balance and for a merged P&L + BS pair', () => {
    expect(partialStatementNotice(undefined)).toBeNull()
    expect(partialStatementNotice({ sourceName: 'tb.xlsx', rowCount: 9 })).toBeNull()
    expect(
      partialStatementNotice({
        sourceName: 'qbo.xlsx',
        rowCount: 20,
        statement: { type: 'pl', title: 'Profit and Loss + Balance Sheet', partial: 'full', synthesized: [] },
      }),
    ).toBeNull()
  })

  it('names the missing half for an income statement and for a balance sheet', () => {
    const pl = partialStatementNotice({
      sourceName: 'soa.csv',
      rowCount: 9,
      statement: { type: 'pl', title: 'Statement of Activity', partial: 'pl', synthesized: [] },
    })
    expect(pl).toMatch(/^This is an income statement only — it has no balance-sheet accounts\./)
    expect(pl).toMatch(/Statement of Financial Position empty/)
    // D20: the merge only happens when both files ride ONE message, so the copy says so.
    expect(pl).toMatch(/Attach the Balance Sheet export together with this one and I’ll merge them, or tell me to import the income half anyway\./)
    expect(pl).not.toMatch(/Add the Balance Sheet export and I’ll merge them/)
    const bs = partialStatementNotice({
      sourceName: 'bs.csv',
      rowCount: 9,
      statement: { type: 'bs', title: 'Balance Sheet', partial: 'bs', synthesized: [] },
    })
    expect(bs).toMatch(/^This is a balance sheet only — it has no income or expense accounts\./)
    expect(bs).toMatch(/Statement of Activities empty/)
    expect(bs).toMatch(/Attach the Profit and Loss \/ Statement of Activity export together with this one and I’ll merge them, or tell me to import the balance-sheet half anyway\./)
  })
})

describe('AssistantFilesService.prepare — the digest for a partial statement', () => {
  it('parses the Statement of Activity as a candidate but marks it PARTIAL STATEMENT with the notice', async () => {
    const prep = await svc().prepare([SOA], new Redactor(false))
    expect(prep.importCandidates).toHaveLength(1)
    const [cand] = prep.importCandidates
    expect(cand!.metadata?.statement?.partial).toBe('pl')
    const parsed = prep.parsed.get(cand!.attachmentId)!
    expect(parsed.isTrialBalanceCandidate).toBe(true)
    expect(parsed.rows.find((r) => r.acct === 40000)?.total).toBe(-500000) // signed like a TB
    expect(partialStatementNotice(parsed.metadata)).not.toBeNull()

    const digest = prep.digests[0]!
    expect(digest).toMatch(/quickbooksStatement: Statement of Activity \(income statement only\)/)
    expect(digest).toMatch(/looksLikeTrialBalance: yes/)
    expect(digest).toMatch(/PARTIAL STATEMENT — do NOT import this on your own/)
    expect(digest).toMatch(/This is an income statement only — it has no balance-sheet accounts\./)
    expect(digest).toMatch(new RegExp(`attachmentId "${cand!.attachmentId}" and importPartial: true`))
    // The unconditional "If the user wants to import this, call …" line is NOT printed for a half.
    expect(digest).not.toMatch(/If the user wants to import this, call propose_import_trial_balance/)
  })

  it('a plain trial balance keeps the existing autonomous-import digest, no notice', async () => {
    const prep = await svc().prepare([TB], new Redactor(false))
    expect(prep.importCandidates).toHaveLength(1)
    const parsed = prep.parsed.get(prep.importCandidates[0]!.attachmentId)!
    expect(parsed.metadata?.statement).toBeUndefined()
    expect(partialStatementNotice(parsed.metadata)).toBeNull()
    const digest = prep.digests[0]!
    expect(digest).toMatch(/If the user wants to import this, call propose_import_trial_balance/)
    expect(digest).not.toMatch(/PARTIAL STATEMENT/)
    expect(digest).not.toMatch(/quickbooksStatement/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// D20 — same-turn pairing. A P&L half and a Balance Sheet half attached in ONE
// message, ending on the same date, merge into ONE full trial balance under
// `pair:<plId>+<bsId>`. The halves stay listed and gated; the merged candidate
// is a full TB (no importPartial needed). Never guesses: two P&Ls for one date,
// or mismatched dates, pair nothing.
// ─────────────────────────────────────────────────────────────────────────────

/** A sectioned QuickBooks Balance Sheet export (CSV) as of June 30, 2026. Net
 *  Income 131000 ties it to SOA; `offBy` shifts Checking AND Net Income so the
 *  sheet still ties on its own but no longer matches the P&L. */
const balanceSheet = (name: string, opts: { asOf?: string; offBy?: number } = {}) => {
  const off = opts.offBy ?? 0
  const checking = 300000 + off
  const netIncome = 131000 + off
  return csvAttachment(name, [
    'Sample School',
    'Balance Sheet',
    `As of ${opts.asOf ?? 'June 30, 2026'}`,
    '',
    // QuickBooks' own Balance Sheet export shape: the account number rides in
    // the label ("10100 Checking"), one Total column.
    ',Total',
    'ASSETS,',
    '   Current Assets,',
    `      10100 Checking,${checking}`,
    '      10200 Savings,100000',
    '      12000 Accounts Receivable,40000',
    '      13000 Prepaid Expenses,5000',
    `   Total Current Assets,${445000 + off}`,
    '   Fixed Assets,',
    '      15000 Buildings,400000',
    '      15100 Accumulated Depreciation,-100000',
    '   Total Fixed Assets,300000',
    `TOTAL ASSETS,${745000 + off}`,
    'LIABILITIES AND EQUITY,',
    '   Liabilities,',
    '      20000 Accounts Payable,30000',
    '      21000 Deferred Tuition,120000',
    '   Total Liabilities,150000',
    '   Equity,',
    '      30000 Net Assets Without Donor Restriction,464000',
    `      Net Income,${netIncome}`,
    `   Total Equity,${464000 + netIncome}`,
    `TOTAL LIABILITIES AND EQUITY,${745000 + off}`,
  ])
}

/** The SOA with a different period (ends Dec 31, 2025). */
const SOA_DEC = csvAttachment(
  'Statement of Activity 12-31-25.csv',
  Buffer.from(SOA.dataBase64, 'base64')
    .toString('utf8')
    .split('\r\n')
    .map((l) => (l === 'July 2025 - June 2026' ? 'January 2025 - December 2025' : l)),
)

/** buildImportProposal is private and needs no injected dependency — reach it on a bare prototype. */
const proposer = () =>
  Object.create(AssistantService.prototype) as {
    buildImportProposal: (args: Record<string, unknown>, ctx: unknown) => { payload: Record<string, unknown>; summary: string }
  }
const ctxOf = (prep: unknown) => ({ schoolId: 's1', periodId: 'p1', userId: 'u1', user: null, role: 'owner', prep })

describe('AssistantFilesService.prepare — same-turn P&L + Balance Sheet pairing', () => {
  it('a P&L and a BS that tie offer a full candidate pair:<pl>+<bs> — combined only if the user chooses', async () => {
    const prep = await svc().prepare([SOA, balanceSheet('Balance Sheet 6-30-26.csv')], new Redactor(false))
    const halves = prep.importCandidates.filter((c) => !c.attachmentId.startsWith('pair:'))
    expect(halves).toHaveLength(2)
    const plId = halves.find((c) => c.metadata?.statement?.partial === 'pl')!.attachmentId
    const bsId = halves.find((c) => c.metadata?.statement?.partial === 'bs')!.attachmentId
    const pairId = `pair:${plId}+${bsId}`

    const pair = prep.importCandidates.find((c) => c.attachmentId === pairId)!
    expect(pair).toBeDefined()
    expect(pair.metadata?.statement?.partial).toBe('full')
    expect(pair.metadata?.statement?.balancePlug ?? null).toBeNull() // they tie
    expect(pair.metadata?.periodEndDate).toBe('2026-06-30')
    expect(pair.sourceName).toBe('Statement of Activity 6-30-26.csv + Balance Sheet 6-30-26.csv')
    expect(partialStatementNotice(pair.metadata)).toBeNull()

    const parsed = prep.parsed.get(pairId)!
    expect(parsed.isTrialBalanceCandidate).toBe(true)
    // P&L leaves + BS leaves (the BS "Net Income" result row is dropped), signed like a TB, tying to 0.
    expect(parsed.rows.find((r) => r.acct === 40000)?.total).toBe(-500000)
    expect(parsed.rows.find((r) => r.acct === 10100)?.total).toBe(300000)
    expect(parsed.rows.find((r) => r.acct === 30000)?.total).toBe(-464000)
    expect(parsed.rows.some((r) => /net income/i.test(r.desc))).toBe(false)
    expect(Math.abs(parsed.rows.reduce((t, r) => t + r.total, 0))).toBeLessThan(0.01)

    const pairDigest = prep.digests.find((d) => d.includes(`attachmentId "${pairId}"`))!
    expect(pairDigest).toContain(
      `"Statement of Activity 6-30-26.csv" + "Balance Sheet 6-30-26.csv" tie, so they can be combined into one full trial balance (P&L + balance sheet) — attachmentId "${pairId}".`,
    )
    expect(pairDigest).toMatch(/ASK whether to combine them/)
    expect(pairDigest).not.toMatch(/Prefer this one/)
    expect(pairDigest).toMatch(/UNTRUSTED/)

    // The halves are still listed AND still gated.
    expect(partialStatementNotice(prep.parsed.get(plId)!.metadata)).not.toBeNull()
    expect(partialStatementNotice(prep.parsed.get(bsId)!.metadata)).not.toBeNull()
  })

  it('the pair imports only with combine: true (the user said yes); each half alone is still refused', async () => {
    const prep = await svc().prepare([SOA, balanceSheet('Balance Sheet 6-30-26.csv')], new Redactor(false))
    const pair = prep.importCandidates.find((c) => c.attachmentId.startsWith('pair:'))!
    expect(() => proposer().buildImportProposal({ attachmentId: pair.attachmentId }, ctxOf(prep))).toThrow(
      /stay separate unless the user chooses/,
    )
    const p = proposer().buildImportProposal({ attachmentId: pair.attachmentId, combine: true }, ctxOf(prep))
    expect(p.payload.periodEndDate).toBe('2026-06-30')
    expect((p.payload.metadata as { statement: { partial: string } }).statement.partial).toBe('full')
    expect(p.summary).not.toMatch(/income statement only|balance sheet only/)

    const plId = prep.importCandidates.find((c) => c.metadata?.statement?.partial === 'pl')!.attachmentId
    expect(() => proposer().buildImportProposal({ attachmentId: plId }, ctxOf(prep))).toThrow(
      /This is an income statement only/,
    )
  })

  // Customer upload 2026-10-24: a P&L and BS $977,876.30 apart were combined
  // with a balancing line that hid the gap. Halves that don't tie never combine.
  it('a pair that does not tie is NOT combined — no pair, no acct-399 line, the digest says how far apart', async () => {
    const prep = await svc().prepare(
      [SOA, balanceSheet('Balance Sheet 6-30-26.csv', { offBy: 1234.56 })],
      new Redactor(false),
    )
    expect(prep.importCandidates.some((c) => c.attachmentId.startsWith('pair:'))).toBe(false)
    expect([...prep.parsed.values()].some((p) => p.rows.some((r) => r.acct === 399))).toBe(false)
    const digest = prep.digests.find((d) => d.includes('do NOT tie'))!
    expect(digest).toMatch(/are 1234\.56 apart/)
    expect(digest).toMatch(/Do not combine or import them on your own/)
  })

  it('a P&L alone: no pair candidate, still gated (the gate is unchanged)', async () => {
    const prep = await svc().prepare([SOA], new Redactor(false))
    expect(prep.importCandidates.some((c) => c.attachmentId.startsWith('pair:'))).toBe(false)
    expect(prep.digests.some((d) => d.includes('Prefer this one'))).toBe(false)
    const id = prep.importCandidates[0]!.attachmentId
    expect(() => proposer().buildImportProposal({ attachmentId: id }, ctxOf(prep))).toThrow(/importPartial: true/)
    // …and only an explicit importPartial lets the half through.
    const p = proposer().buildImportProposal({ attachmentId: id, importPartial: true }, ctxOf(prep))
    expect(p.summary).toMatch(/income statement only/)
  })

  it('never guesses: two P&Ls for one date + one BS → no pair; mismatched dates → no pair', async () => {
    const twoPl = await svc().prepare(
      [SOA, { ...SOA, name: 'Statement of Activity copy.csv' }, balanceSheet('Balance Sheet 6-30-26.csv')],
      new Redactor(false),
    )
    expect(twoPl.importCandidates.some((c) => c.attachmentId.startsWith('pair:'))).toBe(false)

    const mismatch = await svc().prepare([SOA_DEC, balanceSheet('Balance Sheet 6-30-26.csv')], new Redactor(false))
    expect(mismatch.importCandidates.find((c) => c.metadata?.statement?.partial === 'pl')?.metadata?.periodEndDate).toBe(
      '2025-12-31',
    )
    expect(mismatch.importCandidates.some((c) => c.attachmentId.startsWith('pair:'))).toBe(false)
  })

  it('a plain trial balance next to a half never pairs with it', async () => {
    const prep = await svc().prepare([TB, balanceSheet('Balance Sheet 6-30-26.csv')], new Redactor(false))
    expect(prep.importCandidates.some((c) => c.attachmentId.startsWith('pair:'))).toBe(false)
  })
})

// Prod 2026-10-24: files only reached the server with the message they were
// attached to, so the user's answer to KYRO's follow-up question arrived with no
// file and KYRO asked them for an "attachment ID". The client now re-sends
// recent files with carried: true; prepare() labels them and pairs across turns.
describe('AssistantFilesService.prepare — files carried from an earlier message', () => {
  it('a P&L sent earlier (carried) + a BS sent now still merge into one pair', async () => {
    const prep = await svc().prepare(
      [{ ...SOA, carried: true }, balanceSheet('Balance Sheet 6-30-26.csv')],
      new Redactor(false),
    )
    expect(prep.importCandidates.some((c) => c.attachmentId.startsWith('pair:'))).toBe(true)
  })

  it('labels only the carried file’s digest, outside the UNTRUSTED markers', async () => {
    const prep = await svc().prepare(
      [{ ...SOA, carried: true }, balanceSheet('Balance Sheet 6-30-26.csv')],
      new Redactor(false),
    )
    const soa = prep.digests.find((d) => d.includes('Statement of Activity 6-30-26.csv') && !d.includes('Combined'))!
    const bs = prep.digests.find((d) => d.includes('name="Balance Sheet 6-30-26.csv"'))!
    expect(soa.startsWith(`${CARRIED_NOTE}\n<<<ATTACHMENT`)).toBe(true)
    expect(bs).not.toContain(CARRIED_NOTE)
  })

  it('no carried flag → digests unchanged (no note)', async () => {
    const prep = await svc().prepare([TB], new Redactor(false))
    expect(prep.digests.join('\n')).not.toContain(CARRIED_NOTE)
  })
})
