import { describe, it, expect } from 'vitest'
import { Redactor, redactToolResult, makeStreamRestorer } from './redaction.js'

describe('Redactor', () => {
  it('tokenizes a value stably and restores it', () => {
    const r = new Redactor(true)
    const t1 = r.token('Jane Doe', 'PARTY')
    const t2 = r.token('Jane Doe', 'PARTY')
    expect(t1).toBe('[[PARTY_1]]')
    expect(t2).toBe(t1) // stable within a request
    expect(r.restore(`${t1} owes $500`)).toBe('Jane Doe owes $500')
  })

  it('gives distinct tokens per distinct value + kind counter', () => {
    const r = new Redactor(true)
    expect(r.token('Acme LLC', 'PARTY')).toBe('[[PARTY_1]]')
    expect(r.token('Beta Inc', 'PARTY')).toBe('[[PARTY_2]]')
    expect(r.token('admin@school.org', 'EMAIL')).toBe('[[EMAIL_1]]')
  })

  it('redactText masks emails and SSNs and swaps known values', () => {
    const r = new Redactor(true)
    r.token('Jane Doe', 'PARTY')
    const out = r.redactText('Jane Doe (jane@x.edu), SSN 123-45-6789, overdue')
    expect(out).toContain('[[PARTY_1]]')
    expect(out).toContain('[[EMAIL_1]]')
    expect(out).toContain('[[SSN]]')
    expect(out).not.toContain('Jane Doe')
    expect(out).not.toContain('jane@x.edu')
    expect(out).not.toContain('123-45-6789')
  })

  it('is a full passthrough when disabled', () => {
    const r = new Redactor(false)
    expect(r.token('Jane Doe', 'PARTY')).toBe('Jane Doe')
    expect(r.redactText('Jane Doe jane@x.edu')).toBe('Jane Doe jane@x.edu')
    expect(r.restore('[[PARTY_1]]')).toBe('[[PARTY_1]]')
    expect(r.active).toBe(false)
  })

  it('passes through empty/nullish without minting tokens', () => {
    const r = new Redactor(true)
    expect(r.token('', 'PARTY')).toBe('')
    expect(r.token(null, 'PARTY')).toBe('')
    expect(r.token(undefined, 'PERSON')).toBe('')
    expect(r.tokenizedCount).toBe(0)
  })
})

describe('redactToolResult', () => {
  it('tokenizes identity fields but leaves amounts + account descriptions', () => {
    const r = new Redactor(true)
    const result = {
      transactions: [{ payee: 'Jane Doe Family', amount: 500, date: '2026-01-01' }],
      parties: [{ party: 'Smith Household', total: 1200, overdue: 300 }],
      history: [{ by: 'Torrey Munroe', value: 0.12, source: 'Imported trial balance' }],
      account: { description: 'Tuition Revenue', total: 2_400_000 },
    }
    const out = redactToolResult(result, r) as typeof result
    expect(out.transactions[0].payee).toBe('[[PARTY_1]]')
    expect(out.transactions[0].amount).toBe(500) // amount untouched
    expect(out.parties[0].party).toBe('[[PARTY_2]]')
    expect(out.history[0].by).toBe('[[PERSON_1]]')
    expect(out.history[0].source).toBe('Imported trial balance') // not an identity key
    expect(out.account.description).toBe('Tuition Revenue') // account desc preserved
    // The final answer restores them for the authenticated caller.
    expect(r.restore('[[PARTY_1]] and [[PERSON_1]]')).toBe('Jane Doe Family and Torrey Munroe')
  })

  it('two-pass: masks a name in a note even when the note key precedes the identity key', () => {
    const r = new Redactor(true)
    const result = { note: 'Payment to Jane Doe is overdue', payee: 'Jane Doe' }
    const out = redactToolResult(result, r) as typeof result
    expect(out.payee).toBe('[[PARTY_1]]')
    expect(out.note).not.toContain('Jane Doe')
    expect(out.note).toContain('[[PARTY_1]]')
  })

  it('tokenizes newly-flagged person keys (responsibleParty/assignee/approver)', () => {
    const r = new Redactor(true)
    const out = redactToolResult(
      { responsibleParty: 'Ann Lee', assignee: 'Bob Roy', approver: 'Cid Poe' },
      r,
    ) as Record<string, string>
    expect(out.responsibleParty).toBe('[[PERSON_1]]')
    expect(out.assignee).toBe('[[PERSON_2]]')
    expect(out.approver).toBe('[[PERSON_3]]')
  })

  it('is a passthrough when disabled', () => {
    const r = new Redactor(false)
    const result = { transactions: [{ payee: 'Jane Doe' }] }
    expect(redactToolResult(result, r)).toEqual(result)
  })
})

describe('Redactor.restore tolerance', () => {
  it('restores a token even with injected whitespace', () => {
    const r = new Redactor(true)
    r.token('Jane Doe', 'PARTY')
    expect(r.restore('[[ PARTY_1 ]]')).toBe('Jane Doe')
    expect(r.restore('[[PARTY_1]]')).toBe('Jane Doe')
  })
})

describe('makeStreamRestorer', () => {
  it('restores a token split across chunk boundaries', () => {
    const r = new Redactor(true)
    r.token('Jane Doe', 'PARTY') // -> [[PARTY_1]]
    let out = ''
    const s = makeStreamRestorer(r, (t) => (out += t))
    // Feed the token in awkward pieces.
    s.push('Balance for [[PAR')
    s.push('TY_1]] is $500')
    s.flush()
    expect(out).toBe('Balance for Jane Doe is $500')
  })

  it('passes chunks straight through when disabled', () => {
    const r = new Redactor(false)
    let out = ''
    const s = makeStreamRestorer(r, (t) => (out += t))
    s.push('[[PARTY_1]] ')
    s.push('hi')
    s.flush()
    expect(out).toBe('[[PARTY_1]] hi')
  })
})
