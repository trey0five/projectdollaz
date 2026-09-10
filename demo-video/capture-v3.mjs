// KYRO demo v3 — screen-recorded scenes, captured from the live app as
// 1920x1080 webm via Playwright's recorder, one browser context per scene.
// Run: node capture-v3.mjs [sceneId ...]   (no args = every screen scene)
//
// Differences from capture.mjs (v2):
//   • scenes come from scenes-v3.json; each recording runs at least
//     max(minSec, words_in_vo × 0.5 s) + 4 s and keeps SOMETHING moving
//     (cursor drift / hover / slow scroll) until that floor is met;
//   • a cursor overlay is injected so the pointer (and each click ripple) is
//     visible in the recording;
//   • per-scene sidecar captures-v3/<id>.json = { settledAt, notes, ... } so the
//     build can trim the load flash (settledAt = seconds into the recording at
//     which the first page is painted and banner-stripped);
//   • two casts: torrey.munroe (Jon Snow) and the demo owner f399720d…, each
//     minted per run with the API's JWT_SECRET (no passwords, no stale states).
import { createRequire } from 'module'
import { mkdirSync, renameSync, writeFileSync, readFileSync } from 'fs'
import { execSync } from 'child_process'
import { createHmac } from 'crypto'
const require = createRequire('/home/dream/village-finder/frontend/package.json')
const { chromium } = require('playwright')

const BASE = 'http://localhost:5173'
const DIR = new URL('.', import.meta.url).pathname
const CAP = DIR + 'captures-v3'
mkdirSync(CAP, { recursive: true })

// ── Cast ─────────────────────────────────────────────────────────────────────
const TORREY = '726f5d5b-e1a4-4e0d-aad3-b9c5697d0d1c' // Jon Snow · Sample High School Org
const OWNER = 'f399720d-82a8-43eb-b5cc-69a73c871793' // Ui Tester · DEMO — Sample Diocese + St. Cecilia
const NMB = '6413c8ed-f8d3-42c0-b988-07ce3d395bfc' // North Miami Beach Sr High
const SP = 'ed11f400-69ee-4125-9fb5-4a8ae6b48ff4' // South Plantation High School
const SAMPLE = '3e99c8ee-e81d-432a-85a2-9705648a98ef' // Sample High School
const HOLY = '0151fb28-f059-41ff-b746-4df1d49cf1ea' // DEMO — Holy Trinity School
const CECILIA = '6ff259ef-cb28-4df0-a441-f0841f865094' // St. Cecilia Academy (owner's)

