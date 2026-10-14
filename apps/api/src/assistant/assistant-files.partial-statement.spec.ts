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
import { AssistantFilesService, partialStatementNotice } from './assistant-files.service.js'
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
    expect(pl).toMatch(/Add the Balance Sheet export and I’ll merge them, or tell me to import the income half anyway\./)
    const bs = partialStatementNotice({
      sourceName: 'bs.csv',
      rowCount: 9,
      statement: { type: 'bs', title: 'Balance Sheet', partial: 'bs', synthesized: [] },
    })
    expect(bs).toMatch(/^This is a balance sheet only — it has no income or expense accounts\./)
    expect(bs).toMatch(/Statement of Activities empty/)
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
