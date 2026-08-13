import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MODULE_META } from '../../lib/modules.js'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, 'OrgModulesMatrix.jsx'), 'utf-8')

/**
 * ADDON_COLUMNS is a hand-written list of every sellable module, and the org
 * "Modules" grid is the only place an owner can see which schools hold which
 * add-on. Academics shipped without being added: the column simply did not
 * exist, so no school could be seen holding it and every row's add-on count was
 * one short — a billing surface quietly under-reporting what was sold.
 *
 * This reads the source rather than the component so it fails at the moment a
 * module is registered, not once someone opens the page.
 */
describe('org modules matrix — every sellable module has a column', () => {
  const columns = new Set([...source.matchAll(/\{ key: '([a-z_]+)', Icon:/g)].map((m) => m[1]))

  // Core and finance are always-on: the grid shows them as a note, not a column.
  const alwaysOn = new Set(['core', 'finance'])
  const sellable = Object.keys(MODULE_META).filter((k) => !alwaysOn.has(k))

  it('found the column list', () => {
    expect(columns.size).toBeGreaterThan(5)
  })

  it('has one column per sellable module, and none for the always-on ones', () => {
    for (const key of sellable) {
      expect(columns.has(key), `MODULE_META has "${key}" but the grid has no column for it`).toBe(true)
    }
    for (const key of alwaysOn) {
      expect(columns.has(key), `"${key}" is always-on and must not be a column`).toBe(false)
    }
  })

  it('has no column for a module that no longer exists', () => {
    for (const key of columns) {
      expect(MODULE_META[key], `the grid has a column for "${key}", which is not in MODULE_META`).toBeDefined()
    }
  })
})
