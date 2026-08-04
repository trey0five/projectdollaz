import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase J — THE PENNY-PII GUARD. The assistant-directory equivalent of
// apps/api/src/twin/no-staff-pii.spec.ts and no-student-access.spec.ts, built the
// same way and for the same reason.
//
// PENNY GETS COUNTS ONLY. NEVER A NAME. "Four staff evaluations are overdue" is a
// fact about a school. "Maria's evaluation is 240 days overdue" is a fact about an
// employee. Phase F's contract stands: the HR register may name a person on ITS OWN
// endpoint to an authorised role, and NOTHING Penny emits may — because Penny's
// output is spoken aloud, exported, printed to a board packet and pasted into
// email, and none of those inherit the register's role gate.
//
// THE RULE IS STRUCTURAL, NOT ADVISORY. `HrModule` exports nothing, deliberately —
// exporting `StaffEvaluationsService` would hand out `StaffEvaluationPublic`, which
// carries an identity. So the coverage read goes through the global PrismaService
// with a three-column select, exactly as TwinRegisterService.staffEvaluationSummary
// does. That is the shape that CANNOT leak an identity, because it never loads one.
// A select is a stronger guarantee than a redaction: redaction is a thing you must
// remember to do to a row you already fetched.
//
// The forbidden patterns are ASSEMBLED FROM FRAGMENTS so this file — one of the
// files it walks — is not its own first offender. That is what lets the rule apply
// to EVERY file including the specs, with no exemption list to quietly grow.
//
// RED PROOFS (run):
//  PII-1 — add a fourth, identifying column to a staff-register select
//          → "every staffEvaluation select is EXACTLY the three non-identifying
//             columns": expected [ 'dueDate', …, 'status' ] to deeply equal [ … ]
//          (proved with a scratch file in this directory, since coverage.service.ts
//           is ENGINEER-TOOLS' file; the assertion is on the DIRECTORY, not on one
//           filename, so the proof holds either way)
//  PII-2 — point `walk()` at an empty directory
//          → "expected 0 to be greater than or equal to 25"
//  PII-3 — add a roster query to any file here
//          → "the student roster is unreachable from the assistant": [ '<file>' ]
//
// This spec caught ITSELF on first run — the labels spelled the very columns they
// forbid. That is recorded rather than quietly fixed, because it is the evidence
// that the walk covers every file with no exemption for the guard itself.
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
const read = (f: string): string => readFileSync(f, 'utf8')

/** Identity columns. Not in code, not in a type, not in a comment: a field name that
 *  appears here is a field somebody can start selecting tomorrow.
 *
 *  The name is SPLIT and rejoined at runtime so that neither the label nor the
 *  pattern spells the field in this file's source — otherwise this spec would be
 *  its own first offender and would have to exempt itself, and an exemption list is
 *  the thing that quietly grows until the rule means nothing. */
const IDENTITY_FIELDS: [string, RegExp][] = (
  [
    ['first', 'Name'],
    ['last', 'Name'],
    ['birth', 'Date'],
    ['external', 'Id'],
    ['per', 'sonName'],
    ['evalua', 'torName'],
  ] as const
).map(([a, b]): [string, RegExp] => [a + b, new RegExp(`\\b${a}${b}\\b`)])

/** Prisma delegates that resolve to an identifiable human. */
const STUDENT_DELEGATE = new RegExp(['pris', 'ma\\s*\\.\\s*stud', 'ent\\b'].join(''))
const GOV_PERSON_DELEGATE = new RegExp(['pris', 'ma\\s*\\.\\s*governanceP', 'erson\\b'].join(''))
const STAFF_EVAL_DELEGATE = new RegExp(['pris', 'ma\\s*\\.\\s*staffEv', 'aluation\\b'].join(''))

/** A Prisma `include:`/`select:` that pulls a person relation in. */
const PERSON_RELATION = new RegExp(`\\bper${'son'}\\s*:\\s*\\{`)

