import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase F — THE STAFF-PII GUARD. The adult-staff equivalent of
// no-student-access.spec.ts, built the same way and for the same reason.
//
// `StaffEvaluation` is ADULT-STAFF EMPLOYMENT PII. "Four staff evaluations are
// overdue" is a fact about a school. "Maria's evaluation is 240 days overdue" is a
// fact about an employee, and it is materially more sensitive than a maintenance
// ticket — the briefing, Penny and every export render the twin's payload
// VERBATIM, so anything that reaches this directory reaches all of them.
//
// THE RULE IS STRUCTURAL, NOT ADVISORY: the register may name a person to
// owner/accountant on its own endpoint (see apps/api/src/hr/), and NOTHING under
// apps/api/src/twin/ may select an identity column. This spec walks every .ts file
// here and fails the BUILD (nest build compiles .spec.ts) if one does.
//
// The forbidden patterns are ASSEMBLED FROM FRAGMENTS so this file — one of the
// files it walks — is not its own first offender. That is what lets the rule apply
// to EVERY file including the specs, with no exemption list to quietly grow.
//
// ONE DELIBERATE DEVIATION FROM THE PHASE-F SPEC, recorded here rather than in a
// commit message. The spec's §4.2 said the `staffEvaluation` delegate must appear
// in EXACTLY ONE file (twin-signals.service.ts), while its §2.6/§3.1 required
// twin-register.service.ts to publish the register SUMMARY the HR-EVAL-OVERDUE
// rationale renders. Both cannot hold. What actually protects an employee is not
// the number of files that read the table — it is the COLUMNS they select, so this
// guard pins the columns in EVERY file that reads it, and pins the file list to
// exactly those two. That is strictly stronger than the one-file rule it replaces:
// under the original wording a second reader was forbidden but its select was
// unconstrained, and here a third reader still fails and a fourth column fails too.
// ─────────────────────────────────────────────────────────────────────────────

const HERE = fileURLToPath(new URL('.', import.meta.url))

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (entry.endsWith('.ts')) out.push(full)
  }
  return out
}

const FILES = walk(HERE).sort()
const rel = (f: string): string => f.slice(HERE.length)

/** The evaluator's name — the one free-text identity column on the register. */
const EVALUATOR_FIELD = new RegExp(`\\bevalua${'torName'}\\b`)

/** A Prisma `include:`/`select:` that pulls the PERSON relation in. */
const PERSON_RELATION = new RegExp(`\\bper${'son'}\\s*:\\s*\\{`)

/** The Prisma delegate itself. */
const DELEGATE = new RegExp(['pris', 'ma\\s*\\.\\s*staffEv', 'aluation\\b'].join(''))

/** The two files allowed to name it, and the ONLY columns either may select. */
const ALLOWED_READERS = ['twin-register.service.ts', 'twin-signals.service.ts']
const ALLOWED_COLUMNS = ['completedDate', 'dueDate', 'status']

/**
 * Every `select: { … }` block that follows a `staffEvaluation.findMany/findFirst`
 * call in one file, as sorted column lists. Deliberately a regex over source and
 * not a type-level check: a type would be satisfied by a widened select, and the
 * thing being defended is the SQL that actually runs.
 */
function staffSelects(src: string, delegate = 'staffEvaluation'): string[][] {
  const out: string[][] = []
  const re = new RegExp(
    `${delegate}\\s*\\.\\s*(?:findMany|findFirst)\\s*\\(\\{[\\s\\S]*?select:\\s*\\{([^}]*)\\}`,
    'g',
  )
  for (const m of src.matchAll(re)) {
    out.push(
      m[1]
        .split(',')
        .map((p) => p.split(':')[0].trim())
        .filter((p) => p.length > 0 && !p.startsWith('//'))
        .sort(),
    )
  }
  return out
}

