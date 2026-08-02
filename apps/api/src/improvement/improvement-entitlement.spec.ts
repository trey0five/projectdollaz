import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MODULE_KEYS } from '@finrep/db'
import { composeFindingKey } from '@finrep/compliance'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase G — THERE IS NO `improvement` MODULE KEY, AND THERE MUST NOT BE ONE.
//
// Improvement work is how a school RESPONDS to what accreditation and strategic
// planning tell it. It is not a separate product, and a school should not have to
// buy a third thing to be allowed to write down what it is going to do about the
// second thing. So `/improvement` rides on `accreditation` OR `strategy` through
// the variadic guard, and no `improvement` key exists to be sold.
//
// This spec lives HERE, under src/improvement/, rather than in billing — so that
// the phase that would want to add the key cannot add it without turning this
// file red, and whoever does has to come and read the paragraph above first.
// ─────────────────────────────────────────────────────────────────────────────

const DIR = fileURLToPath(new URL('.', import.meta.url))
const sourceFiles = () => readdirSync(DIR).filter((f) => f.endsWith('.ts'))
const read = (f: string) => readFileSync(join(DIR, f), 'utf8')

describe('no third SKU', () => {
  it('MODULE_KEYS contains no `improvement` key', () => {
    expect(MODULE_KEYS).not.toContain('improvement')
  })

  it('nothing under src/improvement/ names `improvement` inside a RequiresModule() call', () => {
    // The guard's OR list is the ONLY thing standing between this page and a
    // third SKU. A key added to a decorator here would silently invent one.
    for (const f of sourceFiles()) {
      for (const m of read(f).matchAll(/@?RequiresModule\(([^)]*)\)/g)) {
        expect(m[1], `${f}: RequiresModule(${m[1]})`).not.toContain('improvement')
      }
    }
  })

  it('the controller is gated on accreditation OR strategy, with accreditation FIRST', () => {
    const src = read('improvement.controller.ts')
    // keys[0] is what the 402 body's `module` field carries, and apps/web's
    // moduleKeyFromError reads exactly that field — the ordering is load-bearing,
    // not cosmetic.
    expect(src).toMatch(/@RequiresModule\('accreditation',\s*'strategy'\)/)
  })
})

describe('composeFindingKey is THE one formula', () => {
  it('composes ruleId and scopeKey the way the ledger stores them', () => {
    expect(composeFindingKey('R', 'school')).toBe('R:school')
    expect(composeFindingKey('GOV-MINUTES-STALE', 'standard:abc-123')).toBe(
      'GOV-MINUTES-STALE:standard:abc-123',
    )
  })

  it('early-warning.service.ts no longer inlines the template literal', () => {
    // Two implementations of a key that a JOIN depends on is a fork waiting to
    // happen: the reader would look up a key the writer never wrote.
    const src = readFileSync(
      fileURLToPath(new URL('../twin/early-warning.service.ts', import.meta.url)),
      'utf8',
    )
    expect(src).not.toMatch(/`\$\{f\.ruleId\}:\$\{f\.scopeKey\}`/)
    expect(src).toContain('composeFindingKey(')
  })

  it('the nightly reconciliation writer uses the SAME composer as the readers', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../twin/twin-reconciliation.service.ts', import.meta.url)),
      'utf8',
    )
    expect(src).not.toMatch(/`\$\{f\.ruleId\}:\$\{f\.scopeKey\}`/)
    expect(src).toContain('composeFindingKey(')
  })
})

describe('the audit targetType is the TABLE name, and the table was NOT renamed', () => {
  it("every improvement write stamps 'strategy_initiatives'", () => {
    // Phase G renamed the Prisma MODEL; @@map kept the table. A second targetType
    // would orphan every pre-Phase-G audit row from any query that filters on it.
    const constants = read('improvement.constants.ts')
    expect(constants).toContain("INITIATIVE_AUDIT_TARGET = 'strategy_initiatives'")
    const service = read('improvement.service.ts')
    // No hand-written targetType anywhere in the service — every write goes
    // through the one constant.
    for (const m of service.matchAll(/targetType:\s*([^,\n]+)/g)) {
      expect(m[1].trim(), 'a hand-written audit targetType').toBe('INITIATIVE_AUDIT_TARGET')
    }
    expect([...service.matchAll(/targetType:/g)].length).toBeGreaterThan(0)
  })
})
