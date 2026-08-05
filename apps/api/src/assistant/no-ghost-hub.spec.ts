// ─────────────────────────────────────────────────────────────────────────────
// THE API-SIDE TWIN of apps/web/src/no-ghost-hub.spec.js — and the reason it
// exists is that the web guard scans only apps/web/src, which is EXACTLY how
// Penny's system prompt kept offering "to open the Data hub" through the entire
// finance purge that deleted the phrase everywhere the web guard could see.
//
// The assistant directory is the LLM's whole vocabulary: its system prompt, its
// tool descriptions, its refusal copy. A retired product name surviving here is
// not a stale comment — it is Penny TELLING USERS about a surface that no longer
// mounts. The phrase is banned in STRING LITERALS under apps/api/src/assistant;
// the real v1 module (apps/api/src/data-hub/**) is outside the scan on purpose,
// because it IS the Data hub and may say so.
// ─────────────────────────────────────────────────────────────────────────────
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

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

/** Strip comments so a comment RECORDING the ban is not its first offender. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

// Assembled from fragments so THIS file — one of the files it walks — never
// matches itself. Case-insensitive, hyphen/space tolerant: "Data hub",
// "Data-hub", "data hub".
const PHRASE = new RegExp(['data', '[-\\s]', 'hub'].join(''), 'i')

describe('assistant — the Data hub stays retired', () => {
  const files = walk(HERE).filter((f) => !f.endsWith('no-ghost-hub.spec.ts'))

  it('finds the files it claims to guard', () => {
    expect(files.length).toBeGreaterThanOrEqual(5)
  })

  it('no string in the assistant directory names the retired Data hub', () => {
    const offenders: string[] = []
    for (const f of files) {
      const src = stripComments(readFileSync(f, 'utf8'))
      if (PHRASE.test(src)) {
        const line = src.split('\n').findIndex((l) => PHRASE.test(l)) + 1
        offenders.push(`${f.slice(HERE.length)}:${line}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('the walkthrough vocabulary stays FROZEN — the keys are the contract, not the copy', () => {
    // The dataHub.* target KEYS must survive: the backend enum and the web
    // registry are required to stay byte-identical, and v1 still resolves them
    // to the real hub. What changed is their MEANING under ui.v2 (the web
    // registry's V2 overrides), never their names — deleting a key here would
    // break every v1 walkthrough that names it.
    const tools = readFileSync(join(HERE, 'assistant.tools.ts'), 'utf8')
    for (const key of [
      'dataHub.trialBalanceCard',
      'dataHub.budgetCard',
      'dataHub.forecastCard',
      'trialBalance.uploadDrop',
      'budget.setupPanel',
    ]) {
      expect(tools, key).toContain(`'${key}'`)
    }
  })
})
