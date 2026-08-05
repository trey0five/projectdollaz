// ─────────────────────────────────────────────────────────────────────────────
// SCORE PROVENANCE IS READ NOW. Hand-off "O7": scoreProvenance / rubricScoredAt /
// rubricScoredByUserId were written on every score change since Phase A and read
// by NOTHING — grep found exactly one occurrence outside the schema: the write.
// An honesty ledger shown to nobody. The DECIDED policy keeps owner+accountant
// scoring and makes accountability visibility-based: the chip, plus the
// ACC-UNSUPPORTED-SCORE briefing warning.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const service = readFileSync(HERE + 'accreditation.service.ts', 'utf8')
const page = readFileSync(
  new URL('../../../web/src/pages/AccreditationPage.jsx', import.meta.url),
  'utf8',
)

describe('the ledger has a reader', () => {
  it('StandardPublic carries the provenance trio', () => {
    expect(service).toMatch(/scoreProvenance: string/)
    expect(service).toMatch(/rubricScoredAt: string \| null/)
    expect(service).toMatch(/rubricScoredBy: string \| null/)
  })

  it('the scorer name is a JOIN, so SetNull deletion drops the name and keeps the score', () => {
    expect(service).toMatch(/rubricScoredByUser: \{ select: \{ firstName: true, lastName: true \} \}/)
  })

  it('an unscored standard exposes NO provenance — a stamp without a score is noise', () => {
    expect(service).toMatch(/rubricScoredAt: rubricScore != null \? toIsoDate\(row\.rubricScoredAt/)
  })

  it('the page renders the chip beside the pips', () => {
    expect(page).toMatch(/standard\.rubricScore != null && standard\.rubricScoredAt \?/)
    expect(page).toMatch(/'Self-scored'/)
    expect(page).toMatch(/standard\.rubricScoredBy \? ` · \$\{standard\.rubricScoredBy\}` : ''/)
  })
})

describe('the DECIDED policy is intact — visibility, not gatekeeping', () => {
  it('the score write stays owner+accountant (no role split, no evidence-at-write)', () => {
    const controller = readFileSync(HERE + 'standards.controller.ts', 'utf8')
    // The PATCH route the rubric rides is unchanged.
    expect(controller).toMatch(/@Patch\(':standardId'\)\s*\n\s*@Roles\('owner', 'accountant'\)/)
    // And no write-time evidence gate crept in: the unsupported-score story stays
    // a briefing FINDING, never a 400 that makes the score unrecordable.
    expect(service).not.toMatch(/evidenceCount === 0[\s\S]{0,120}BadRequest/)
  })

  it('the provenance stamp still moves ONLY when the score changes', () => {
    // Two halves: the changed-detection line, and the stamp gated on it.
    expect(service).toMatch(/const rubricChanged = \(existing\.rubricScore \?\? null\) !== nextRubricScore/)
    expect(service).toMatch(/rubricChanged[\s\S]{0,400}scoreProvenance: 'self',/)
  })
})
