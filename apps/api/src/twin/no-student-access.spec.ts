import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase D — ACCEPTANCE CRITERION 5, mechanised.
//
// "No signal collector reaches a student row directly."
//
// A promise in a comment is a promise until someone is in a hurry. This spec
// walks every .ts file under apps/api/src/twin and fails the BUILD (nest build
// compiles .spec.ts) if a student row is ever reachable from here.
//
// The rule is not "be careful with student data" — it is STRUCTURAL: roster
// counts enter this directory through exactly ONE door, StudentsService.aggregate,
// which is FERPA-safe by construction (counts only; the shape has no name field),
// and every per-cohort cell passes through suppressSmallCellSet before it can be
// serialised. One door is auditable; "be careful" is not.
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

/**
 * The forbidden patterns are ASSEMBLED FROM FRAGMENTS so that this spec file — which
 * is itself one of the files it walks — is not its own first offender. That is not
 * a trick to dodge the rule: it is what lets the rule apply to EVERY .ts file in
 * the directory, specs included, with no exemption list to quietly grow.
 */
const DIRECT_STUDENT_QUERY = new RegExp(['pris', 'ma\\s*\\.\\s*stud', 'ent\\b'].join(''))
const IDENTITY_FIELD = new RegExp(
  `\\b(${['first', 'last'].map((p) => `${p}Name`).join('|')}|birth${'Date'}|external${'Id'})\\b`,
)

describe('twin — no student-row access (acceptance 5)', () => {
  it('finds at least the files this phase ships', () => {
    // A guard on the guard: a walk that silently returned [] would pass every
    // assertion below while proving nothing at all.
    expect(FILES.length).toBeGreaterThanOrEqual(8)
  })

  it('never reaches a student row directly, anywhere in the directory', () => {
    const offenders = FILES.filter((f) => DIRECT_STUDENT_QUERY.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('never names a student identity field', () => {
    // Not even in a comment or a type: a field name that appears here is a field
    // somebody can start selecting tomorrow.
    const offenders = FILES.filter((f) => IDENTITY_FIELD.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('imports StudentsService from exactly one file', () => {
    const importers = FILES.filter((f) =>
      /from\s+['"][^'"]*\/students\/students\.service(\.js)?['"]/.test(readFileSync(f, 'utf8')),
    )
    expect(importers.map((f) => f.slice(HERE.length))).toEqual(['twin-signals.service.ts'])
  })

  it('routes every roster read through StudentsService.aggregate', () => {
    const src = readFileSync(join(HERE, 'twin-signals.service.ts'), 'utf8')
    expect(src).toContain('this.students.aggregate(')
    // aggregate() is the ONLY StudentsService method the twin may call: list(),
    // get() and the import paths all carry names.
    const calls = src.match(/this\.students\.[a-zA-Z]+\(/g) ?? []
    expect([...new Set(calls)]).toEqual(['this.students.aggregate('])
  })
})
