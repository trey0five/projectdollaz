import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase D — THE MIGRATION IS ADDITIVE, AND THAT PROMISE IS MECHANICAL.
//
// The plan's claim about this file is that it can be `migrate deploy`-ed while
// the PREVIOUS image is still serving production at ourkyro.com: one new table,
// no column added to or altered on any existing table, no backfill, no DML, no
// COALESCE, no functional index. Until this spec existed that promise was
// enforced by nothing — the file happens to be clean, and the next hand-edited
// migration on this branch had no guard at all.
//
// It reads the SQL as text on purpose. A schema-level assertion would test
// Prisma's model, not the statements Postgres will actually run.
// ─────────────────────────────────────────────────────────────────────────────

const MIGRATION_PATH = fileURLToPath(
  new URL(
    '../../../../packages/db/prisma/migrations/20260803000000_accreditation_findings/migration.sql',
    import.meta.url,
  ),
)

/** The file with `--` comment lines stripped, so prose cannot trip a grep. */
function statements(): string {
  return readFileSync(MIGRATION_PATH, 'utf8')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n')
}

describe('the findings migration is strictly additive', () => {
  const sql = statements()

  it('creates exactly ONE table, and it is accreditation_findings', () => {
    const creates = sql.match(/CREATE\s+TABLE/gi) ?? []
    expect(creates).toHaveLength(1)
    expect(sql).toMatch(/CREATE TABLE "accreditation_findings"/)
  })

  it('alters no OTHER table', () => {
    const alters = sql.match(/ALTER TABLE\s+"([^"]+)"/gi) ?? []
    for (const a of alters) {
      expect(a).toMatch(/"accreditation_findings"/)
    }
    // And it drops nothing, ever.
    expect(sql).not.toMatch(/\bDROP\b/i)
  })

  it('runs no DML — a migration that writes rows is inventing history', () => {
    // STATEMENT-LEADING only: `ON DELETE CASCADE ON UPDATE CASCADE` is referential
    // action syntax inside the FK, not a write.
    for (const stmt of sql.split(';')) {
      expect(stmt.trim()).not.toMatch(/^(INSERT|UPDATE|DELETE|TRUNCATE)\b/i)
    }
    expect(sql).not.toMatch(/\bINSERT\s+INTO\b/i)
  })

  it('uses no COALESCE and no functional index', () => {
    expect(sql).not.toMatch(/COALESCE/i)
    // A functional/expression index is a `(` immediately after ON "table"( that
    // wraps a call rather than a bare quoted column list.
    const indexTargets = sql.match(/ON "accreditation_findings"\(([^)]*)\)/g) ?? []
    expect(indexTargets.length).toBeGreaterThan(0)
    for (const t of indexTargets) {
      const cols = t.slice(t.indexOf('(') + 1, -1)
      for (const col of cols.split(',')) {
        expect(col.trim()).toMatch(/^"[a-z_]+"$/)
      }
    }
  })

  it('carries the unique key and the three lookup indexes the ledger depends on', () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX "accreditation_findings_school_id_rule_id_scope_key_key"/,
    )
    expect(sql).toMatch(/CREATE INDEX "accreditation_findings_school_id_status_idx"/)
    expect(sql).toMatch(/CREATE INDEX "accreditation_findings_school_id_fact_key_idx"/)
    expect(sql).toMatch(/CREATE INDEX "accreditation_findings_school_id_last_seen_at_idx"/)
    expect(sql).toMatch(/CONSTRAINT "accreditation_findings_pkey" PRIMARY KEY \("id"\)/)
    // The one FK, cascading from the tenant it belongs to.
    expect(sql).toMatch(
      /ADD CONSTRAINT "accreditation_findings_school_id_fkey"[\s\S]*REFERENCES "schools"\("id"\)/,
    )
  })

  it('names no other table anywhere except the schools FK target', () => {
    const quoted = new Set((sql.match(/"[a-z_]+"/g) ?? []).map((s) => s.slice(1, -1)))
    // Column names are quoted too; only the two TABLE names may appear as such.
    expect(quoted.has('accreditation_findings')).toBe(true)
    expect(quoted.has('schools')).toBe(true)
  })
})
