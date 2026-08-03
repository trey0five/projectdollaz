/* global process */
// `process` is declared explicitly rather than disabling no-undef: apps/web's
// eslint config is browser-scoped, and this spec reads its subject off disk in
// the node-side vitest context. Narrower than an env override, and it documents
// that the node global here is deliberate.
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { moduleTabs } from '../module/moduleAnatomy.js'

// ─────────────────────────────────────────────────────────────────────────────
// "I'm done" MUST LAND ON WHAT WAS JUST SAVED.
//
// Reported from production after a 436-student roster upload: "when I click I'm
// done … it takes me back to add data instead of the records screen to see the
// newly added roster." `finish()` reset the wizard to its Choose step, so the
// reward for completing a task was the chooser for that same task.
//
// Asserted over the SOURCE rather than by mounting the wizard: the component
// needs the school/period/entitlement context stack and a fetch layer, and a
// spec that fragile gets deleted the first time it reddens for an unrelated
// reason. What must not silently rot is narrow and textual — which identifier
// the guard reads, and which URL it navigates to.
// ─────────────────────────────────────────────────────────────────────────────

afterEach(cleanup)

// Resolved from the package root, not import.meta.url: this suite runs under
// jsdom, where import.meta.url is an http URL and fileURLToPath rejects it.
const at = (rel) => resolve(process.cwd(), rel)
const SRC = readFileSync(at('src/components/wizard/AddDataWizard.jsx'), 'utf8')

/** The body of `const finish = () => { … }`, up to its closing brace. */
function finishBody() {
  const start = SRC.indexOf('const finish = () => {')
  expect(start, 'finish() not found — was it renamed?').toBeGreaterThan(-1)
  return SRC.slice(start, SRC.indexOf('\n  }', start))
}

describe('AddDataWizard — "I\'m done" routes to what was saved', () => {
  it('navigates rather than only resetting the step', () => {
    const body = finishBody()
    expect(body, 'finish() no longer navigates — it strands the user on Add data').toMatch(
      /navigate\(/,
    )
    expect(body).toMatch(/\?tab=records/)
  })

  // THE BUG THIS EXISTS TO CATCH, because I wrote it: the first version of this
  // guard read a bare `module`. There is no such binding in the component (it is
  // `config.module`), and in the browser a bare `module` is undefined rather than
  // a ReferenceError — so the condition was silently false, every module routed
  // to its Overview, the build passed, and the bug it was fixing survived.
  it('reads config.module — a bare `module` is undefined here and fails SILENTLY', () => {
    const body = finishBody()
    expect(body, 'finish() must read config.module').toMatch(/config\.module/)
    // A bare `module` used as a value: not preceded by a dot and not a property key.
    const bare = /(^|[^.\w])module\s*(&&|\?|\)|,)/.test(body.replace(/config\.module/g, ''))
    expect(bare, 'finish() reads a bare `module`, which is undefined in this scope').toBe(false)
  })

  it('uses the SAME records predicate as the Records pill, so they cannot disagree', () => {
    const body = finishBody()
    expect(body).toMatch(/moduleTabs\(/)
    const cta = readFileSync(at('src/components/module/ModuleCtas.jsx'), 'utf8')
    expect(cta).toMatch(/moduleTabs\([^)]*\)\.includes\('records'\)/)
    expect(body).toMatch(/moduleTabs\([^)]*\)\.includes\('records'\)/)
  })

  it('the two register-less modules still exist and would route to Overview', () => {
    // If HR or Planning ever gain a register this stops being true, and the
    // assertion should be updated deliberately rather than discovered in prod.
    expect(moduleTabs('hr').includes('records')).toBe(false)
    expect(moduleTabs('planning').includes('records')).toBe(false)
    expect(moduleTabs('enrollment').includes('records')).toBe(true)
  })
})
