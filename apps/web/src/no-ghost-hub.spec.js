/* global process */
// `process` is declared explicitly rather than disabling no-undef: apps/web's
// eslint config is browser-scoped, and this spec reads its subjects off disk in
// the node-side vitest context (same pattern as wizard-finish.spec.jsx).
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────
// THE DATA HUB IS A GHOST. Under ui.v2 the standalone hub was retired: /data is
// a static redirect to /finance?tab=add that DROPS QUERY STRINGS (App.jsx) —
// the exact dead-link class Phase E shipped and fixed once already. Yet a dozen
// user-facing surfaces kept saying "Data hub" and linking '/data', so budget
// CTAs landed on the trial-balance chooser and copy pointed at a page that no
// longer exists.
//
// This guard makes the ghost unrevivable, source-reading style:
//  (a) no STRING LITERAL anywhere in src may say "data hub" (comments are
//      stripped first — the build strips them too, so only rendered copy can
//      regress). Exclusion list: EMPTY, deliberately — verified at freeze time
//      that every ui.v1 file (DataHubPage.jsx, components/datahub/*) carries
//      the phrase in comments only.
//  (b) no file may carry a '/data' href/path literal except the frozen
//      exclusion list below — every real CTA must deep-link its TRUE
//      destination (/finance?tab=add&add=…, /planning, …) DIRECTLY, because
//      the /data redirect strips the query string.
// Proven RED before the sweep: (a) flagged 14 files, (b) flagged 7.
//
// ── Two blind spots found in review, both closed here ───────────────────────
//  (a) matched RAW source with a single-space regex, so Prettier's JSX line
//      wrap hid the phrase: BriefingBand.jsx shipped `…in the Data\n  hub…`
//      pre-sweep and /data hub/i could not see it. The BUILD collapses that
//      whitespace into one rendered sentence, so the guard must too — every
//      subject is now whitespace-collapsed before matching.
//  (b) required a CLOSING QUOTE immediately after `/data`, so it matched the
//      harmless bare '/data' and MISSED exactly the dangerous form it exists
//      to ban: the query-carrying '/data?open=budget' (live in
//      FacilitiesBudgetCard at review time, with the suite fully green). The
//      delimiter class now includes ? # &.
// ─────────────────────────────────────────────────────────────────────────────

// Files that may legitimately keep an exact '/data' literal (frozen, with
// reasons). Paths are relative to src/, posix separators.
const DATA_HREF_EXCLUSIONS = new Set([
  // The route definition itself (the v2 redirect lives here).
  'App.jsx',
  // Flag-shared Core "Data" nav item; navId nav-data is Penny-anchored — the
  // target is part of the guide contract, do not retarget.
  'components/nav/sidebarNav.js',
  // Flag-shared v1 modal contract: Penny nav-intents resolve to the bare path.
  'components/penny/PennyAgentBridge.jsx',
  // v1-ONLY home surfaces — /data is the REAL DataHubPage under that flag.
  'components/home/HomeDashboard.jsx',
  'components/home/HomeCommandCenter.jsx',
  'components/home/HomeBriefing.jsx',
  // The one flag-aware mapper: returns '/data' for v1, deep links for v2.
  'lib/dataDestinations.js',
])

const SRC_ROOT = resolve(process.cwd(), 'src')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      walk(full, out)
      continue
    }
    if (!/\.(js|jsx)$/.test(name)) continue
    if (/\.spec\./.test(name)) continue
    out.push(full)
  }
  return out
}

// Strip block comments and (^|\s)//… line comments, mirroring what the build drops.
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1')
}

// Collapse ALL runs of whitespace to a single space. JSX text is wrapped by
// Prettier at will and re-joined by the compiler, so "the Data\n  hub" ships to
// the user as "the Data hub"; matching raw source would miss it.
const collapse = (source) => source.replace(/\s+/g, ' ')

const files = walk(SRC_ROOT).map((full) => ({
  rel: relative(SRC_ROOT, full).split('\\').join('/'),
  code: collapse(stripComments(readFileSync(full, 'utf8'))),
}))

describe('the Data hub is retired — no ui.v2 surface may resurrect it', () => {
  it('no string literal in src says "Data hub" (comments stripped; NO exclusions)', () => {
    const offenders = files.filter((f) => /data hub/i.test(f.code)).map((f) => f.rel)
    expect(
      offenders,
      `"Data hub" copy found in: ${offenders.join(', ')} — the hub no longer exists; name the real destination ("Add data in Finance", "Set up your budget").`,
    ).toEqual([])
  })

  it("no '/data' href outside the frozen exclusion list — INCLUDING query-carrying ones", () => {
    // The delimiter class deliberately spans the closing quote AND ? # & : a
    // bare '/data' merely wastes a hop, but '/data?open=budget' silently loses
    // its param at the redirect and opens the WRONG wizard. The narrow
    // `['"`]\/data['"`]` form could only see the harmless case.
    const offenders = files
      .filter((f) => !DATA_HREF_EXCLUSIONS.has(f.rel))
      .filter((f) => /['"`]\/data(['"`?#&])/.test(f.code))
      .map((f) => f.rel)
    expect(
      offenders,
      `'/data' link found in: ${offenders.join(', ')} — link the true destination directly (e.g. /finance?tab=add&add=budget); routing through /data drops the query string.`,
    ).toEqual([])
  })

  it('sanity: the walker actually saw the app (guard against a silent empty walk)', () => {
    expect(files.length).toBeGreaterThan(100)
    expect(files.some((f) => f.rel === 'pages/FinancePage.jsx')).toBe(true)
  })
})