function mintToken(userId) {
  const secret = execSync('docker exec dollaz-api-1 printenv JWT_SECRET').toString().trim()
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const head = b64({ alg: 'HS256', typ: 'JWT' })
  const body = b64({ sub: userId, type: 'access', iat: now, exp: now + 6 * 3600 })
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${sig}`
}
const TOKENS = { torrey: mintToken(TORREY), owner: mintToken(OWNER) }

// ── Storyboard (durations come from the VO) ──────────────────────────────────
const STORY = JSON.parse(readFileSync(DIR + 'scenes-v3.json', 'utf8'))
const floorFor = (id) => {
  const s = STORY.scenes.find((x) => x.id === id)
  const words = (s?.vo ?? '').trim().split(/\s+/).filter(Boolean).length
  return Math.max(s?.minSec ?? 0, words * 0.5) + 4
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── Cursor overlay: a soft pointer that follows the real mouse + click ripples.
const CURSOR_SCRIPT = () => {
  const install = () => {
    if (document.getElementById('__kyro_cursor')) return
    const c = document.createElement('div')
    c.id = '__kyro_cursor'
    Object.assign(c.style, {
      position: 'fixed', left: '0px', top: '0px', width: '22px', height: '22px', zIndex: '2147483647',
      pointerEvents: 'none', transform: 'translate(-3px,-2px)', opacity: '0',
      transition: 'opacity .3s',
    })
    c.innerHTML =
      '<svg viewBox="0 0 24 24" width="22" height="22" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))"><path d="M5 3l14 8.5-6.2 1.3L16 19l-2.6 1.3-3.2-6.2L5 18.4z" fill="#fff" stroke="#16233d" stroke-width="1.4" stroke-linejoin="round"/></svg>'
    document.documentElement.appendChild(c)
    document.addEventListener('mousemove', (e) => {
      c.style.left = e.clientX + 'px'
      c.style.top = e.clientY + 'px'
      c.style.opacity = '1'
    }, true)
    document.addEventListener('mousedown', (e) => {
      const r = document.createElement('div')
      Object.assign(r.style, {
        position: 'fixed', left: e.clientX + 'px', top: e.clientY + 'px', width: '10px', height: '10px',
        marginLeft: '-5px', marginTop: '-5px', borderRadius: '50%', zIndex: '2147483646', pointerEvents: 'none',
        border: '2px solid rgba(251,191,36,.95)', boxShadow: '0 0 0 2px rgba(22,35,61,.35)',
        transition: 'transform .45s ease-out, opacity .45s ease-out', opacity: '1',
      })
      document.documentElement.appendChild(r)
      requestAnimationFrame(() => { r.style.transform = 'scale(4.2)'; r.style.opacity = '0' })
      setTimeout(() => r.remove(), 600)
    }, true)
  }
  if (document.documentElement) install()
  else document.addEventListener('DOMContentLoaded', install)
}

// ── Banner stripper, in-page: trial/2FA bars re-render on route changes, so a
// MutationObserver keeps removing them (same wide-but-SHORT rule as
// stripBanners — page-level wrappers are excluded by the height cap).
const BANNER_SCRIPT = () => {
  const needles = ['days left in your trial', 'two-factor authentication']
  const strip = () => {
    for (const el of document.querySelectorAll('body *')) {
      if (el.children.length > 4) continue
      const t = el.textContent || ''
      if (t.length > 200) continue
      if (needles.some((n) => t.includes(n))) {
        let bar = el
        let chosen = null
        for (let i = 0; i < 6 && bar; i++) {
          const r = bar.getBoundingClientRect()
          if (r.width > innerWidth * 0.8) {
            if (r.height < 170) chosen = bar
            break
          }
          bar = bar.parentElement
        }
        ;(chosen ?? el).remove()
      }
    }
  }
  let t = null
  const arm = () => {
    new MutationObserver(() => { clearTimeout(t); t = setTimeout(strip, 120) }).observe(document.documentElement, { childList: true, subtree: true })
    setTimeout(strip, 50)
  }
  if (document.body) arm()
  else document.addEventListener('DOMContentLoaded', arm)
}

// ── Motion helpers ───────────────────────────────────────────────────────────
const cur = { x: 960, y: 540 }
async function glide(p, x, y, ms = 600) {
  const steps = Math.max(6, Math.round(ms / 25))
  const sx = cur.x, sy = cur.y
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t // ease in-out
    await p.mouse.move(sx + (x - sx) * e, sy + (y - sy) * e)
    await sleep(ms / steps)
  }
  cur.x = x; cur.y = y
}
/** Glide to an element's centre (scrolling it into view first if needed). */
async function hover(p, locator, ms = 650, { timeout = 3000 } = {}) {
  const l = typeof locator === 'string' ? p.locator(locator).first() : locator.first()
  try {
    await l.waitFor({ state: 'visible', timeout })
    await l.scrollIntoViewIfNeeded({ timeout }).catch(() => {})
    const b = await l.boundingBox()
    if (!b) return false
    await glide(p, b.x + Math.min(b.width / 2, 180), b.y + b.height / 2, ms)
    return true
  } catch {
    return false
  }
}
/** Glide to the element and click it. Returns false (and logs) if missing. */
async function click(p, locator, opts = {}) {
  const ok = await hover(p, locator, opts.ms ?? 650, opts)
  if (!ok) { NOTES.push(`missing: ${typeof locator === 'string' ? locator : '<locator>'}`); return false }
  await sleep(opts.pause ?? 180)
  // Mount animations move targets under the pointer — re-read the box and nudge.
  const l = typeof locator === 'string' ? p.locator(locator).first() : locator.first()
  const b = await l.boundingBox().catch(() => null)
  if (b) {
    const tx = b.x + Math.min(b.width / 2, 180), ty = b.y + b.height / 2
    if (Math.abs(tx - cur.x) > 3 || Math.abs(ty - cur.y) > 3) await glide(p, tx, ty, 220)
  }
  await p.mouse.down(); await sleep(70); await p.mouse.up()
  return true
}
/** Human-feeling scroll: many small wheel ticks. */
async function drift(p, px, ms) {
  const steps = Math.max(8, Math.round(ms / 90))
  for (let i = 0; i < steps; i++) {
    await p.mouse.wheel(0, px / steps)
    await sleep(ms / steps)
  }
}
/** Smooth-scroll a text/locator to the upper third of the viewport. */
async function scrollTo(p, locator, ms = 1400, { timeout = 3000 } = {}) {
  const l = typeof locator === 'string' ? p.locator(locator).first() : locator.first()
  try {
    await l.waitFor({ state: 'visible', timeout })
    await l.evaluate((el) => {
      const r = el.getBoundingClientRect()
      window.scrollBy({ top: r.top - 140, behavior: 'smooth' })
    })
    await sleep(ms)
    return true
  } catch {
    NOTES.push(`missing (scroll): ${typeof locator === 'string' ? locator : '<locator>'}`)
    return false
  }
}
/** Keep the frame alive: the pointer wanders in a lazy arc for `ms`. */
async function idle(p, ms) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const left = ms - (Date.now() - t0)
    const x = Math.max(120, Math.min(1800, cur.x + (Math.random() - 0.5) * 260))
    const y = Math.max(120, Math.min(980, cur.y + (Math.random() - 0.5) * 160))
    await glide(p, x, y, Math.min(left, 900 + Math.random() * 600))
    if (left > 900) await sleep(Math.min(left - 900, 300))
  }
}

/** Remove trial/2FA banners — marketing footage carries no chrome a paying
 *  customer wouldn't see. Only ever removes a wide-but-SHORT bar. */
async function stripBanners(p) {
  await p.evaluate(() => {
    const needles = ['days left in your trial', 'two-factor authentication']
    for (const el of document.querySelectorAll('body *')) {
      if (el.children.length > 4) continue
      const t = el.textContent || ''
      if (t.length > 200) continue
      if (needles.some((n) => t.includes(n))) {
        let bar = el
        let chosen = null
        for (let i = 0; i < 6 && bar; i++) {
          const r = bar.getBoundingClientRect()
          if (r.width > innerWidth * 0.8) {
            if (r.height < 170) chosen = bar
            break
          }
          bar = bar.parentElement
        }
        ;(chosen ?? el).remove()
      }
    }
  }).catch(() => {})
}

let NOTES = []
// Monotonic clock for the marks — the wall clock can step backwards under
// WSL2 time-sync, which once stamped a settledAt earlier than the load itself.
let T0 = 0
const at = () => Math.round(((performance.now() - T0) / 1000) * 100) / 100

const nav = async (p, path, settleMs = 1200) => {
  await p.goto(BASE + path, { waitUntil: 'networkidle' })
  await sleep(settleMs)
  await stripBanners(p)
}
/** The first page of a scene: navigate, settle, stamp settledAt, then the
 *  ~2 s hold before the meaningful action begins (after the load flash). */
async function open(p, path, mark, hold = 1200) {
  await nav(p, path)
  mark.settledAt = at()
  await p.mouse.move(cur.x, cur.y)
  await sleep(hold)
}
/** Select the option whose label STARTS with `text` (labels carry facet counts). */
async function pickOption(p, select, text) {
  const value = await select.evaluate((el, t) => {
    const o = [...el.options].find((o) => o.textContent.trim().replace(/^✓\s*/, '').startsWith(t))
    return o ? o.value : null
  }, text).catch(() => null)
  if (value == null) { NOTES.push(`option "${text}" missing`); return false }
  await select.selectOption(value, { timeout: 3000 })
  return true
}
const has = async (p, sel, timeout = 2500) =>
  p.locator(sel).first().waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false)

// ── Scenes ───────────────────────────────────────────────────────────────────
// Per scene: { user, school, scope?, run(p, mark) }. school==null → public/no auth.
const SCENES = {
  // Public landing → hero + KYRO chat card → 'Everything orbits KYRO.' → Sign in.
  c0_site: {
    user: null, school: null,
    async run(p, mark) {
      await p.goto(BASE + '/', { waitUntil: 'networkidle' })
      await sleep(600)
      mark.settledAt = at()
      await glide(p, 1240, 520, 900)
      await sleep(3200) // the chat card types
      await hover(p, 'text=AI Chief of Staff', 900)
      await sleep(1600)
      const orbit = p.locator('text=Everything orbits KYRO.').first()
      await scrollTo(p, orbit, 2600)
      await idle(p, 2600)
      await click(p, 'a:has-text("Sign in")', { ms: 900 })
      await sleep(1000)
      mark.loginAt = at()
      await idle(p, 3200)
    },
  },
  // /app (org scope) → BriefingBand → Open Daily Briefing → the brief modal → Play.
  c0_briefing: {
    user: 'torrey', school: NMB, scope: 'org', morning: true,
    async run(p, mark) {
      await open(p, '/app', mark)
      await hover(p, 'text=need a decision', 900).catch(() => {})
      await idle(p, 2200)
      await click(p, 'button:has-text("Open Daily Briefing")', { ms: 900 })
      mark.briefOpenAt = at()
      await sleep(400)
      // 'KYRO is putting your brief together' → the composed brief.
      const ready = p.locator('text=morning brief').first()
      await ready.waitFor({ state: 'visible', timeout: 45000 }).catch(() => NOTES.push('brief modal title not seen within 45 s'))
      await stripBanners(p)
      mark.briefReadyAt = at()
      await sleep(1200)
      await hover(p, 'text=Leadership view', 700)
      await sleep(1400)
      const played = await click(p, 'button[aria-label="Play the morning brief"]', { ms: 800 })
      if (!played) NOTES.push('in-brief Play button not rendered')
      else NOTES.push('Play clicked, but narration cannot start here: /assistant/tts is 503 (no ElevenLabs key) and headless Chromium has no speech voices — no karaoke highlight/equalizer on camera')
      mark.playAt = at()
      await sleep(3500)
      // Drift the brief's item list (wheel over the modal body).
      await glide(p, 960, 700, 700)
      await drift(p, 380, 2600)
      await idle(p, 2400)
      await drift(p, 380, 2600)
      await idle(p, 3000)
    },
  },
  // ── 1 · Enrollment ──────────────────────────────────────────────────────────
  e1_hero: {
    user: 'torrey', school: NMB,
    async run(p, mark) {
      await open(p, '/enrollment', mark, 1600)
      await hover(p, 'text=Live from your roster', 900)
      await sleep(1400)
      for (const pip of ['text=Waitlist', 'text=New this year', 'text=Support flags', 'text=Withdrawn']) {
        await hover(p, pip, 520); await sleep(650)
      }
      await scrollTo(p, 'text=Where this came from', 1800)
      await idle(p, 2200)
      await scrollTo(p, 'text=Open analytics', 1600)
      await hover(p, 'text=Open analytics', 700)
      await idle(p, 1800)
      // Last beat: the Add-data tab's 'Connect your SIS' card.
      await nav(p, '/enrollment?tab=add')
      mark.addTabAt = at()
      await scrollTo(p, 'text=Connect your SIS', 1400)
      await hover(p, 'text=Connect your SIS', 700)
      await sleep(900)
      await sleep(600)
      await click(p, 'text=Connect a system', { ms: 700 }) // reveals the provider picker (no write)
      await sleep(1600)
      // The providers live in a native <select> (Live connection); cycle it so
      // each name shows on camera. Local UI state only — no connection is made.
      const sel = p.locator('select').filter({ hasText: 'Blackbaud SKY' }).first()
      if (await sel.count()) {
        await hover(p, sel, 700)
        await sleep(1200)
        for (const label of ['OneRoster API', 'FACTS SIS', 'Veracross', 'Blackbaud SKY']) {
          await sel.selectOption({ label }, { timeout: 2000 }).catch(() => NOTES.push(`provider option ${label} missing`))
          await sleep(1300)
        }
        await hover(p, 'button:has-text("Connect Blackbaud")', 700)
        NOTES.push('SIS providers are a native <select> (not chips); cycled OneRoster API → FACTS SIS → Veracross → Blackbaud SKY on camera; server shows "No live SIS configured" (honest)')
      } else NOTES.push('provider select not found after Connect a system')
      await idle(p, 2000)
    },
  },
  e2_trend_grades: {
    user: 'torrey', school: NMB,
    async run(p, mark) {
      await open(p, '/enrollment?tab=analytics&view=trend', mark, 1400)
      await hover(p, 'text=Enrollment vitals', 800)
      await sleep(1200)
      await scrollTo(p, 'text=Headcount over time', 1600)
      await idle(p, 3200)
      await click(p, 'button:has-text("Grades")', { ms: 900 })
      mark.gradesAt = at()
      await sleep(1600)
      await scrollTo(p, 'text=Which grades carry the miss', 1600)
      await idle(p, 3200)
      await scrollTo(p, 'text=Every grade, every year', 1600)
      await idle(p, 3000)
      await scrollTo(p, 'text=Every grade, in figures', 1600)
      await idle(p, 2600)
    },
  },
  e3_cohorts_who: {
    user: 'torrey', school: NMB,
    async run(p, mark) {
      await open(p, '/enrollment?tab=analytics&view=cohorts', mark, 1400)
      await scrollTo(p, 'text=Cohort size progression', 1400)
      await hover(p, 'text=Cohort length', 700)
      await sleep(900)
      await click(p, 'button:has-text("3 years")', { ms: 700 })
      mark.threeYearsAt = at()
      await idle(p, 3200)
      await click(p, 'button:has-text("Who\'s here")', { ms: 900 })
      mark.whoAt = at()
      await sleep(1400)
      await scrollTo(p, 'text=Demographic mix', 1400)
      await click(p, '[aria-label="Demographic dimension"] button:has-text("Gender")', { ms: 700 })
      await sleep(2000)
      await click(p, '[aria-label="Demographic dimension"] button:has-text("Ethnicity")', { ms: 700 })
      await sleep(2000)
      await scrollTo(p, 'text=Support needs', 1400)
      for (const t of ['text=ISP', 'text=504', 'text=English learner', 'text=Any support flag']) {
        await hover(p, t, 480); await sleep(450)
      }
      await idle(p, 2200)
    },
  },
  e4_filters: {
    user: 'torrey', school: NMB,
    async run(p, mark) {
      await open(p, '/enrollment?tab=analytics&view=who', mark, 1200)
      await scrollTo(p, 'text=Explore the register', 1600)
      await sleep(600)
      const grade = p.locator('select[aria-label="Add a grade filter"]').first()
      await hover(p, grade, 700)
      await pickOption(p, grade, 'Grade 9')
      mark.gradeAt = at()
      await idle(p, 2600)
      const race = p.locator('select[aria-label="Add a race filter"]').first()
      await hover(p, race, 700)
      await pickOption(p, race, 'Hispanic or Latino')
      mark.raceAt = at()
      await idle(p, 2600)
      await click(p, 'section[aria-label="Roster analytics"] button:has-text("ISP"), button[aria-pressed]:has-text("ISP")', { ms: 700 })
      mark.ispAt = at()
      await idle(p, 1800)
      await drift(p, 420, 2200)
      await idle(p, 2400)
      await click(p, 'button:has-text("Clear all")', { ms: 900 })
      mark.clearAt = at()
      await idle(p, 2200)
    },
  },
  // ── 2 · Academics ───────────────────────────────────────────────────────────
  a1_overview: {
    user: 'torrey', school: NMB,
    async run(p, mark) {
      await open(p, '/academics', mark, 1600)
      await hover(p, 'text=measured against its peers', 900)
      await sleep(1200)
      for (const t of ['text=Average', 'text=Rank', 'text=Years on file', 'text=Lesson plans']) {
        await hover(p, t, 480); await sleep(520)
      }
      await scrollTo(p, 'text=The read', 1600)
      for (const t of ['text=Widest gap', 'text=Trend', 'text=Participation']) {
        await hover(p, t, 520); await sleep(700)
      }
      await idle(p, 2000)
      await scrollTo(p, 'text=Open the analysis', 1600)
      await hover(p, 'text=Where this school stands', 800)
      await idle(p, 2600)
    },
  },
  a2_standing: {
    user: 'torrey', school: NMB,
    async run(p, mark) {
      await open(p, '/academics?tab=analytics', mark, 1600)
      // NMB defaults to TerraNova, so the toggle runs TerraNova → ACT → back.
      await hover(p, 'button:has-text("TerraNova")', 800)
      await sleep(900)
      await click(p, 'button:has-text("ACT")', { ms: 600 })
      mark.actAt = at()
      await sleep(2600)
      await click(p, 'button:has-text("TerraNova")', { ms: 600 })
      mark.terranovaAt = at()
      await sleep(1800)
      await hover(p, 'text=Hide peer names', 700)
      await sleep(900)
      await scrollTo(p, 'text=Rank in network', 1400)
      await idle(p, 1800)
      await scrollTo(p, 'text=Every school ·', 1500)
      await idle(p, 3000)
      await scrollTo(p, 'text=Where the gap actually is', 1500)
      await idle(p, 3000)
      await scrollTo(p, 'text=Where instruction is landing', 1500)
      await idle(p, 3000)
    },
  },
  a3_time_cohorts: {
    user: 'torrey', school: NMB,
    async run(p, mark) {
      await open(p, '/academics?tab=analytics&view=time', mark, 1400)
      await scrollTo(p, 'text=Are we moving', 1400)
      await idle(p, 3000)
      await scrollTo(p, 'text=Growth against achievement', 1500)
      await idle(p, 3000)
      await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
      await sleep(1000)
      await click(p, 'button:has-text("Cohorts")', { ms: 900 })
      mark.cohortsAt = at()
      await sleep(2200)
      await scrollTo(p, '[aria-label="Cohort length"]', 1200)
      await click(p, 'button:has-text("3 years")', { ms: 700 })
      mark.threeYearsAt = at()
      await sleep(2200)
      await click(p, 'text=Compare with the other schools', { ms: 800 })
      mark.peersAt = at()
      await sleep(2600)
      await scrollTo(p, 'text=The same students', 1500)
      await idle(p, 3200)
      await scrollTo(p, 'text=Net change by cohort', 1500)
      await idle(p, 3000)
    },
  },
  a4_network: {
    user: 'torrey', school: NMB,
    async run(p, mark) {
      await open(p, '/academics/network', mark, 1600)
      await hover(p, 'text=school by school', 900)
      await sleep(1000)
      for (const t of ['text=Network average', 'text=Students tested']) { await hover(p, t, 520); await sleep(600) }
      const grade = p.locator('select[aria-label="Grade"]').first()
      await hover(p, grade, 700)
      await grade.selectOption({ label: 'Grade 11' }, { timeout: 3000 }).catch(() => NOTES.push('Grade 11 option missing on network page'))
      mark.grade11At = at()
      await sleep(1800)
      await scrollTo(p, 'text=Every school ·', 1500)
      await idle(p, 3400)
      await scrollTo(p, 'text=Who moved, and which way', 1500)
      await idle(p, 3000)
    },
  },
  // ── 3 · Accreditation (owner token · DEMO — Holy Trinity) ───────────────────
  r1_hero: {
    user: 'owner', school: HOLY,
    async run(p, mark) {
      await open(p, '/accreditation', mark, 1800)
      await hover(p, 'text=from Accredited', 900)
      await sleep(1600)
      for (const t of ['text=Documented', 'text=Defensible', 'text=Domain coverage']) { await hover(p, t, 560); await sleep(800) }
      // Target pills — HOVER only. Selecting one persists targetIndex on the
      // school's cycle profile (a data write outside the authorised Journey
      // write), so the pill is shown, not pressed.
      await hover(p, 'button:has-text("Accredited with Merit")', 800)
      NOTES.push('target pill "Accredited with Merit · 320" hovered, NOT clicked (selecting persists targetIndex — a write)')
      await sleep(1800)
      await hover(p, 'text=Fastest path', 700)
      await idle(p, 2600)
      await scrollTo(p, 'text=Recorded readiness', 1600)
      await idle(p, 3200)
      await scrollTo(p, 'text=Assurances', 1500)
      await idle(p, 3400)
    },
  },
  r2_frameworks: {
    user: 'owner', school: HOLY,
    async run(p, mark) {
      await open(p, '/accreditation', mark, 1400)
      await click(p, 'button:has-text("Frameworks")', { ms: 900 })
      mark.modalAt = at()
      await sleep(1800)
      await hover(p, 'text=Also known as', 700)
      await sleep(1400)
      // Scroll the catalog inside the modal.
      const modal = p.locator('[role="dialog"], .fixed.inset-0').last()
      const b = await modal.boundingBox().catch(() => null)
      if (b) await glide(p, b.x + b.width / 2, b.y + b.height / 2, 600)
      await drift(p, 520, 3200)
      await idle(p, 1400)
      await drift(p, 520, 3000)
      await hover(p, 'text=NCPSA', 800)
      await sleep(2400)
      await p.keyboard.press('Escape')
      mark.escapeAt = at()
      await idle(p, 2000)
    },
  },
  // The ONE authorised write: last Engagement Review date via 'Map my journey'.
  r3_journey: {
    user: 'owner', school: HOLY,
    async run(p, mark) {
      await open(p, '/accreditation?center=journey', mark, 1400)
      await hover(p, 'text=When was your last Engagement Review', 900)
      await sleep(1200)
      const trigger = p.locator('button[aria-label="Last Engagement Review date"]').first()
      await click(p, trigger, { ms: 800 })
      await sleep(700)
      // Drill days → months → years, then pick 2022 · Apr · 12.
      await click(p, '[role="dialog"][aria-label="Choose a date"] button[aria-label="Choose month and year"]', { ms: 600 })
      await sleep(500)
      await click(p, '[role="dialog"][aria-label="Choose a date"] button[aria-label="Choose year"]', { ms: 600 })
      await sleep(500)
      await click(p, '[role="dialog"][aria-label="Choose a date"] button:text-is("2022")', { ms: 600 })
      await sleep(500)
      await click(p, '[role="dialog"][aria-label="Choose a date"] button:has-text("Apr")', { ms: 600 })
      await sleep(500)
      await click(p, '[role="dialog"][aria-label="Choose a date"] button:text-is("12")', { ms: 600 })
      await sleep(900)
      mark.dateAt = at()
      const picked = await trigger.innerText().catch(() => '')
      mark.pickedLabel = picked
      if (!/2022/.test(picked) || !/apr/i.test(picked)) {
        NOTES.push(`date pick did not land on Apr 2022 (trigger reads "${picked}") — Map my journey NOT pressed`)
        await idle(p, 4000)
        return
      }
      mark.write = { lastReviewDate: '2022-04-12', nextReviewDate: null, termYears: 6, school: 'DEMO — Holy Trinity School', schoolId: HOLY }
      await click(p, 'button:has-text("Map my journey")', { ms: 900 })
      mark.mapAt = at()
      await p.locator('text=You are here').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => NOTES.push('"You are here" not seen after Map my journey'))
      mark.cycleAt = at()
      await sleep(1600)
      await hover(p, 'text=You are here', 900)
      await sleep(1600)
      for (const t of ['text=Findings shared', 'text=Implement', 'text=Progress report', 'text=Self-assessment', 'text=Evidence freeze']) {
        await hover(p, t, 520); await sleep(650)
      }
      await hover(p, 'text=Next up', 700)
      await sleep(1600)
      await scrollTo(p, 'text=Milestones', 1500)
      await idle(p, 3600)
    },
  },
  r4_standard: {
    user: 'owner', school: HOLY,
    async run(p, mark) {
      await open(p, '/accreditation?center=standards', mark, 1400)
      await scrollTo(p, 'table thead', 1200)
      if (!(await has(p, 'text=Scored, no evidence', 1500))) NOTES.push('"Scored, no evidence · N" pill is a filter chip that only renders with an active ?rule filter — not shown')
      for (const t of ['th:has-text("Rating")', 'th:has-text("Coverage")', 'th:has-text("Risk")', 'th:has-text("Owner")']) { await hover(p, t, 420); await sleep(380) }
      await sleep(600)
      // Click a leaf standard's title (COG-1, catalog-linked) → StandardImprovePanel.
      const row = p.locator('table tbody tr').filter({ hasText: 'Leaders cultivate' }).first()
      const titleBtn = row.locator('button:not([aria-label])').first()
      const opened = await click(p, titleBtn, { ms: 900 })
      mark.improveAt = at()
      await sleep(900)
      if (await has(p, 'text=What raises this standard', 4000)) {
        for (const t of ['text=Score it against the rubric', 'text=Attach evidence', 'text=Plan the work']) {
          await hover(p, t, 600); await sleep(900)
        }
        await sleep(600)
        await click(p, 'button[aria-label="Close"]', { ms: 700 })
      } else NOTES.push(`StandardImprovePanel did not open (clicked=${opened})`)
      await sleep(800)
      // Chevron → expanded row → flip to 'What this means'.
      const chevron = p.locator('table button[aria-label="Expand evidence for COG-1"]').first()
      await click(p, chevron, { ms: 800 })
      mark.expandAt = at()
      await sleep(1200)
      await click(p, 'button:has-text("What this means")', { ms: 800 })
      mark.explainAt = at()
      await sleep(1400)
      await scrollTo(p, 'text=What good evidence looks like', 1400)
      await hover(p, 'text=Your rubric position', 700)
      await idle(p, 2600)
      // Last beat: the mock visit.
      await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
      await sleep(800)
      await click(p, 'a:has-text("Mock visit")', { ms: 900 })
      mark.visitAt = at()
      await sleep(1600)
      await stripBanners(p)
      await hover(p, 'text=The mock visit', 800)
      await sleep(1000)
      await drift(p, 520, 2800)
      await idle(p, 2600)
    },
  },
  // ── 4 · Finance ─────────────────────────────────────────────────────────────
  f1_statements: {
    user: 'torrey', school: NMB,
    async run(p, mark) {
      await open(p, '/finance', mark, 1400)
      for (const t of ['text=Statements', 'text=Analytics', 'text=Budget', 'text=Cash Forecast', 'text=Reports', 'text=Readiness']) {
        await hover(p, `h3:has-text("${t.slice(5)}"), ${t}`, 420); await sleep(380)
      }
      await click(p, 'text=View statements', { ms: 900 }) // the tile's overlay link catches the click
      mark.statementsAt = at()
      await sleep(1600)
      await stripBanners(p)
      await hover(p, 'text=Saved periods', 700)
      await sleep(900)
      // FY 2026 is the period with saved statements (FY 2027 is the default, thin).
      if (await click(p, 'button:has-text("FY 2026")', { ms: 700, timeout: 2000 })) { mark.fy2026At = at(); await sleep(1800) }
      for (const t of ['text=Prior Year', 'text=Audited']) { await hover(p, t, 480); await sleep(500) }
      await click(p, 'button:has-text("Statement of Financial Position")', { ms: 900 })
      mark.sfpAt = at()
      await idle(p, 2600)
      await click(p, 'button:has-text("Statement of Cash Flows")', { ms: 900 })
      mark.scfAt = at()
      await idle(p, 2400)
      await nav(p, '/budget')
      mark.budgetAt = at()
      await sleep(600)
      await click(p, 'button:has-text("FY 2026")', { ms: 700, timeout: 2000 }) // the seeded budget lives on FY 2026
      await sleep(1600)
      await click(p, 'button:has-text("Budget vs. Actual")', { ms: 900 })
      mark.bvaAt = at()
      await idle(p, 2800)
      await click(p, 'button:has-text("Organizational Roll-up")', { ms: 900 })
      mark.rollupAt = at()
      await idle(p, 3200)
    },
  },
  f2_analytics: {
    user: 'torrey', school: SAMPLE,
    async run(p, mark) {
      await open(p, '/analytics', mark, 1600)
      for (const t of ['button:has-text("My school")', 'button:has-text("Compare")', 'button:has-text("All schools")', 'button:has-text("Peers")']) {
        await hover(p, t, 420); await sleep(380)
      }
      await idle(p, 1600)
      await click(p, 'button:has-text("Charts")', { ms: 800 })
      mark.chartsAt = at()
      await sleep(1600)
      await scrollTo(p, "text=How's the money", 1300)
      await idle(p, 2400)
      await drift(p, 520, 2400)
      await idle(p, 1600)
      await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
      await sleep(900)
      await click(p, 'button:has-text("Scorecard")', { ms: 800 })
      mark.scorecardAt = at()
      await sleep(1400)
      await drift(p, 360, 2000)
      await idle(p, 2200)
      await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
      await sleep(900)
      await click(p, 'button:has-text("All schools")', { ms: 800 })
      mark.orgAt = at()
      await sleep(1800)
      await scrollTo(p, "text=Who drives the system", 1300)
      await idle(p, 2400)
      await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
      await sleep(800)
      await click(p, 'button:has-text("Charts")', { ms: 800 }) // the BarRace lives on Charts at All-schools scope
      mark.orgChartsAt = at()
      await sleep(1400)
      await scrollTo(p, 'text=the race', 1400)
      await click(p, '#chart-race button:has-text("Play"), button:has-text("Play")', { ms: 800 }) // run the BarRace
      mark.raceAt = at()
      await idle(p, 6500)
      await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
      await sleep(900)
      await click(p, 'button:has-text("Peers")', { ms: 800 })
      mark.peersAt = at()
      await sleep(1600)
      await hover(p, 'text=Match on', 700)
      for (const t of ['Size', 'County', 'District', 'Type', 'Grade']) { await hover(p, `button:has-text("${t}")`, 400); await sleep(380) }
      await idle(p, 2600)
    },
  },
  f3_cash: {
    user: 'torrey', school: SP,
    async run(p, mark) {
      await open(p, '/cash-flow', mark, 1400)
      if (await has(p, 'button:has-text("Build forecast")', 1500)) {
        await click(p, 'button:has-text("Build forecast")', { ms: 900 })
        mark.buildAt = at()
        NOTES.push('Build forecast pressed — this freezes a cash_projection_runs row (storyboard-directed write)')
      } else {
        NOTES.push('forecast already frozen for South Plantation (2 archived runs) — hero renders directly, no Build forecast button and NO new run written; showed the Live from QuickBooks / Use QuickBooks balance chips instead')
        await hover(p, 'text=Live from QuickBooks', 800)
        await sleep(900)
        await hover(p, 'text=Use QuickBooks balance', 700)
        await sleep(900)
      }
      await p.locator('text=When does cash run low').first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => NOTES.push('"When does cash run low?" hero not seen'))
      mark.forecastAt = at()
      await sleep(1400)
      for (const t of ['text=Available operating cash', 'text=Lowest projected', 'text=Covered through', 'text=Ending balance']) {
        await hover(p, t, 480); await sleep(520)
      }
      await click(p, 'button:has-text("3M")', { ms: 700 })
      mark.h3mAt = at()
      await sleep(2400)
      await click(p, 'button:has-text("12M")', { ms: 700 })
      mark.h12mAt = at()
      await sleep(2200)
      await scrollTo(p, 'h2:has-text("Why")', 1400)
      await idle(p, 2400)
      await drift(p, 460, 2200)
      await idle(p, 1800)
      await click(p, 'button:has-text("Workbook")', { ms: 900 })
      mark.workbookAt = at()
      await sleep(1200)
      await drift(p, 360, 2000)
      await idle(p, 2600)
    },
  },
  f4_board: {
    user: 'torrey', school: SAMPLE,
    async run(p, mark) {
      await open(p, '/reports', mark, 1400)
      await click(p, '#reports-board-card', { ms: 900 })
      mark.wizardAt = at()
      await sleep(800)
      await stripBanners(p)
      await idle(p, 2200) // step 1: period + message
      await click(p, 'button:has-text("Confirm financials")', { ms: 900 })
      mark.confirmAt = at()
      await sleep(800)
      await stripBanners(p)
      await drift(p, 360, 2200)
      await idle(p, 2000) // step 2: the pulled financials
      await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
      await sleep(700)
      await click(p, 'button:has-text("Review variance")', { ms: 900 })
      mark.varianceAt = at()
      await sleep(800)
      await stripBanners(p)
      await idle(p, 2400) // step 3: variance table
      await drift(p, 760, 2600) // down to the MD&A editor
      await sleep(600)
      const aiBtn = p.locator('button:has-text("Draft with AI"), button:has-text("Regenerate")').first()
      await click(p, aiBtn, { ms: 900 })
      mark.draftAt = at()
      await sleep(400)
      let drafting = true
      for (let i = 0; i < 60 && drafting; i++) {
        await sleep(1000)
        drafting = (await p.locator('text=Drafting…').count()) > 0
      }
      mark.draftedAt = at()
      await idle(p, 3600) // read the drafted narrative
      // The rail step labels are also buttons — the bottom nav button is the LAST match.
      await click(p, p.locator('button:has-text("Branding")').last(), { ms: 900 })
      mark.brandingAt = at()
      await sleep(2200)
      await click(p, p.locator('button:has-text("Generate")').last(), { ms: 900 })
      mark.generateAt = at()
      await sleep(1000)
      await stripBanners(p)
      await hover(p, 'text=Generate the packet', 700)
      await idle(p, 3600) // step 5: the checklist (NOT pressed 'Generate & print')
    },
  },
  // ── 5 · everything else ─────────────────────────────────────────────────────
  x1_montage: {
    user: 'owner', school: CECILIA, morning: true,
    async run(p, mark) {
      await open(p, '/app', mark, 800)
      await idle(p, 3400)
      for (const path of ['/governance', '/facilities', '/advancement', '/hr', '/strategy']) {
        await nav(p, path, 900)
        mark[path.slice(1) + 'At'] = at()
        await glide(p, 700 + Math.random() * 500, 420 + Math.random() * 200, 700)
        await drift(p, 220, 1500)
        await idle(p, 1500)
      }
      await idle(p, 1600)
    },
  },
  // KYRO Studio: a real ask; the build splices out thinking time via the marks.
  x2_penny: {
    user: 'torrey', school: SAMPLE,
    async run(p, mark) {
      await open(p, '/penny', mark, 1600)
      await hover(p, 'text=What should we knock out today', 800)
      await sleep(900)
      for (const t of ['text=Get something done', 'text=Guided workflows', 'text=Your action inbox', 'text=Hands-free']) {
        await hover(p, t, 520); await sleep(600)
      }
      const ta = p.locator('textarea').first()
      await click(p, ta, { ms: 800 })
      await p.keyboard.type('Explain our revenue mix and show me the chart', { delay: 28 })
      await sleep(700)
      mark.enter = at()
      await p.keyboard.press('Enter')
      let chart = false
      for (let i = 0; i < 60 && !chart; i++) {
        await sleep(1000)
        // Case-sensitive: `text=Revenue Mix` also matched the user's own lowercase ask.
        chart = (await p.locator('text=/\\bRevenue Mix\\b/').count()) > 0
      }
      mark.confirm = at() // the answer (with the inline Revenue Mix chart) is on screen
      if (!chart) NOTES.push('Revenue Mix chart not seen within 60 s')
      await sleep(1600)
      await drift(p, 320, 1800) // bring the donut into frame
      await idle(p, 5000)
      await drift(p, 240, 1600)
      await idle(p, 3000)
    },
  },
  x3_org: {
    user: 'torrey', school: NMB, morning: true,
    async run(p, mark) {
      await open(p, '/app', mark, 1200)
      await click(p, 'button[aria-label^="Viewing "]', { ms: 900 })
      mark.switcherAt = at()
      await sleep(1200)
      await click(p, 'button:has-text("Whole organization")', { ms: 900 })
      mark.orgAt = at()
      await sleep(1800)
      await stripBanners(p)
      await hover(p, 'text=Across the network', 800)
      await idle(p, 1800)
      await scrollTo(p, 'text=Jump into a school', 1400)
      await idle(p, 2200)
      await scrollTo(p, 'text=Organization KPIs', 1400)
      await idle(p, 1600)
      await click(p, '[role="tab"]:has-text("Schools")', { ms: 800 })
      mark.schoolsAt = at()
      await idle(p, 2600)
      await click(p, '[role="tab"]:has-text("Needs attention")', { ms: 800 })
      mark.attentionAt = at()
      await idle(p, 2600)
      await scrollTo(p, 'text=Jump into a school', 1200)
      await click(p, 'button[aria-label^="Switch to North Miami Beach"]', { ms: 900 })
      mark.drillAt = at()
      await sleep(1400)
      await stripBanners(p)
      await idle(p, 3000)
    },
  },
  // ── close ───────────────────────────────────────────────────────────────────
  z1_trust: {
    user: null, school: null,
    async run(p, mark) {
      await p.goto('file://' + DIR + 'assets/trust.html')
      mark.settledAt = at()
      await sleep(14000)
    },
  },
  z2_end: {
    user: null, school: null,
    async run(p, mark) {
      await p.goto('file://' + DIR + 'assets/endcard.html')
      mark.settledAt = at()
      await sleep(15000)
    },
  },
}

// ── Runner ───────────────────────────────────────────────────────────────────
const wanted = process.argv.slice(2)
const ids = wanted.length ? wanted : Object.keys(SCENES)
const browser = await chromium.launch()
for (const id of ids) {
  const scene = SCENES[id]
  if (!scene) { console.error('unknown scene', id); continue }
  NOTES = []
  cur.x = 960; cur.y = 540
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: CAP, size: { width: 1920, height: 1080 } },
  })
  const p = await ctx.newPage()
  if (scene.school) {
    await p.addInitScript(([t, s, sc]) => {
      localStorage.setItem('finrep_access_token', t)
      localStorage.setItem('finrep_active_school_id', s)
      if (sc) localStorage.setItem('finrep_scope_mode', sc)
      else localStorage.removeItem('finrep_scope_mode')
    }, [TOKENS[scene.user], scene.school, scene.scope ?? null])
  }
  if (scene.school || id === 'c0_site') await p.addInitScript(CURSOR_SCRIPT)
  if (scene.school) await p.addInitScript(BANNER_SCRIPT)
  // The greeting is `new Date().getHours()` (HomeBriefing / tileRegistry), so
  // wherever it is on screen, make the hour read 8 → 'Good morning'. Only
  // getHours is touched (a frozen clock stalled animations and blanked /app).
  if (scene.morning) {
    await p.addInitScript(() => { Date.prototype.getHours = function () { return 8 } })
  }
  const floor = floorFor(id)
  const mark = { floorSec: floor }
  if (scene.morning) mark.clock = 'Date.prototype.getHours overridden to 8 in-page so the greeting reads Good morning (clock otherwise real)'
  T0 = performance.now()
  try {
    await scene.run(p, mark)
    // Keep the frame alive until the VO-derived floor is met.
    const remain = floor * 1000 - (performance.now() - T0)
    if (remain > 0) {
      if (scene.school) await idle(p, remain)
      else await sleep(remain)
    }
    mark.actionEndAt = at()
    mark.notes = NOTES
    const video = p.video()
    await ctx.close() // finalizes the webm
    renameSync(await video.path(), `${CAP}/${id}.webm`)
    writeFileSync(`${CAP}/${id}.json`, JSON.stringify(mark, null, 2))
    console.log('captured', id, `${mark.actionEndAt}s (floor ${floor.toFixed(1)}s)`, NOTES.length ? NOTES : '')
  } catch (e) {
    await ctx.close().catch(() => {})
    console.error('FAILED', id, e.message)
  }
}
await browser.close()
