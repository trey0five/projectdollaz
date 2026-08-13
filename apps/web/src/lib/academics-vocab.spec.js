import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TEST_TYPE_KEYS, TEST_TYPE_LABELS } from './academicsVocab.js'

const here = dirname(fileURLToPath(import.meta.url))
const canonical = readFileSync(join(here, '../../../../packages/db/src/academics.ts'), 'utf-8')

/**
 * A mirror only helps while it still reflects. The web cannot import
 * @finrep/db (it pulls in the Prisma client), so this list is copied — and a
 * copy drifts silently: adding a test type in the canonical file would leave
 * the upload picker unable to offer it, with nothing failing anywhere.
 *
 * Reading the canonical source is the cheapest way to make drift loud.
 */
describe('academics vocabulary mirror', () => {
  const canonicalKeys = [
    ...canonical.slice(canonical.indexOf('export const TEST_TYPE_KEYS'), canonical.indexOf('] as const')).matchAll(
      /^\s*'([a-z0-9_]+)',$/gm,
    ),
  ].map((m) => m[1])

  it('read the canonical list', () => {
    expect(canonicalKeys.length).toBeGreaterThan(5)
  })

  it('has exactly the canonical test types, in the same order', () => {
    expect(TEST_TYPE_KEYS).toEqual(canonicalKeys)
  })

  it('labels every key — a picker option with no name is unusable', () => {
    for (const key of TEST_TYPE_KEYS) {
      expect(TEST_TYPE_LABELS[key], `no label for "${key}"`).toBeTruthy()
    }
    expect(Object.keys(TEST_TYPE_LABELS).sort()).toEqual([...TEST_TYPE_KEYS].sort())
  })

  it('matches the canonical labels verbatim', () => {
    const block = canonical.slice(
      canonical.indexOf('export const TEST_TYPE_LABELS'),
      canonical.indexOf('/** Which score family'),
    )
    for (const [key, label] of Object.entries(TEST_TYPE_LABELS)) {
      expect(block, `label for "${key}" differs from the canonical file`).toContain(`${key}: '${label}'`)
    }
  })
})