describe('twin — no staff PII (AIC Phase F)', () => {
  it('finds at least the files this phase ships', () => {
    // A guard on the guard: a walk that silently returned [] would pass every
    // assertion below while proving nothing at all.
    expect(FILES.length).toBeGreaterThanOrEqual(8)
  })

  it('never names the evaluator, anywhere in the directory', () => {
    // Not even in a comment or a type: a field name that appears here is a field
    // somebody can start selecting tomorrow.
    const offenders = FILES.filter((f) => EVALUATOR_FIELD.test(readFileSync(f, 'utf8')))
    expect(offenders.map(rel)).toEqual([])
  })

  it('never pulls the person relation into a select or an include', () => {
    const offenders = FILES.filter((f) => PERSON_RELATION.test(readFileSync(f, 'utf8')))
    expect(offenders.map(rel)).toEqual([])
  })

  it('reads the register from exactly two files, and no others', () => {
    // PRODUCTION files only: a spec that hand-mocks the delegate reads no database
    // and names no employee, and excluding the specs is what keeps the FIXTURE
    // harnesses honest instead of pushing them into an exemption list. Every
    // production reader is still bound by the column assertion below, which DOES
    // walk the specs.
    const readers = FILES.filter(
      (f) => !f.endsWith('.spec.ts') && DELEGATE.test(readFileSync(f, 'utf8')),
    )
    expect(readers.map(rel).sort()).toEqual(ALLOWED_READERS)
  })

  it('every staffEvaluation select is EXACTLY the three non-identifying columns', () => {
    // The whole guarantee in one assertion. A fourth column — a personId, a cycle
    // label, a note — fails here, in the build, before it can reach a payload.
    const seen: string[][] = []
    for (const f of FILES) {
      for (const cols of staffSelects(readFileSync(f, 'utf8'))) {
        expect(cols, rel(f)).toEqual(ALLOWED_COLUMNS)
        seen.push(cols)
      }
    }
    // …and the regex above actually matched something. A select-block parse that
    // silently found nothing would make the loop vacuous.
    expect(seen.length).toBeGreaterThanOrEqual(2)
  })

  it('the register SUMMARY the engine receives is counts only', () => {
    // TwinStaffEvaluationSummaryView is three integers by type; this pins that the
    // producer builds it from counts and never carries a row through.
    const src = readFileSync(join(HERE, 'twin-register.service.ts'), 'utf8')
    expect(src).toContain('registerSize: rows.length')
    expect(src).toMatch(/overdueCount: overdue\.length/)
  })

  // ───────────────────────────────────────────────────────────────────────────
  // AIC PHASE K — the same discipline, over the two most sensitive registers the
  // product has ever held.
  //
  // A CLEARANCE is a background check on an adult who works with children.
  // "Two clearances are past their expiry date" is a fact about a school.
  // "Sarah's background check lapsed" is a fact about an employee, it is
  // allegation-shaped, and it is false in the way that matters most — a lapsed
  // certificate is a paperwork state, not a finding about a person. The twin
  // renders its payload VERBATIM into the briefing, Penny, exports and alerts,
  // so anything that reaches this directory reaches all of them.
  // ───────────────────────────────────────────────────────────────────────────

  const CLEARANCE_DELEGATE = new RegExp(['pris', 'ma\\s*\\.\\s*clear', 'ance\\b'].join(''))
  const PD_DELEGATE = new RegExp(['pris', 'ma\\s*\\.\\s*professional', 'Development\\b'].join(''))
  const CLEARANCE_IDENTITY = new RegExp(`\\b(?:${['verified' + 'By', 'external' + 'Ref'].join('|')})\\b`)

  it('never names a clearance identity column, anywhere in the directory', () => {
    const offenders = FILES.filter((f) => CLEARANCE_IDENTITY.test(readFileSync(f, 'utf8')))
    expect(offenders.map(rel)).toEqual([])
  })

  it('reads the clearance register from exactly the two allowed files', () => {
    const readers = FILES.filter(
      (f) => !f.endsWith('.spec.ts') && CLEARANCE_DELEGATE.test(readFileSync(f, 'utf8')),
    )
    expect(readers.map(rel).sort()).toEqual(ALLOWED_READERS)
  })

  it('every clearance select is DATES ONLY — no person, no kind, no verifier', () => {
    // The whole guarantee for the most sensitive table in the product. A third
    // column fails HERE, in the build, before it can reach a payload.
    const ALLOWED_CLEARANCE_COLUMNS = [['expiresOn'], ['expiresOn', 'issuedOn'].sort()]
    const seen: string[][] = []
    for (const f of FILES) {
      for (const cols of staffSelects(readFileSync(f, 'utf8'), 'clearance')) {
        expect(
          ALLOWED_CLEARANCE_COLUMNS.some((a) => a.join(',') === cols.join(',')),
          `${rel(f)}: ${cols.join(',')}`,
        ).toBe(true)
        seen.push(cols)
      }
    }
    expect(seen.length).toBeGreaterThanOrEqual(2)
  })

  it('every professionalDevelopment select is a FOREIGN KEY and a date, nothing else', () => {
    // `personId` is selected because participation is counted PER PERSON and a set
    // of ids is the only way to do that. It is a foreign key, it is never
    // rendered, and it is consumed only by `new Set(...).size`. A `title`, a
    // `category` or a `notes` column here would be a description of what one named
    // teacher was sent on.
    const ALLOWED_PD_COLUMNS = [['personId'], ['activityDate', 'personId'].sort()]
    const seen: string[][] = []
    for (const f of FILES) {
      for (const cols of staffSelects(readFileSync(f, 'utf8'), 'professionalDevelopment')) {
        expect(
          ALLOWED_PD_COLUMNS.some((a) => a.join(',') === cols.join(',')),
          `${rel(f)}: ${cols.join(',')}`,
        ).toBe(true)
        seen.push(cols)
      }
    }
    expect(seen.length).toBeGreaterThanOrEqual(2)
  })

  it('reads the PD register from exactly the two allowed files', () => {
    const readers = FILES.filter(
      (f) => !f.endsWith('.spec.ts') && PD_DELEGATE.test(readFileSync(f, 'utf8')),
    )
    expect(readers.map(rel).sort()).toEqual(ALLOWED_READERS)
  })

  it('the Phase-K SUMMARIES the engine receives are counts only', () => {
    const src = readFileSync(join(HERE, 'twin-register.service.ts'), 'utf8')
    expect(src).toMatch(/trackedCount: rows\.length/)
    expect(src).toMatch(/participantCount: new Set\(rows\.map\(\(r\) => r\.personId\)\)\.size/)
    // PD participation is PEOPLE, never money — and the register carries no cost
    // column at all, so there is nothing here to be tempted by.
    expect(src).not.toMatch(/\b(?:cost|spend|amount)\b/i)
  })

  it('names no prior-visit free text either', () => {
    // A citation's `text` is unbounded free text lifted from a PDF. It is shown on
    // the register endpoint and never in the twin payload, which feeds the
    // briefing, Penny and every export.
    for (const f of FILES) {
      const src = readFileSync(f, 'utf8')
      const re = /priorVisitFinding\s*\.\s*findMany\s*\(\{[\s\S]*?select:\s*\{([^}]*)\}/g
      for (const m of src.matchAll(re)) {
        expect(m[1], rel(f)).not.toMatch(/\btext\s*:/)
      }
    }
  })
})
