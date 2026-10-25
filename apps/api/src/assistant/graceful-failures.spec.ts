// #50 — KYRO handles the things that go wrong in plain words.
//   1. A spreadsheet that isn't financial (a roster, test scores, a board list)
//      dropped into chat gets a hand-off to the right module — headers only,
//      never a cell (a roster's cells are student names).
//   2. A failed answer tells the person the cause they can act on, not
//      "I hit an error".
import { describe, expect, it } from 'vitest'
import { AssistantFilesService } from './assistant-files.service.js'
import { plainStreamFailure } from './assistant.service.js'
import { Redactor } from './redaction.js'

const config = { get: () => true } as unknown as ConstructorParameters<typeof AssistantFilesService>[0]
const svc = () => new AssistantFilesService(config)
const csv = (name: string, text: string) => ({
  name,
  kind: 'csv' as const,
  mimeType: 'text/csv',
  size: 0,
  dataBase64: Buffer.from(text, 'utf8').toString('base64'),
})

describe('a non-financial spreadsheet in chat is handed off, not misread', () => {
  it('a student roster → Enrollment, with no student name in the digest', async () => {
    const prep = await svc().prepare(
      [csv('roster.csv', 'Student Name,Gr,Student ID,Homeroom\n"Zebrowski, Quentin",9th,S-1,Lee\n"Oyelaran, Bisi",Kindergarten,S-2,Ng\nCy Fox,Grade 12,,Lee\n')],
      new Redactor(true),
    )
    const d = prep.digests.join('\n')
    expect(d).toMatch(/student roster — not financial/)
    expect(d).toMatch(/Enrollment → Add data → "Upload a roster file"/)
    expect(d).toMatch(/navigate_to_page\("enrollment"\)/)
    expect(d).toMatch(/“Student Name”, “Gr”, “Student ID”, “Homeroom”/)
    expect(d).not.toMatch(/Zebrowski|Oyelaran|Quentin|Bisi/)
    expect(prep.importCandidates).toEqual([])
    expect(prep.rawFiles.size).toBe(1) // still filable to Knowledge
  })

  it('a test-results file → Academics; a board roster → Governance', async () => {
    const scores = await svc().prepare([csv('ACT 2026.csv', 'Student ID,Grade,Composite,English,Math,Reading,Science\nS-1,11,24,23,24,25,23\n')], new Redactor(true))
    expect(scores.digests.join('\n')).toMatch(/assessment results — not financial[\s\S]*Academics → Add data/)
    const board = await svc().prepare([csv('board.csv', 'Trustee,Position,Term Expires,Email\nAnn Smith,Chair,2027,a@x.org\n')], new Redactor(true))
    expect(board.digests.join('\n')).toMatch(/board roster \/ people list — not financial[\s\S]*Governance → Add data → "Upload a board roster"/)
    const committees = await svc().prepare([csv('committees.csv', 'Committee,Member,Role\nFinance,Ann Smith,Chair\n')], new Redactor(true))
    expect(committees.digests.join('\n')).toMatch(/committee list — not financial/)
  })

  it('a trial balance is NOT sniffed away (money words win)', async () => {
    const prep = await svc().prepare(
      [csv('TB.csv', 'Number,Description,Debit,Credit,Total\n100,Cash,500000,,500000\n300,Net assets,,500000,-500000\n')],
      new Redactor(true),
    )
    expect(prep.digests.join('\n')).not.toMatch(/not financial/)
  })
})

describe('plainStreamFailure', () => {
  it('names the cause the person can act on', () => {
    expect(plainStreamFailure('assistant LLM error 402: insufficient credits')).toMatch(/out of credits/)
    expect(plainStreamFailure('The model returned the following errors: messages: text content blocks must contain non-whitespace text')).toMatch(/formatting problem on our side/)
    expect(plainStreamFailure('ValidationException: input is too long for requested model')).toMatch(/too long/)
    expect(plainStreamFailure('fetch failed: ETIMEDOUT')).toMatch(/didn’t answer in time/)
    expect(plainStreamFailure('assistant LLM error 503 Service Unavailable')).toMatch(/didn’t answer in time/)
    expect(plainStreamFailure('TypeError: x is not a function')).toMatch(/Try again, or start a new chat/)
  })
})
