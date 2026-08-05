// ─────────────────────────────────────────────────────────────────────────────
// AIC PHASE K — the last two visible holes, closed.
//
// The plan for this phase claimed both rules' "`evaluate` bodies exist and are
// correct" and that closing the holes was a matter of lighting their signals.
// THAT WAS FALSE: both bodies were `return []` stubs, and SAFE-ENV-GAP's rationale
// template named placeholders (a "cleared" count against a staff count) that no
// evidence row could ever resolve — it described the PASSING state, which is not
// what a finding is. Phase K wrote both rules.
//
// What is pinned here is what the phase is FOR: two rules that fire, two holes
// that close, one hole list that shrinks, and — above everything — a clearance
// register whose findings can never name a person.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { TWIN_RULES_BY_ID, TWIN_THRESHOLDS, VISIBLE_HOLE_RULE_IDS } from '@finrep/compliance'
import { COVERAGE_REGISTRY } from '../assistant/coverage-topics.js'
import {
  EARLY_WARNING_BRIEFABLE_RULE_IDS,
  EARLY_WARNING_SUPPRESSED,
} from '../analytics/briefing.service.js'
import { CLEARANCE_KINDS, CLEARANCE_IMPORT_MAX_ROWS } from './dto/clearance.dto.js'
import { PD_CATEGORIES } from './dto/professional-development.dto.js'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const read = (rel: string): string => readFileSync(HERE + rel, 'utf8')

describe('the two holes are closed, and the two that remain are the RIGHT two', () => {
  it('VISIBLE_HOLE_RULE_IDS is down to the genuinely uncollected', () => {
    expect([...VISIBLE_HOLE_RULE_IDS]).toEqual(['CURR-DOC-AGING', 'ACAD-GROWTH-FLAT'])
  })

  it('neither closed rule still advertises an unlock', () => {
    // `unlock` copy offers to build a register. Leaving it would have the product
    // offer to build something it ships.
    for (const id of ['HR-PD-LOW', 'SAFE-ENV-GAP'] as const) {
      expect(TWIN_RULES_BY_ID.get(id)?.unlock, id).toBeNull()
    }
  })

  it('neither rule is a stub any more', () => {
    // The precise defect the plan hid: `evaluate() { return [] }` on both.
    for (const id of ['HR-PD-LOW', 'SAFE-ENV-GAP'] as const) {
      const body = String(TWIN_RULES_BY_ID.get(id)?.evaluate)
      expect(body.length, id).toBeGreaterThan(200)
      expect(body, id).toContain('TwinCannotEvaluate')
    }
  })

  it('SAFE-ENV-GAP’s template resolves against evidence that EXISTS', () => {
    // It named a cleared-count and a staff-count; the rule emits neither. A
    // template naming a key its evidence lacks throws TwinTemplateError at render.
    const tpl = TWIN_RULES_BY_ID.get('SAFE-ENV-GAP')?.rationaleTemplate ?? ''
    expect(tpl).toContain('{{lapsedCount}}')
    expect(tpl).toContain('{{trackedCount}}')
    expect(tpl).not.toContain('clearedCount')
  })
})

