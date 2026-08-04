/* global process */
// `process` is declared explicitly rather than disabling no-undef: apps/web's
// eslint config is browser-scoped, and this spec reads its subjects off disk in
// the node-side vitest context (same pattern as wizard-finish.spec.jsx).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────
// THE CARD NO-CLIP SWEEP — acceptance #5, "no clipped text on any module
// overview at 1280px and 1500px".
//
// The first pass of this sweep fixed the two shared domain/ components and the
// stylesheet, and stopped there. Review then found the SAME defect alive on
// three of the six surfaces the spec's own §5.5 names as the verification set,
// purely because those files were outside the ownership list:
//
//   /accreditation — DomainBandStrip rendered every domain as "MISSI…",
//                    "GOVE…", "ACAD…"; DomainGrid cards carrying a "NOT SCORED"
//                    pill lost their title ENTIRELY (icon + "!" + NOT SCORED).
//   /app           — HomeVitalsStrip clipped "MONTHS OF OPERATING…" and
//                    BriefingPerformers clipped "Months …" / "Tuition …" at
//                    BOTH widths. This is the first screen after login.
//   /enrollment    — VsPlanKpi was the last KPI row still wearing the retired
//                    `border-2 … shadow-card` box, so it read flat beside every
//                    other module's cushioned tile.
//
// A per-component render spec cannot catch "a file nobody visited". So this
// guard is a FROZEN ROSTER: the label/title-bearing components behind the six
// named overviews, each pinned on the mechanism that clips (`truncate`) and,
// for the card shell, on the shared depth vocabulary. Adding a surface to the
// verification set means adding it here.
//
// jsdom does no layout, so `truncate` (overflow:hidden + text-overflow:ellipsis
// + white-space:nowrap) is pinned as the CAUSE rather than the symptom: on a
// card label it is never structural — it is how a name becomes a stub.
//
// Proven RED before the fix: all four assertions failed (DomainBandStrip:72,
// DomainGrid:123 + :292, HomeVitalsStrip:76, BriefingPerformers:114 carried
// `truncate`; VsPlanKpi carried three `border-2 … shadow-card` boxes).
// ─────────────────────────────────────────────────────────────────────────────

const read = (rel) => readFileSync(resolve(process.cwd(), 'src', rel), 'utf8')

// Strip comments first — the build drops them, and this file's own prose says
// "truncate" a dozen times. Only shipped className strings may be matched.
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')

// The roster: component → the overview(s) it clips on. Frozen with reasons.
const LABEL_SURFACES = [
  ['components/accreditation/DomainBandStrip.jsx', '/accreditation — early-warning band strip'],
  ['components/accreditation/DomainGrid.jsx', '/accreditation — rubric cards + signal chips'],
  ['components/home/HomeVitalsStrip.jsx', '/app — School vitals strip'],
  ['components/home/BriefingPerformers.jsx', '/app — Daily Briefing hero stat pills'],
  ['components/domain/DomainKpiCard.jsx', 'every domain command center — the KPI tile'],
  ['components/enrollment/VsPlanKpi.jsx', '/enrollment — enrollment-vs-plan KPI row'],
]

describe('card no-clip sweep — the §5.5 verification set names nothing in a stub', () => {
  for (const [rel, where] of LABEL_SURFACES) {
    it(`${rel} never truncates a card label (${where})`, () => {
      const code = stripComments(read(rel))
      const offending = [...code.matchAll(/className=[^\n]*\btruncate\b[^\n]*/g)].map((m) =>
        m[0].slice(0, 120),
      )
      expect(
        offending,
        `\`truncate\` on a card label in ${rel} — a clipped metric name ("MISSI…", "MONTHS OF OPERATING…") names nothing. Wrap it: min-w-0 + break-words + leading-snug, and let the row wrap so a status pill drops below the title instead of eating it.`,
      ).toEqual([])
    })
  }

  it('VsPlanKpi wears the SHARED card vocabulary, not a per-page fork', () => {
    const code = stripComments(read('components/enrollment/VsPlanKpi.jsx'))
    // index.css documents .card-soft as the replacement for "the heavy border-2
    // boxes". A surviving fork is why /enrollment read flat beside /facilities.
    expect(code, 'VsPlanKpi no longer uses the shared .card-soft shell').toMatch(/card-soft/)
    expect(
      code,
      'the retired flat vocabulary is back on /enrollment (border-2 / shadow-card) — do not fork per-page card styles (card contract §5)',
    ).not.toMatch(/border-2|shadow-card/)
  })

  it('sanity: the roster really read the files (guard against a silent empty read)', () => {
    for (const [rel] of LABEL_SURFACES) expect(read(rel).length).toBeGreaterThan(500)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// FLEX-WRAP DOES NOT WRAP WITHOUT A BASIS — and the failure looks absurd.
//
// Found by screenshotting /accreditation at 1280 AFTER the card sweep "fixed"
// this. The header row had `flex-wrap` and the title had `min-w-0 flex-1`, which
// reads as safe — but a flex child SHRINKS before its row wraps, so the pill kept
// its full width and the title collapsed to ~4px, rendering "Mission & Catholic
// Identity" as ONE LETTER PER LINE down the card. A pixel probe caught it that a
// class-name reading could not: the element was 4px wide and 206px tall.
//
// The basis is what converts "shrink" into "wrap". Without it, `flex-wrap` on
// this row is decoration.
// ─────────────────────────────────────────────────────────────────────────────
describe('a wrapping card header gives its title a basis, not just flex-1', () => {
  const grid = read('components/accreditation/DomainGrid.jsx')

  it('DomainGrid: the title block declares a flex-basis so the pill wraps below it', () => {
    expect(grid, 'flex-1 alone SHRINKS the title to nothing next to a pill').toMatch(
      /flex min-w-0 flex-1 basis-\[[^\]]+\] items-start/,
    )
  })

  it('…and the header row still allows wrapping at all', () => {
    expect(grid).toMatch(/flex flex-wrap items-start justify-between/)
  })
})

// The band strip lives in the page's NARROW column (~571px at 1280), not the
// full width — so a 4-up grid gave each cell ~127px and `break-words` shattered
// "GOVERNANCE" into "GOVERNA/NCE". Density is the fix; whole words beat more
// cards. If someone raises the density again, this is the tripwire.
describe('DomainBandStrip stays readable in the narrow column', () => {
  const strip = read('components/accreditation/DomainBandStrip.jsx')

  it('is at most 3-up until 2xl', () => {
    expect(strip).toMatch(/lg:grid-cols-3/)
    expect(strip, 'lg:grid-cols-4 breaks GOVERNANCE mid-word at 1280').not.toMatch(
      /lg:grid-cols-[45]/,
    )
  })

  it('hyphenates rather than breaking anywhere', () => {
    expect(strip).toMatch(/hyphens-auto/)
  })
})

// The readiness hero's "Fastest path" is the one list whose whole job is telling
// a head of school WHICH standard to work next. It rendered ~169px of a
// 100-character standard name — a code plus a fragment ending mid-word.
describe('the Fastest path names the standard, not a fragment', () => {
  const hero = read('components/accreditation/ReadinessHero.jsx')

  it('the gap title is clamped to two lines, not truncated to one', () => {
    expect(hero).toMatch(/line-clamp-2 min-w-0 flex-1 break-words/)
    expect(hero, 'a single truncated line shows about a quarter of the name').not.toMatch(
      /flex-1 truncate text-\[13px\] text-white\/80/,
    )
  })
})