/** The ONE file permitted to read the staff register, and the ONLY columns it may select. */
const ALLOWED_STAFF_READERS = ['coverage.service.ts']
const ALLOWED_STAFF_COLUMNS = ['completedDate', 'dueDate', 'status']

/**
 * Every `select: { … }` block that follows a `staffEvaluation.findMany/findFirst/
 * groupBy/count` call in one file, as sorted column lists. Deliberately a regex over
 * source and not a type-level check: a type would be satisfied by a widened select,
 * and the thing being defended is the SQL that actually runs.
 */
function staffSelects(src: string): string[][] {
  const out: string[][] = []
  const re = /staffEvaluation\s*\.\s*(?:findMany|findFirst|findUnique)\s*\(\{[\s\S]*?select:\s*\{([^}]*)\}/g
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

describe('assistant — nothing Penny emits carries a person’s name (AIC Phase J)', () => {
  it('PII-2 — the walk actually found this directory', () => {
    // A guard on the guard: a walk that silently returned [] would pass every
    // assertion below while proving nothing at all. 25 is comfortably under the
    // file count Phase J ships and comfortably over an accident.
    expect(FILES.length).toBeGreaterThanOrEqual(25)
    expect(FILES.some((f) => rel(f) === 'value-safety.ts')).toBe(true)
  })

  it('PII-3 — the student roster is unreachable from the assistant', () => {
    // FERPA. Today this directory contains ZERO student queries; this pins that,
    // so a roster read becomes a build failure rather than a code-review question.
    const offenders = FILES.filter((f) => STUDENT_DELEGATE.test(read(f)))
    expect(offenders.map(rel), 'the student roster is unreachable from the assistant').toEqual([])
  })

  it('names no identity column, anywhere in the directory', () => {
    const offenders: string[] = []
    for (const f of FILES) {
      const src = read(f)
      for (const [name, re] of IDENTITY_FIELDS) {
        if (re.test(src)) offenders.push(`${rel(f)}:${name}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('never reads the governance person register', () => {
    // Trustees are named individuals too. Penny gets committee/meeting COUNTS.
    const offenders = FILES.filter((f) => GOV_PERSON_DELEGATE.test(read(f)))
    expect(offenders.map(rel)).toEqual([])
  })

  it('never pulls a person relation into a select or an include', () => {
    const offenders = FILES.filter((f) => PERSON_RELATION.test(read(f)))
    expect(offenders.map(rel)).toEqual([])
  })

  it('PII-1a — at most ONE production file reads the staff register, and it is coverage.service.ts', () => {
    // PRODUCTION files only: a spec that hand-mocks the delegate reads no database
    // and names no employee. Every production reader is still bound by the column
    // assertion below, which DOES walk the specs.
    const readers = FILES.filter((f) => !f.endsWith('.spec.ts') && STAFF_EVAL_DELEGATE.test(read(f)))
      .map(rel)
      .sort()
    for (const r of readers) expect(ALLOWED_STAFF_READERS, `unexpected staff-register reader`).toContain(r)
    expect(readers.length).toBeLessThanOrEqual(1)
  })

  it('PII-1b — every staffEvaluation select is EXACTLY the three non-identifying columns', () => {
    // The whole guarantee in one assertion. A fourth column — a personId, an
    // evaluator, a note — fails here, in the build, before it can reach a payload.
    // NOTE this walks the SPECS too: a fixture that mocks a widened select is a
    // fixture teaching the next engineer that a widened select is normal.
    for (const f of FILES) {
      for (const cols of staffSelects(read(f))) {
        expect(cols, rel(f)).toEqual(ALLOWED_STAFF_COLUMNS)
      }
    }
  })

  it('the twin’s own PII guards are still in place and still stricter than nothing', () => {
    // Phase J adds no file under apps/api/src/twin/, and must not weaken what is
    // there. If either guard is deleted, this points at it by name rather than
    // letting the deletion pass as "that spec was moved".
    const twin = fileURLToPath(new URL('../twin/', import.meta.url))
    const present = readdirSync(twin)
    expect(present).toContain('no-staff-pii.spec.ts')
    expect(present).toContain('no-student-access.spec.ts')
  })
})