describe('the safeguarding contract', () => {
  const clearanceRule = String(TWIN_RULES_BY_ID.get('SAFE-ENV-GAP')?.evaluate)

  it('the rule emits COUNTS and dates only', () => {
    // IDENTITY tokens only. 'verified' is deliberately NOT on this list: the
    // consequence sentence reads "verified against the file rather than
    // assurance", which is English about a review, not a column.
    for (const banned of ['personId', 'personName', 'name', 'kind']) {
      expect(clearanceRule, banned).not.toMatch(new RegExp(`\\b${banned}\\b`))
    }
  })

  it('it states the fact and does NOT editorialise about children', () => {
    // A lapsed certificate is a paperwork state, not an allegation. Speculating
    // about risk would be unfounded AND the fastest way to make a head of school
    // stop reading these findings.
    const def = TWIN_RULES_BY_ID.get('SAFE-ENV-GAP')
    const prose = `${def?.rationaleTemplate ?? ''} ${String(clearanceRule)}`
    for (const word of ['risk to', 'danger', 'unsafe', 'predator', 'harm']) {
      expect(prose.toLowerCase(), word).not.toContain(word)
    }
  })

  it('the register denies a VIEWER outright, but exposes counts to every role', () => {
    const ctrl = read('clearances.controller.ts')
    // The list route names only owner/accountant…
    expect(ctrl).toMatch(/@Get\(\)\s*\n\s*@Roles\('owner', 'accountant'\)/)
    // …and /summary is the one route a viewer may call.
    expect(ctrl).toMatch(/@Get\('summary'\)\s*\n\s*@Roles\('owner', 'accountant', 'viewer'\)/)
  })

  it('/summary is declared BEFORE /:id on both new controllers — Nest matches in order', () => {
    for (const f of ['clearances.controller.ts', 'professional-development.controller.ts']) {
      const src = read(f)
      const summary = src.indexOf("@Get('summary')")
      const byId = src.search(/@Get\(':(?:clearanceId|pdId)'\)/)
      expect(summary, f).toBeGreaterThan(-1)
      expect(byId, f).toBeGreaterThan(-1)
      expect(summary, f).toBeLessThan(byId)
    }
  })

  it('the import audit row carries counts, never the unmatched names', () => {
    const svc = read('clearances.service.ts')
    const start = svc.indexOf("action: 'hr.clearance.imported'")
    // Bounded to the audit call itself: the RETURN statement below it does hand
    // the names back to the uploader, which is the point — they are shown to the
    // person who uploaded the file and written down nowhere.
    const block = svc.slice(start, svc.indexOf('})', start))
    expect(block).toMatch(/unmatched: unmatched\.size/)
    expect(block).not.toMatch(/unmatched: \[\.\.\./)
  })
})

describe('PD is participation, never spend', () => {
  it('there is NO cost field anywhere in the register', () => {
    // A field that exists is a field something eventually reads. The hole's own
    // copy: "one expensive conference for one person would score as healthy."
    //
    // Matched as a DECLARATION, not as a word: both files explain in prose WHY
    // there is no cost column, and banning the English would forbid the comment
    // that records the decision.
    const FIELD = /(?:^|\s)(?:cost|spend|amount|budget|dollars?)\s*[?!]?\s*[:=]/im
    for (const f of ['dto/professional-development.dto.ts', 'professional-development.service.ts']) {
      expect(read(f), f).not.toMatch(FIELD)
    }
  })

  it('participation counts DISTINCT people, not records', () => {
    const svc = read('professional-development.service.ts')
    expect(svc).toMatch(/new Set\(rows\.map\(\(r\) => r\.personId\)\)\.size/)
  })

  it('no staff on file ⇒ NO rate, rather than a zero', () => {
    // A share of nobody is not zero, and a zero would read as "nobody is being
    // developed" for a school that has simply not entered its staff yet.
    expect(read('professional-development.service.ts')).toMatch(
      /participationRate: staffCount > 0 \? participants \/ staffCount : null/,
    )
  })

  it('the rule refuses rather than describing one teacher as a programme', () => {
    const body = String(TWIN_RULES_BY_ID.get('HR-PD-LOW')?.evaluate)
    expect(body).toContain('HR_PD_MIN_STAFF')
    expect(TWIN_THRESHOLDS.HR_PD_MIN_STAFF.value).toBeGreaterThan(1)
  })
})

describe('Penny answers about both, and the vocabularies agree', () => {
  it('neither topic is a refusal any more', () => {
    for (const key of ['professional_development', 'safe_environment_clearances'] as const) {
      expect(COVERAGE_REGISTRY[key].collected, key).toBe(true)
    }
  })

  it('both rules are CONSCIOUSLY briefable, and neither is both', () => {
    for (const id of ['SAFE-ENV-GAP', 'HR-PD-LOW']) {
      const briefable = EARLY_WARNING_BRIEFABLE_RULE_IDS.includes(id)
      const suppressed = EARLY_WARNING_SUPPRESSED.has(id)
      expect(briefable !== suppressed, id).toBe(true)
    }
  })

  it('the web display vocabulary is a hard copy of the DTO arrays', () => {
    // Drift here is a 400 at submit, which is why the API side is asserted from
    // its own source rather than trusted.
    const meta = readFileSync(
      new URL('../../../web/src/components/hr/clearanceMeta.js', import.meta.url),
      'utf8',
    )
    for (const k of CLEARANCE_KINDS) expect(meta, k).toContain(`'${k}'`)
    for (const c of PD_CATEGORIES) expect(meta, c).toContain(`'${c}'`)
  })

  it('the import ceiling is stated to the user, not silently enforced', () => {
    // The NUMBER is declared once, in the DTO; the service interpolates the
    // symbol into the sentence the user reads, so the two cannot disagree.
    expect(read('dto/clearance.dto.ts')).toContain(String(CLEARANCE_IMPORT_MAX_ROWS))
    expect(read('clearances.service.ts')).toMatch(
      /above the \$\{CLEARANCE_IMPORT_MAX_ROWS\}-row limit/,
    )
  })

  it('the register’s expiring-soon window matches the threshold the rule quotes', () => {
    // Two constants that mean "soon" would eventually disagree, and the rule
    // prints its own in the finding's evidence.
    const svc = read('clearances.service.ts')
    expect(svc).toMatch(
      new RegExp(`EXPIRING_SOON_DAYS = ${TWIN_THRESHOLDS.SAFE_ENV_EXPIRING_WINDOW_DAYS.value}\\b`),
    )
  })
})
