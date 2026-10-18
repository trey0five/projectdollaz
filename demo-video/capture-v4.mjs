#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// KYRO demo v4 — film every app scene of the storyboard
// (~/.cache/kyro-demo-v4/rev/STORYBOARD.md) from the live :5173 app as the
// fictional demo user Morgan (Bayview Catholic Schools), into
//   captures-v4/<scene>.webm   1920×1080, 30 fps CFR (VP9)
//   captures-v4/<scene>.json   settledAt + named marks + splice marks + take notes
//   captures-v4/contact/<scene>.png   contact sheet (first / settled / marks / last)
//
//   node capture-v4.mjs --dry  [scene …]   dry run → captures-v4/dry/… (one-take
//                                           writes are NEVER pressed in a dry run)
//   node capture-v4.mjs        [scene …]   final takes in the storyboard's filming order
//   node capture-v4.mjs --list              print the filming order
//
// Built from capture-v3.mjs, with these differences:
//   • NO token minting of any kind. Morgan logs in ONCE per run through the real
//     /login form (password from the gitignored .env.capture.local, never printed);
//     the session lives only in the in-memory browser context, which every scene
//     reuses (one page per scene). No storageState / auth file is ever written.
//     A 429 from the login rate limit (10/min) is waited out, never filmed.
//   • A guard aborts any API request for a school or organization outside the
//     Bayview demo network (ids from seed-v4/out/structure.json) and fails the take.
//   • The recorder is a CDP screencast (JPEG q92, ~40 fps) re-timed onto a 30 fps
//     constant-rate VP9 webm — crisper text than Playwright's 1 Mbit/s VP8 recorder.
//   • Banners: the trial bar ("N days left in your trial · SUBSCRIBE") and the MFA
//     nag ("Protect your account") are hidden on every page (MutationObserver), the
//     MFA nag also via its own "don't show again" preference; every second of every
//     take is checked for either text being visible, and a hit fails the take.
//   • Clock: Date.prototype.getHours → 8 (greeting reads "Good morning"), and the
//     whole wall clock pinned to the film's day, Oct 17 2026, still flowing (PIN:
//     browser Date offset + the API's GET JSON re-dated when its UTC day differs).
//     NEVER page.clock (a frozen clock stalls the Scholar's ticker).
//   • /api/schools/*/assistant/tts is answered with a silent mp3 whose length follows
//     the text, so the narration player really plays (the Scholar talks) without
//     any ElevenLabs key in the dev API.  SpeechRecognition is stubbed (S9) so the
//     Studio's hands-free mic really listens and "hears" a scripted sentence.
//   • The cartoon Scholar is never hidden; a shot is "settled" only once the owl is
//     on screen and perched (landed). Its state timeline is logged per take.
//   • reset-v4.mjs runs before/after each scene that writes (storyboard §E order).
//   • Live-AI scenes retry up to 5 takes; every take is kept under takes/, the best
//     is promoted to <scene>.webm.
// ─────────────────────────────────────────────────────────────────────────────
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const require = createRequire('/home/dream/village-finder/package.json')
const { chromium } = require('playwright')

export const BASE = 'http://localhost:5173'
export const DIR = path.dirname(fileURLToPath(import.meta.url))
const SEED = path.join(DIR, 'seed-v4')
const FF = fs.existsSync(path.join(os.homedir(), 'bin/ffmpeg')) ? path.join(os.homedir(), 'bin/ffmpeg') : 'ffmpeg'
const FP = fs.existsSync(path.join(os.homedir(), 'bin/ffprobe')) ? path.join(os.homedir(), 'bin/ffprobe') : 'ffprobe'
const FILES = path.join(DIR, 'assets/v4-files')

// ── The demo network (never anything else) ───────────────────────────────────
const man = JSON.parse(fs.readFileSync(path.join(SEED, 'out/structure.json'), 'utf8'))
export const ORG = man.org.id
export const SCH = Object.fromEntries(man.schools.map((s) => [s.key, s.id]))
export const SCHOOL_NAME = Object.fromEntries(man.schools.map((s) => [s.key, s.name]))
const DEMO_IDS = new Set(man.schools.map((s) => s.id))
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(DIR, '.env.capture.local'), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
)

// Scene tempo: the runner sets TEMPO per scene (scene.tempo) so a scene's holds and
// cursor moves shrink or stretch to fit its narration (dry-run fit → tempo).
export const TIMING = { tempo: 1 }
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms * TIMING.tempo))
const rawSleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── In-page scripts (installed on the context, so every scene page has them) ──
// Cursor with click ripples (v3).
const CURSOR_SCRIPT = () => {
  const install = () => {
    if (document.getElementById('__kyro_cursor')) return
    const c = document.createElement('div')
    c.id = '__kyro_cursor'
    Object.assign(c.style, {
      position: 'fixed', left: '0px', top: '0px', width: '22px', height: '22px', zIndex: '2147483647',
      pointerEvents: 'none', transform: 'translate(-3px,-2px)', opacity: '0', transition: 'opacity .3s',
    })
    c.innerHTML =
      '<svg viewBox="0 0 24 24" width="22" height="22" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))"><path d="M5 3l14 8.5-6.2 1.3L16 19l-2.6 1.3-3.2-6.2L5 18.4z" fill="#fff" stroke="#16233d" stroke-width="1.4" stroke-linejoin="round"/></svg>'
    document.documentElement.appendChild(c)
    const last = window.__kyroCur
    if (last) {
      c.style.left = last.x + 'px'
      c.style.top = last.y + 'px'
      c.style.opacity = '1'
    }
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

// ── The film's day (review fix, 2026-10-18) ──────────────────────────────────
// Every take of the film reads "as of Oct 17, 2026". A re-film after UTC midnight
// read "Oct 18" (e1/e6) and "in 9d" (x1), because the getHours stub moved only the
// greeting. Now the WHOLE wall clock is pinned to the film's day, with time still
// flowing (never a frozen clock — the Scholar's ticker needs it):
//   • browser: Date is a Proxy whose now()/new Date() run at a fixed offset, so the
//     page's own "today" is PIN_AT + elapsed (performance.now is untouched);
//   • server: the API computes "today" from its own UTC clock (the live roster's
//     observedOn, daysUntil* on governance/facilities/HR …). Its GET JSON is
//     re-dated on the way in when (and only when) the API's UTC day differs from
//     the film's: date strings equal to the API's today become the film's day, and
//     day counts relative to today shift by the same whole number of days. Every
//     rewrite is counted per key into the take json (PIN.hits) for audit.
// KYRO_PIN_AT overrides the instant; KYRO_PIN_AT=off disables the pin.
const PIN_AT_ISO = process.env.KYRO_PIN_AT || '2026-10-17T14:00:00-04:00'
export const PIN = {
  on: PIN_AT_ISO !== 'off',
  day: PIN_AT_ISO === 'off' ? null : new Date(Date.parse(PIN_AT_ISO)).toISOString().slice(0, 10),
  offsetMs: PIN_AT_ISO === 'off' ? 0 : Date.parse(PIN_AT_ISO) - Date.now(),
  hits: {},
}
const DAY_MS = 86400000
/** Whole days the API's UTC "today" is ahead of the film's day (0 = nothing to do). */
const pinShift = () => (PIN.on ? Math.round((Date.parse(new Date().toISOString().slice(0, 10)) - Date.parse(PIN.day)) / DAY_MS) : 0)
// Day counts measured FROM today to a later date grow as today moves back; counts
// measured from an earlier date TO today shrink.
const UNTIL_KEY = /^daysUntil|^daysLeft$|^daysToGo$|^daysRemaining$/i
const SINCE_KEY = /^days(Overdue|PastDue|Past|Late|Outstanding|Since|Ago|Open|Old|Stale)$|DaysOverdue$|DaysPastDue$|OverdueDays$|LapsedDays$|^ageDays$/i
function pinWalk(node, today, shift, hits) {
  if (Array.isArray(node)) { node.forEach((v, i) => { node[i] = pinWalk(v, today, shift, hits) }); return node }
  if (node && typeof node === 'object') {
    for (const k of Object.keys(node)) {
      const v = node[k]
      if (typeof v === 'string' && (v === today || v.startsWith(today + 'T'))) {
        node[k] = PIN.day + v.slice(10); hits[k] = (hits[k] || 0) + 1
      } else if (typeof v === 'number' && Number.isInteger(v) && UNTIL_KEY.test(k)) {
        node[k] = v + shift; hits[k] = (hits[k] || 0) + 1
      } else if (typeof v === 'number' && Number.isInteger(v) && v > 0 && SINCE_KEY.test(k)) {
        // 0 means "none" (oldestOverdueDays with nothing overdue) — never shifted.
        node[k] = Math.max(0, v - shift); hits[k] = (hits[k] || 0) + 1
      } else if (v && typeof v === 'object') pinWalk(v, today, shift, hits)
    }
  }
  return node
}

// Browser half of the pin (see above). Installed before CHROME_SCRIPT; the getHours
// stub there lives on Date.prototype, which the Proxy shares, so it still applies.
const CLOCK_SCRIPT = (off) => {
  if (!off) return
  const R = Date
  const now = () => R.now() + off
  const P = new Proxy(R, {
    construct(t, args, nt) { return Reflect.construct(t, args.length ? args : [now()], nt === P ? t : nt) },
    apply() { return new R(now()).toString() },
    get(t, p) { return p === 'now' ? now : Reflect.get(t, p, t) },
  })
  window.Date = P
}

// Banner hider + clock + print no-op + owl state log + SpeechRecognition stub.
const CHROME_SCRIPT = () => {
  // The MFA nag's own "Don't show this again" preference (in-memory browser only).
  try { localStorage.setItem('kyro_mfa_nudge', 'never') } catch {}
  // Greeting reads "Good morning": only getHours is touched (never a frozen clock).
  Date.prototype.getHours = function () { return 8 }
  window.print = () => {}
  // Trial bar + MFA nag: hidden (display:none, not removed — React keeps its nodes).
  const NEEDLES = ['left in your trial', 'You are on a free trial', 'Protect your account', 'two-factor authentication']
  const hide = () => {
    if (!document.body) return
    const w = document.evaluate(NEEDLES.map((n) => `//*[contains(text(), "${n}")]`).join(' | '), document.body, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null)
    for (let i = 0; i < w.snapshotLength; i++) {
      const el = w.snapshotItem(i)
      // The two bars are `.no-print.border-b` strips (BillingBanner, MfaNudge). Hide
      // exactly that strip — never a layout wrapper (a wrapper of a still-loading
      // page can be short and wide, which once blanked the whole content column).
      let target = el.closest('.no-print.border-b')
      if (!target) {
        target = el
        for (let k = 0; k < 3 && target.parentElement; k++) {
          const par = target.parentElement
          if ((par.textContent || '').length > 140 || par === document.body || par.tagName === 'MAIN') break
          target = par
        }
      }
      const r = target.getBoundingClientRect()
      if (r.height > 140) continue
      if (target.dataset.kyroHidden) continue
      target.dataset.kyroHidden = '1'
      target.style.setProperty('display', 'none', 'important')
    }
  }
  window.__kyroHideBanners = hide
  // …and a stylesheet so neither bar ever paints, not even for the frame before the
  // observer runs: the trial bar is the .no-print.border-b strip with the clock icon,
  // the MFA nag the one with the shield-check icon.
  const css = () => {
    if (document.getElementById('__kyro_hide_css')) return
    const st = document.createElement('style')
    st.id = '__kyro_hide_css'
    st.textContent = '.no-print.border-b:has(> div > div > svg.lucide-clock),.no-print.border-b:has(> div > div > svg.lucide-alert-triangle),.no-print.border-b:has(svg.lucide-shield-check){display:none!important}'
    ;(document.head || document.documentElement).appendChild(st)
  }
  if (document.documentElement) css()
  document.addEventListener('DOMContentLoaded', css)
  let t = null
  const arm = () => {
    new MutationObserver(() => { clearTimeout(t); t = setTimeout(hide, 30) }).observe(document.documentElement, { childList: true, subtree: true, characterData: true })
    hide()
  }
  if (document.body) arm()
  else document.addEventListener('DOMContentLoaded', arm)
  // Owl timeline: the parked/flying app owl (button[data-testid=kyro-dove]) and any
  // other Scholar on the page (Studio hero, brief card, chat header).
  window.__owlLog = []
  let lastSig = ''
  setInterval(() => {
    const main = document.querySelector('[data-testid="kyro-dove"] [data-kyro-state]')
    const all = [...document.querySelectorAll('[data-scholar-state]')]
    const sig = JSON.stringify([
      main?.getAttribute('data-kyro-state') ?? null,
      main?.closest('[data-testid]')?.querySelector('[data-scholar-state]')?.getAttribute('data-scholar-state') ?? null,
      all.map((e) => e.getAttribute('data-scholar-state')),
    ])
    if (sig !== lastSig) {
      lastSig = sig
      window.__owlLog.push({ t: Date.now(), s: sig })
      if (window.__owlLog.length > 4000) window.__owlLog.shift()
    }
  }, 100)
  // S9: SpeechRecognition stub — the Studio's hands-free mic really enters
  // "listening" and hears window.__kyroSpeech.text (word by word, then final).
  class FakeRecognition {
    constructor() { this.continuous = false; this.interimResults = true; this.lang = 'en-US'; this._timers = [] }
    start() {
      const cfg = window.__kyroSpeech || { text: '', wordMs: 330, leadMs: 700 }
      const words = String(cfg.text || '').split(/\s+/).filter(Boolean)
      window.__kyroSpeechStarted = Date.now()
      this._timers.push(setTimeout(() => { this.onstart && this.onstart({}); this.onaudiostart && this.onaudiostart({}); this.onspeechstart && this.onspeechstart({}) }, 60))
      words.forEach((_, i) => {
        this._timers.push(setTimeout(() => {
          const isFinal = i === words.length - 1
          const res = [{ transcript: words.slice(0, i + 1).join(' '), confidence: 0.95 }]
          res.isFinal = isFinal
          const results = [res]
          this.onresult && this.onresult({ resultIndex: 0, results })
          if (isFinal) {
            this._timers.push(setTimeout(() => { this.onspeechend && this.onspeechend({}); this.onend && this.onend({}) }, 450))
          }
        }, (cfg.leadMs ?? 700) + i * (cfg.wordMs ?? 330)))
      })
      if (!words.length) this._timers.push(setTimeout(() => { this.onend && this.onend({}) }, 4000))
    }
    stop() { this._timers.forEach(clearTimeout); this._timers = []; setTimeout(() => this.onend && this.onend({}), 30) }
    abort() { this._timers.forEach(clearTimeout); this._timers = [] }
    addEventListener(type, fn) { this['on' + type] = fn }
    removeEventListener() {}
  }
  window.SpeechRecognition = FakeRecognition
  window.webkitSpeechRecognition = FakeRecognition
}

// ── Silent mp3s for the /tts stub (generated once) ───────────────────────────
const SILENT_DIR = path.join(DIR, 'captures-v4/.silent')
const SILENT_LENGTHS = [1, 2, 3, 4, 6, 8, 10, 14, 18, 24, 30]
function ensureSilence() {
  fs.mkdirSync(SILENT_DIR, { recursive: true })
  for (const d of SILENT_LENGTHS) {
    const f = path.join(SILENT_DIR, `silent-${d}.mp3`)
    if (!fs.existsSync(f))
      execFileSync(FF, ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=22050:cl=mono', '-t', String(d), '-c:a', 'libmp3lame', '-b:a', '32k', f])
  }
}
function silentFor(text) {
  const want = Math.max(1, String(text || '').length * 0.065)
  const d = SILENT_LENGTHS.find((x) => x >= want) ?? SILENT_LENGTHS.at(-1)
  return fs.readFileSync(path.join(SILENT_DIR, `silent-${d}.mp3`))
}

// ── Browser + guarded context + the ONE login ────────────────────────────────
export const GUARD = { violations: [], ttsCalls: 0, writes: [] }
export async function openBrowser({ headless = true } = {}) {
  ensureSilence()
  // GPU: WSL2's RTX via Mesa d3d12 → ANGLE GL-EGL. Software GL rendered the brief's
  // blurred modal at ~9 fps; this renders it at ~45 fps (KYRO_CAPTURE_SWGL=1 = old path).
  const gpu = process.env.KYRO_CAPTURE_SWGL ? {} : {
    env: { ...process.env, GALLIUM_DRIVER: 'd3d12', MESA_D3D12_DEFAULT_ADAPTER_NAME: 'NVIDIA', LD_LIBRARY_PATH: ['/usr/lib/wsl/lib', process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') },
    gpuArgs: ['--use-angle=gl-egl', '--use-gl=angle', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
  }
  const browser = await chromium.launch({ headless, env: gpu.env, args: ['--autoplay-policy=no-user-gesture-required', '--disable-features=Translate', ...(gpu.gpuArgs ?? [])] })
  const ctx = await newContext(browser)
  return { browser, ctx }
}
/** A guarded context (cursor, banner hider, clock, stubs, demo-network guard). */
export async function newContext(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: 'en-US' })
  await ctx.addInitScript(CURSOR_SCRIPT)
  await ctx.addInitScript(CLOCK_SCRIPT, PIN.offsetMs)
  await ctx.addInitScript(CHROME_SCRIPT)
  await ctx.route('**/api/**', async (route) => {
    const req = route.request()
    const url = req.url()
    const sm = url.match(/\/api\/schools\/([0-9a-f-]{36})/i)
    const om = url.match(/\/api\/organizations\/([0-9a-f-]{36})/i)
    if ((sm && !DEMO_IDS.has(sm[1])) || (om && om[1] !== ORG)) {
      GUARD.violations.push(`${req.method()} ${url.replace(BASE, '')}`)
      return route.abort('blockedbyclient')
    }
    if (req.method() === 'POST' && /\/api\/schools\/[^/]+\/assistant\/tts(\?|$)/.test(url)) {
      GUARD.ttsCalls++
      let text = ''
      try { text = JSON.parse(req.postData() || '{}').text || '' } catch {}
      return route.fulfill({ status: 200, contentType: 'audio/mpeg', body: silentFor(text) })
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) {
      const w = `${req.method()} ${url.replace(BASE, '').replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, (m) => m.slice(0, 8))}`
      if (GUARD.blockWrite && GUARD.blockWrite.test(url) && !/\/auth\//.test(url)) {
        GUARD.writes.push('BLOCKED ' + w)
        return route.abort('blockedbyclient')
      }
      GUARD.writes.push(w)
    }
    // Server half of the film-day pin: GET JSON only, never the assistant (its
    // streams must pass straight through), and only while the API's day differs.
    const shift = pinShift()
    if (shift !== 0 && req.method() === 'GET' && !/\/assistant\//.test(url)) {
      const resp = await route.fetch()
      const headers = { ...resp.headers() }
      if (!String(headers['content-type'] || '').includes('application/json')) return route.fulfill({ response: resp })
      let body = await resp.text()
      try {
        const hits = {}
        const j = pinWalk(JSON.parse(body), new Date().toISOString().slice(0, 10), shift, hits)
        if (Object.keys(hits).length) {
          body = JSON.stringify(j)
          for (const [k, n] of Object.entries(hits)) PIN.hits[k] = (PIN.hits[k] || 0) + n
        }
      } catch {}
      delete headers['content-length']
      delete headers['content-encoding']
      return route.fulfill({ status: resp.status(), headers, body })
    }
    return route.continue()
  })
  return ctx
}

/** The one real login, through the /login form. Returns the control page. */
export async function login(ctx) {
  const p = await ctx.newPage()
  for (let i = 0; i < 8; i++) {
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' })
    await p.waitForSelector('input[type=email]', { timeout: 20000 })
    await p.fill('input[type=email]', env.MORGAN_EMAIL)
    await p.fill('input[type=password]', env.MORGAN_PASSWORD)
    const resp = p.waitForResponse((r) => r.url().includes('/api/auth/login') && r.request().method() === 'POST', { timeout: 30000 })
    await p.press('input[type=password]', 'Enter')
    const r = await resp
    if (r.status() === 429) {
      const w = (Number(r.headers()['retry-after']) || 30) * 1000
      console.log(`  login rate-limited (429) — waiting ${w / 1000}s`)
      await sleep(w)
      continue
    }
    if (r.status() !== 200 && r.status() !== 201) throw new Error(`login failed: HTTP ${r.status()}`)
    await p.waitForURL((u) => !u.pathname.includes('login'), { timeout: 30000 })
    const who = await p.evaluate(async () => {
      const t = localStorage.getItem('finrep_access_token')
      const r = await fetch('/api/auth/me', { headers: { authorization: `Bearer ${t}` } }).catch(() => null)
      return r && r.ok ? (await r.json()).email ?? (await r.json()).user?.email : null
    }).catch(() => null)
    if (who && who !== env.MORGAN_EMAIL) throw new Error('logged in as an unexpected account — abort')
    // Park the control page on a static file (same origin, no app polling).
    await p.goto(BASE + '/favicon-32.png')
    return p
  }
  throw new Error('login rate-limited too long')
}

/** Point the app at a school (or the org) for the next page. */
export async function setScope(ctrl, { school, scope = 'school' } = {}) {
  await ctrl.evaluate(([sid, sc]) => {
    if (sid) localStorage.setItem('finrep_active_school_id', sid)
    localStorage.setItem('finrep_scope_mode', sc)
    localStorage.setItem('kyro_mfa_nudge', 'never')
  }, [school ? SCH[school] : null, scope])
}

// ── Recorder: CDP screencast → 30 fps CFR VP9 webm ───────────────────────────
class Recorder {
  constructor(page, cdp, tmp) {
    this.page = page
    this.cdp = cdp
    this.tmp = tmp
    this.frames = []
    fs.rmSync(tmp, { recursive: true, force: true })
    fs.mkdirSync(tmp, { recursive: true })
  }
  async start() {
    // Monotonic clock: the WSL2 wall clock can step backwards mid-take.
    this.t0 = performance.now() / 1000
    this.cdp.on('Page.screencastFrame', (f) => {
      const i = this.frames.length
      const ts = performance.now() / 1000 // arrival time (monotonic)
      this.frames.push({ i, t: ts })
      fs.writeFile(path.join(this.tmp, `${String(i).padStart(6, '0')}.jpg`), Buffer.from(f.data, 'base64'), () => {})
      this.cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
    })
    await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 })
  }
  now() { return Math.round((performance.now() / 1000 - this.t0) * 100) / 100 }
  async stop() {
    await this.cdp.send('Page.stopScreencast').catch(() => {})
    this.tEnd = performance.now() / 1000
    await rawSleep(400) // let the last JPEG writes land
  }
  encode(out) {
    const fr = this.frames.filter((f) => fs.existsSync(path.join(this.tmp, `${String(f.i).padStart(6, '0')}.jpg`)))
    if (!fr.length) throw new Error('no frames recorded')
    let list = ''
    for (let k = 0; k < fr.length; k++) {
      const start = k === 0 ? this.t0 : fr[k].t
      const end = k + 1 < fr.length ? fr[k + 1].t : this.tEnd
      const d = Math.max(0.001, end - start)
      list += `file '${String(fr[k].i).padStart(6, '0')}.jpg'\nduration ${d.toFixed(4)}\n`
    }
    list += `file '${String(fr.at(-1).i).padStart(6, '0')}.jpg'\n`
    fs.writeFileSync(path.join(this.tmp, 'list.txt'), list)
    // (The image-sequence concat demuxer is only used here to re-time frames; the
    //  film itself is assembled with the concat FILTER in build-v4.py.)
    execFileSync(FF, ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(this.tmp, 'list.txt'),
      '-vf', 'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libvpx-vp9', '-crf', '18', '-b:v', '0',
      '-deadline', 'realtime', '-cpu-used', '6', '-row-mt', '1', '-threads', '12', out])
    const stats = { frames: fr.length, seconds: Math.round((this.tEnd - this.t0) * 100) / 100 }
    stats.srcFps = Math.round((fr.length / stats.seconds) * 10) / 10
    let maxGap = 0
    for (let k = 1; k < fr.length; k++) maxGap = Math.max(maxGap, fr[k].t - fr[k - 1].t)
    stats.maxGap = Math.round(maxGap * 100) / 100
    // Worst 1-second window (frames arriving), after the first 2 s of page load.
    let minWin = Infinity
    for (let w = this.t0 + 2; w + 1 <= this.tEnd; w += 0.5) minWin = Math.min(minWin, fr.filter((f) => f.t >= w && f.t < w + 1).length)
    stats.minFps1s = Number.isFinite(minWin) ? minWin : null
    return stats
  }
  cleanup() { fs.rmSync(this.tmp, { recursive: true, force: true }) }
}

// ── Scene helper: motion, marks, owl, checks ─────────────────────────────────
export class Shot {
  constructor(page, rec, id) {
    this.p = page
    this.rec = rec
    this.id = id
    this.marks = {}
    this.splices = []
    this.notes = []
    this.checks = []
    this.cur = { x: 960, y: 540 }
    this.bannerHits = []
    this.ok = true
  }
  at() { return this.rec.now() }
  mark(name) { this.marks[name] = this.at(); return this.marks[name] }
  note(s) { this.notes.push(s); console.log(`    · ${s}`) }
  fail(s) { this.ok = false; this.note('FAIL: ' + s) }
  /** A named splice: the build cuts [from, to] out of the shot. */
  splice(name, from, to) { if (to - from > 0.3) this.splices.push({ name, from, to }) }
  async glide(x, y, ms = 600) {
    ms = ms * TIMING.tempo
    const p = this.p
    const steps = Math.max(6, Math.round(ms / 25))
    const sx = this.cur.x, sy = this.cur.y
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
      await p.mouse.move(sx + (x - sx) * e, sy + (y - sy) * e)
      await rawSleep(ms / steps)
    }
    this.cur = { x, y }
    await p.evaluate(([x, y]) => { window.__kyroCur = { x, y } }, [x, y]).catch(() => {})
  }
  loc(l) { return typeof l === 'string' ? this.p.locator(l).first() : l.first() }
  async hover(l, ms = 650, { timeout = 2000, dx = null } = {}) {
    const el = this.loc(l)
    try {
      await el.waitFor({ state: 'visible', timeout })
      await el.scrollIntoViewIfNeeded({ timeout }).catch(() => {})
      const b = await el.boundingBox()
      if (!b) return false
      await this.glide(b.x + (dx ?? Math.min(b.width / 2, 180)), b.y + b.height / 2, ms)
      return true
    } catch {
      return false
    }
  }
  async click(l, opts = {}) {
    const ok = await this.hover(l, opts.ms ?? 650, opts)
    if (!ok) { this.note(`missing: ${typeof l === 'string' ? l : (opts.label ?? '<locator>')}`); return false }
    await sleep(opts.pause ?? 180)
    const el = this.loc(l)
    const b = await el.boundingBox().catch(() => null)
    if (b) {
      const tx = b.x + (opts.dx ?? Math.min(b.width / 2, 180)), ty = b.y + b.height / 2
      if (Math.abs(tx - this.cur.x) > 3 || Math.abs(ty - this.cur.y) > 3) await this.glide(tx, ty, 220)
    }
    await this.p.mouse.down(); await sleep(70); await this.p.mouse.up()
    return true
  }
  async type(text, delay = 34) { await this.p.keyboard.type(text, { delay }) }
  async drift(px, ms) {
    ms = ms * TIMING.tempo
    const steps = Math.max(8, Math.round(ms / 90))
    for (let i = 0; i < steps; i++) { await this.p.mouse.wheel(0, px / steps); await rawSleep(ms / steps) }
  }
  /** Smooth-scroll so the element's top sits `offset` px below the viewport top. */
  async scrollTo(l, ms = 1400, { timeout = 4000, offset = 140 } = {}) {
    const el = this.loc(l)
    try {
      await el.waitFor({ state: 'attached', timeout })
      await el.evaluate((n, off) => {
        const r = n.getBoundingClientRect()
        window.scrollBy({ top: r.top - off, behavior: 'smooth' })
      }, offset)
      await sleep(ms)
      return true
    } catch {
      this.note(`missing (scroll): ${typeof l === 'string' ? l : '<locator>'}`)
      return false
    }
  }
  async scrollTop(ms = 900) { await this.p.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await sleep(ms) }
  async idle(ms, { box = [200, 160, 1760, 960] } = {}) {
    ms = ms * TIMING.tempo
    const t0 = Date.now()
    while (Date.now() - t0 < ms) {
      const left = ms - (Date.now() - t0)
      const x = Math.max(box[0], Math.min(box[2], this.cur.x + (Math.random() - 0.5) * 240))
      const y = Math.max(box[1], Math.min(box[3], this.cur.y + (Math.random() - 0.5) * 150))
      await this.glide(x, y, Math.min(left, 900 + Math.random() * 600) / TIMING.tempo)
      if (left > 900) await rawSleep(Math.min(left - 900, 300))
    }
  }
  async visible(sel, timeout = 2500) {
    return this.loc(sel).waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false)
  }
  async waitText(re, timeout = 30000) {
    const t0 = Date.now()
    while (Date.now() - t0 < timeout) {
      const ok = await this.p.evaluate((src) => new RegExp(src[0], src[1]).test(document.body.innerText), [re.source, re.flags]).catch(() => false)
      if (ok) return true
      await sleep(250)
    }
    return false
  }
  async goto(route, { settle = 900 } = {}) {
    await this.p.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await this.p.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {})
    await this.p.evaluate(() => window.__kyroHideBanners && window.__kyroHideBanners()).catch(() => {})
    await sleep(settle)
  }
  /** Owl state of the parked/flying app owl: { phase, state } or null. */
  async owl() {
    return this.p.evaluate(() => {
      let btn = document.querySelector('[data-testid="kyro-dove"]')
      if (!btn) {
        // KYRO Studio: the big hero Scholar (no floating owl on /penny).
        const big = [...document.querySelectorAll('[data-scholar-state]')].map((e) => [e, e.getBoundingClientRect()]).filter(([, r]) => r.width > 60).sort((a, b) => b[1].width - a[1].width)[0]
        if (!big) return null
        const r = big[1]
        return { phase: 'studio', state: big[0].getAttribute('data-scholar-state'), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), onScreen: r.bottom > 0 && r.top < innerHeight }
      }
      const r = btn.getBoundingClientRect()
      const ph = btn.querySelector('[data-kyro-state]')?.getAttribute('data-kyro-state') ?? null
      const st = btn.querySelector('[data-scholar-state]')?.getAttribute('data-scholar-state') ?? null
      return { phase: ph, state: st, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), onScreen: r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth }
    }).catch(() => null)
  }
  /** Wait for the Scholar to be on screen and landed (perched). */
  async owlLanded(timeout = 8000, { studio = false } = {}) {
    const t0 = Date.now()
    while (Date.now() - t0 < timeout) {
      if (studio) {
        const ok = await this.p.evaluate(() => [...document.querySelectorAll('[data-scholar-state]')].some((e) => { const r = e.getBoundingClientRect(); return r.width > 20 && r.bottom > 0 && r.top < innerHeight })).catch(() => false)
        if (ok) return true
      } else {
        const o = await this.owl()
        if (o && o.onScreen && o.phase === 'perched') return o
      }
      await sleep(150)
    }
    this.note('owl not seen landed within ' + timeout + ' ms')
    return null
  }
  /** Page loaded + banners gone + owl landed → settledAt. */
  async settle(name = 'settledAt', { studio = false, owlTimeout = 8000 } = {}) {
    await this.p.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})
    await this.p.evaluate(() => window.__kyroHideBanners && window.__kyroHideBanners()).catch(() => {})
    await this.owlLanded(owlTimeout, { studio })
    await this.p.mouse.move(this.cur.x, this.cur.y)
    return this.mark(name)
  }
  /** Visible-text checks sampled through the take (banners, load errors, foreign names). */
  async sample() {
    const r = await this.p.evaluate(() => {
      const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && r.bottom > 0 && r.top < innerHeight }
      const hits = []
      for (const n of ['left in your trial', 'Protect your account', 'two-factor authentication', 'DEMO DATA', 'Something went wrong']) {
        const w = document.evaluate(`//*[contains(text(), "${n}")]`, document.body, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null)
        for (let i = 0; i < w.snapshotLength; i++) {
          const el = w.snapshotItem(i)
          let hidden = false
          for (let a = el; a; a = a.parentElement) if (a.dataset && a.dataset.kyroHidden) { hidden = true; break }
          if (!hidden && vis(el)) hits.push(n)
        }
      }
      const btn = document.querySelector('[data-testid="kyro-dove"]')
      const studio = [...document.querySelectorAll('[data-scholar-state]')].some((e) => { const r = e.getBoundingClientRect(); return r.width > 20 && r.bottom > 0 && r.top < innerHeight })
      let owlOn = false
      if (btn) { const r = btn.getBoundingClientRect(); owlOn = r.width > 0 && r.bottom > 0 && r.top < innerHeight }
      return { hits, owl: owlOn || studio }
    }).catch(() => null)
    if (!r) return
    const t = this.at()
    for (const h of r.hits) this.bannerHits.push(`${t}s ${h}`)
    if (!r.owl) (this.owlMissing ??= []).push(t)
    // Rough-cut review: a stray select-all filmed a whole page in browser blue (e7).
    const sel = await this.selectedChars()
    if (sel > 0) (this.selectionHits ??= []).push(t)
  }
}

// ── ffmpeg helpers ───────────────────────────────────────────────────────────
export function durOf(f) {
  return Number(spawnSync(FP, ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout.trim())
}
/** Contact sheet: first / settled / named marks / last, labelled, 3 per row. */
export function contactSheet(webm, json, out) {
  const meta = JSON.parse(fs.readFileSync(json, 'utf8'))
  const D = durOf(webm)
  const pts = [['first', 0.3]]
  if (meta.settledAt != null) pts.push(['settled', meta.settledAt + 0.2])
  const named = Object.entries(meta.marks ?? {}).filter(([k]) => k !== 'settledAt').sort((a, b) => a[1] - b[1])
  // At most 7 named marks, evenly picked.
  const pick = named.length <= 7 ? named : Array.from({ length: 7 }, (_, i) => named[Math.round((i * (named.length - 1)) / 6)])
  for (const [k, v] of pick) pts.push([k, Math.min(D - 0.2, v + 0.6)])
  pts.push(['last', Math.max(0, D - 0.3)])
  const tmp = out + '.d'
  fs.rmSync(tmp, { recursive: true, force: true })
  fs.mkdirSync(tmp, { recursive: true })
  pts.forEach(([label, t], i) => {
    spawnSync(FF, ['-v', 'error', '-y', '-ss', String(Math.max(0, t)), '-i', webm, '-frames:v', '1', '-vf', 'scale=640:360', path.join(tmp, `${String(i).padStart(2, '0')}.png`)])
  })
  // Tile + label with PIL (the static ffmpeg build has no drawtext).
  const labels = pts.map(([label, t]) => `${label} ${t.toFixed(1)}s`)
  const py = `
import sys, json, os
from PIL import Image, ImageDraw, ImageFont
tmp, out, labels = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])
cols = 3; rows = (len(labels) + cols - 1) // cols
sheet = Image.new('RGB', (640 * cols, 360 * rows), 'black')
try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 18)
except Exception: font = ImageFont.load_default()
for i, lab in enumerate(labels):
    f = os.path.join(tmp, '%02d.png' % i)
    im = Image.open(f).convert('RGB') if os.path.exists(f) else Image.new('RGB', (640, 360), (60, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 640, 28], fill=(0, 0, 0))
    d.text((8, 4), lab, fill='white', font=font)
    sheet.paste(im, ((i % cols) * 640, (i // cols) * 360))
sheet.save(out)
`
  spawnSync('python3', ['-I', '-c', py, tmp, out, JSON.stringify(labels)])
  fs.rmSync(tmp, { recursive: true, force: true })
  return out
}

/** Run reset-v4.mjs for one or more targets (each run is one login of its own). */
export function reset(...targets) {
  const args = targets.flat().filter(Boolean)
  if (!args.length) return true
  const r = spawnSync('node', [path.join(SEED, 'reset-v4.mjs'), ...args], { encoding: 'utf8', timeout: 240000 })
  const out = (r.stdout || '') + (r.stderr || '')
  const lines = out.split('\n').filter((l) => /✓|✗|!|removed|cleared|staged|undone|←|problem|FY 2027/.test(l))
  console.log(`    reset ${args.join(' ')} → exit ${r.status}${lines.length ? '\n      ' + lines.join('\n      ') : ''}`)
  return { ok: r.status === 0, out }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
// ═════════════════════════════════════════════════════════════════════════════
// Scene helpers that know the app
// ═════════════════════════════════════════════════════════════════════════════
const V = (t) => `text=${t} >> visible=true`
Object.assign(Shot.prototype, {
  /** Background sampler: banners / owl presence every second + owl state timeline. */
  startSampler() {
    this.owlTimeline = []
    let last = ''
    this._sampling = true
    const loop = async () => {
      let n = 0
      while (this._sampling) {
        const o = await this.owl()
        const sig = o ? `${o.phase}/${o.state}` : 'none'
        if (sig !== last) { last = sig; this.owlTimeline.push({ t: this.at(), owl: sig, x: o?.x, y: o?.y }) }
        if (n++ % 3 === 0) await this.sample()
        await sleep(330)
      }
    }
    this._sampler = loop().catch(() => {})
  },
  async stopSampler() { this._sampling = false; await this._sampler },
  /** Point the page at another school / scope and open a route (a cut). */
  async switchTo(school, scope, route) {
    await this.p.evaluate(([sid, sc]) => {
      if (sid) localStorage.setItem('finrep_active_school_id', sid)
      localStorage.setItem('finrep_scope_mode', sc)
    }, [school ? SCH[school] : null, scope])
    await this.cutTo(route)
  },
  /** A hard cut to another route inside one take: the page load is spliced out. */
  async cutTo(route) {
    const c = this.at()
    await this.goto(route, { settle: 500 })
    await this.owlLanded(6000)
    await rawSleep(300)
    this.splice('cut ' + route, c + 0.05, this.at() - 0.05)
  },
  /** Open the KYRO AI chat by clicking the parked owl; start a fresh chat. */
  async openChat() {
    const o = await this.owl()
    if (!o) { this.note('no owl to click'); return false }
    await this.glide(o.x + o.w / 2, o.y + o.h / 2, 700)
    await sleep(150)
    await this.p.mouse.down(); await sleep(70); await this.p.mouse.up()
    const ok = await this.visible('[aria-label="KYRO AI assistant"]', 4000)
    if (!ok) { this.note('chat did not open'); return false }
    await sleep(600)
    const hasMsgs = await this.p.evaluate(() => !document.querySelector('[aria-label="KYRO AI assistant"]')?.innerText.includes('Hi! I’m KYRO') && !document.querySelector('[aria-label="KYRO AI assistant"]')?.innerText.includes("Hi! I'm KYRO")).catch(() => false)
    if (hasMsgs) { this.staleChatAt = this.at(); this.note('chat opened on an earlier conversation → New chat'); await this.click('button[aria-label="Start a new chat"]', { ms: 400 }); await sleep(700) }
    return true
  },
  /** Off-camera pre-roll (before settledAt): open the chat, start a new one if it
   *  holds an earlier scene's conversation, close it — so the on-camera open shows
   *  the empty "Hi! I'm KYRO" state, never another scene's ask. */
  async freshChat() {
    const o = await this.owl()
    if (!o) return false
    await this.p.mouse.click(o.x + o.w / 2, o.y + o.h / 2)
    if (!(await this.visible('[aria-label="KYRO AI assistant"]', 4000))) return false
    await rawSleep(700)
    const stale = await this.p.evaluate(() => { const t = document.querySelector('[aria-label="KYRO AI assistant"]')?.innerText || ''; return !t.includes('Hi! I’m KYRO') && !t.includes("Hi! I'm KYRO") }).catch(() => false)
    if (stale) { await this.p.locator('button[aria-label="Start a new chat"]').first().click().catch(() => {}); await rawSleep(900) }
    await this.p.locator('button[aria-label="Close KYRO AI"]').first().click().catch(() => {})
    await rawSleep(600)
    return true
  },
  /** Frame-driven smooth scroll (window.scrollTo per animation frame). Native
   *  smooth scrolling was cancelled by chart re-layouts in a5's first take. */
  async smoothTo(l, ms = 1200, { offset = 120, timeout = 4000 } = {}) {
    const el = this.loc(l)
    try {
      await el.waitFor({ state: 'attached', timeout })
      const target = await el.evaluate((n, off) => Math.max(0, Math.round(n.getBoundingClientRect().top + scrollY - off)), offset)
      await this.p.evaluate(([to, dur]) => new Promise((res) => {
        const from = scrollY, t0 = performance.now()
        const max = document.scrollingElement.scrollHeight - innerHeight
        const dest = Math.min(to, max)
        const step = (now) => {
          const k = Math.min(1, (now - t0) / dur)
          const e = k < 0.5 ? 2 * k * k : -1 + (4 - 2 * k) * k
          window.scrollTo({ top: from + (dest - from) * e, behavior: 'instant' })
          if (k < 1) requestAnimationFrame(step); else res()
        }
        requestAnimationFrame(step)
      }), [target, ms])
      await rawSleep(120)
      return true
    } catch {
      this.note(`missing (smooth scroll): ${typeof l === 'string' ? l : '<locator>'}`)
      return false
    }
  },
  /** Characters of page text currently selected (must stay 0 on camera). */
  async selectedChars() {
    return this.p.evaluate(() => {
      const a = document.activeElement
      const inField = a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')
      return inField ? 0 : String(window.getSelection() || '').length
    }).catch(() => 0)
  },
  async askChat(text) {
    const ta = this.p.locator('[aria-label="KYRO AI assistant"] textarea, [aria-label="KYRO AI assistant"] input[type=text]').first()
    await this.click(ta, { ms: 500, label: 'chat input' })
    await this.type(text, 30)
    await sleep(300)
    this.mark('askAt')
    await this.p.keyboard.press('Enter')
  },
  /** After an ask: wait for the owl to fly (guide) and land beside its target. */
  async waitGuide(timeout = 45000, targetId = null) {
    const t0 = Date.now()
    let flew = false
    while (Date.now() - t0 < timeout) {
      const o = await this.owl()
      if (o && o.phase !== 'perched' && !flew) { flew = true; this.mark('flightAt') }
      const bubble = await this.p.locator('[role=status]').filter({ hasText: /\w/ }).first().isVisible().catch(() => false)
      if (flew && o && o.phase === 'perched' && bubble && o.x < 1650) {
        if (targetId) {
          const near = await this.p.evaluate(([id, ox, oy]) => { const e = document.getElementById(id); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && Math.abs(oy - (r.top + r.height / 2)) < 420 }, [targetId, o.x, o.y]).catch(() => false)
          if (!near) { await sleep(300); continue }
        }
        this.mark('landedAt')
        return true
      }
      await sleep(250)
    }
    return false
  },
  async chatReplyDone(timeout = 60000) {
    const t0 = Date.now()
    await sleep(1200)
    while (Date.now() - t0 < timeout) {
      const busy = await this.p.locator('[aria-label="KYRO is thinking"], [aria-label="Sending — please wait"]').first().isVisible().catch(() => false)
      if (!busy) return true
      await sleep(400)
    }
    return false
  },
  /** The owl tossed its cap (celebrate) at some point after `since`. */
  owlDid(state, since = 0) {
    return (this.owlTimeline ?? []).some((e) => e.t >= since && e.owl.endsWith('/' + state))
  },
})

// ═════════════════════════════════════════════════════════════════════════════
// The scenes (storyboard §B). Each: { school, scope, ctx:'public'?, before/after
// resets, ai (retry up to 5), oneTake, run(s, mode) → success boolean }.
// mode = 'dry' | 'final'. One-take writes happen ONLY when mode === 'final'.
// ═════════════════════════════════════════════════════════════════════════════
const F = (n) => path.join(FILES, n)
export const SCENES = {
  // ── Cold open: the live website, logged out ─────────────────────────────────
  c0_promise: {
    tempo: 0.8, ctx: 'public',
    async run(s) {
      await s.goto('/', { settle: 600 })
      // Capture-only (rough-cut review 2026-10-17): the orbit's one-shot dock
      // shockwave is a circle centred on the Scholar, which reads as a ring/halo
      // behind the owl in stills. It is hidden in the filming browser only (the
      // live site is unchanged); KYRO_C0_KEEP_SHOCK=1 films it as the site shows it.
      if (!process.env.KYRO_C0_KEEP_SHOCK) {
        await s.p.addStyleTag({ content: '.orbit-shock{display:none!important}' })
        s.note('capture-only: .orbit-shock (dock shockwave ring around the owl) hidden')
      }
      await s.settle('settledAt', { studio: true })
      await s.glide(1300, 520, 900)
      await sleep(3600) // the hero chat card: the Scholar talks while the script types
      s.mark('heroHeld')
      // Scroll into "Everything orbits KYRO": the Scholar flies in and lands on the core.
      await s.scrollTo(V('Everything orbits KYRO'), 1500, { offset: 60 })
      s.mark('orbitAt')
      await s.glide(960, 560, 600)
      // OrbitScrolly is scroll-driven (a 560vh pinned track ≈ 4,970 px of scroll):
      // steady wheel ticks so each of the nine planets docks, then the collapse.
      const track = await s.p.evaluate(() => {
        const w = document.evaluate('//*[contains(text(),"Everything orbits KYRO")]', document.body, null, 9, null).singleNodeValue
        let a = w
        while (a && !/h-\[560vh\]|sticky/.test(String(a.className))) a = a.parentElement
        if (a && /sticky/.test(String(a.className))) a = a.parentElement
        if (!a) return null
        const r = a.getBoundingClientRect()
        return { top: Math.round(r.top + scrollY), height: Math.round(r.height) }
      })
      const span = track ? track.height - 1080 : 4968
      for (let i = 0; i < 10; i++) {
        await s.drift(span / 10, 1050)
        s.mark(`dock${i + 1}`)
      }
      // Hold the collapse: the briefing card ("Good morning — 3 things need a decision").
      await s.scrollTo(V('need a decision'), 900, { offset: 330 })
      s.mark('collapseAt')
      await sleep(1500) // the briefing card rises; the Scholar tosses its cap (and folds into the card)
      await s.scrollTop(1200)
      await s.click('a:has-text("Sign in") >> visible=true', { ms: 900 })
      await sleep(1400)
      s.mark('signInAt')
      await sleep(1200)
      return true
    },
  },
  // ── Ch 1 · Monday morning (St. Aurelia) ────────────────────────────────────
  s1_home: {
    tempo: 0.8, school: 'aurelia',
    async run(s) {
      await s.goto('/app')
      await s.settle()
      await s.hover(V('Good morning'), 900)
      await sleep(1600)
      await s.hover(V('things that need a decision'), 700)
      await sleep(1200)
      for (const t of ['Finance', 'Enrollment', 'Governance', 'Accreditation']) {
        await s.hover(`h3:has-text("${t}") >> visible=true`, 520)
        await sleep(650)
      }
      await s.hover(V('All clear'), 600)
      s.mark('allClearAt')
      await sleep(1200)
      await s.hover(V('need attention'), 600)
      s.mark('attentionAt')
      await sleep(1400)
      await s.drift(300, 1500)
      await s.idle(1800)
      return true
    },
  },
  s2_brief: {
    tempo: 0.6, school: 'aurelia',
    async run(s) {
      await s.goto('/app')
      await s.settle()
      await sleep(800)
      await s.click('button:has-text("Open Daily Briefing")', { ms: 800 })
      s.mark('briefOpenAt')
      const ok = await s.waitText(/MORNING BRIEF/i, 45000)
      if (!ok) return s.fail('brief not composed') && false
      s.mark('briefReadyAt')
      await sleep(1600)
      await s.click('button[aria-label="Play the morning brief"]', { ms: 700 })
      s.mark('playAt')
      await sleep(1500)
      await s.glide(980, 620, 900)
      await sleep(7000)
      s.mark('readingAt')
      await s.drift(240, 1600)
      await sleep(3000)
      const talked = s.owlDid('talking')
      if (!talked) s.note('the parked owl never entered "talking" during Play')
      return true
    },
  },
  s3_showme: {
    tempo: 0.85, school: 'aurelia', ai: true,
    async run(s) {
      await s.goto('/app')
      // Pre-roll (before settledAt, so never in the cut): clear any earlier scene's
      // conversation, then reload the home page clean.
      await s.owlLanded(8000)
      await s.freshChat()
      await s.goto('/app')
      await s.settle()
      await sleep(900)
      s.mark('owlClickAt')
      if (!(await s.openChat())) return false
      s.mark('chatOpenAt')
      if (s.staleChatAt != null) return s.fail('the chat opened on an earlier conversation on camera') && false
      await sleep(900)
      await s.askChat('Where do I see when our cash runs low?')
      const ok = await s.waitGuide(45000, 'cf-hero')
      if (!ok) { s.note('no walkthrough flight to #cf-hero'); return false }
      s.splice('thinking', s.marks.askAt + 1.8, s.marks.flightAt - 0.6)
      await sleep(1600)
      await s.hover('#cf-hero', 700, { dx: 900 })
      await sleep(3600)
      return /\/cash-flow/.test(s.p.url())
    },
  },
  // ── Ch 2 · Finance ──────────────────────────────────────────────────────────
  f1_drop: {
    school: 'brightwater', ai: true, before: ['brightwater --force'], after: ['brightwater --force'],
    async run(s) {
      await s.goto('/finance?tab=add&add=tb')
      await s.settle()
      await sleep(600)
      if (!(await s.openChat())) return false
      await s.askChat("Show me where I drop this year's trial balance.")
      const flew = await s.waitGuide(45000, 'tb-upload-drop')
      if (!flew) s.note('walkthrough did not fly to #tb-upload-drop (fallback: owl parked)')
      else s.splice('ask', s.marks.askAt - 3.5, s.marks.flightAt - 0.4)
      await sleep(1800)
      // The two QuickBooks exports, dropped together on the This-year slot.
      await s.hover('#tb-upload-drop', 800)
      await sleep(400)
      s.mark('dropAt')
      await s.p.locator('#tb-upload-drop input[type=file]').setInputFiles([F('Profit and Loss.xlsx'), F('Balance Sheet.xlsx')])
      const ok = await s.waitText(/5 accounts need a quick check/, 30000)
      s.mark('sortedAt')
      for (let i = 0; i < 30 && (await s.visible(V('Confirm this file'), 200)); i++) await sleep(300)
      await sleep(600)
      await s.scrollTo(V('Your files'), 1300, { offset: 330 })
      await s.hover(V('5 accounts need a quick check'), 700)
      await sleep(2600)
      await s.hover(V('Balanced'), 600)
      await sleep(1500)
      return ok && flew
    },
  },
  f2_messy: {
    tempo: 0.75, school: 'brightwater', before: ['brightwater --force'], after: ['brightwater --force'],
    async run(s) {
      await s.goto('/finance?tab=add&add=tb')
      await s.settle()
      await s.hover('#tb-upload-drop', 800)
      await sleep(500)
      s.mark('dropAt')
      await s.p.locator('#tb-upload-drop input[type=file]').setInputFiles([F('messy/Trial Balance Export.xlsx')])
      const ok = await s.waitText(/Show KYRO where your numbers are/, 20000)
      s.mark('pickerAt')
      await sleep(1200)
      await s.scrollTo(V('Show KYRO where your numbers are'), 1200, { offset: 120 })
      await s.hover(V('Which column holds the balances'), 600).catch(() => {})
      await sleep(900)
      const names = s.p.locator('select').nth(2)
      await s.click(names, { ms: 700, label: 'Names select' })
      const none = await names.evaluate((e) => [...e.options].find((o) => /None/.test(o.textContent))?.value).catch(() => null)
      if (none != null) await names.selectOption(none, { timeout: 3000 }).catch(() => s.note('Names → None failed'))
      s.mark('changedAt')
      await sleep(1600)
      await s.hover(V('read as a trial balance'), 700)
      await sleep(1500)
      await s.click(names, { ms: 600, label: 'Names select' })
      await names.selectOption('1', { timeout: 3000 }).catch(() => s.note('Names → B failed'))
      s.mark('restoredAt')
      await sleep(1500)
      await s.click('button:has-text("Cancel") >> visible=true', { ms: 800 })
      s.mark('cancelAt')
      await sleep(1500)
      return ok
    },
  },
  f4_insert: {
    school: 'brightwater', before: ['brightwater --force'], after: ['brightwater --force'],
    async run(s) {
      await s.goto('/finance?tab=add&add=tb')
      await s.owlLanded(6000)
      await s.p.locator('#tb-upload-drop input[type=file]').setInputFiles([F('pl-only/Profit and Loss.xlsx')])
      await s.waitText(/Income statement only/, 20000)
      await s.waitText(/SAVED/i, 20000)
      await sleep(1500)
      await s.goto('/finance')
      await s.settle()
      await s.hover(V('Needs your Balance Sheet'), 800)
      s.mark('needsAt')
      await sleep(1500)
      await s.hover('button:has-text("Add it") >> visible=true', 600)
      await sleep(1800)
      return await s.visible(V('Needs your Balance Sheet'))
    },
  },
  f3_review: {
    tempo: 0.65, school: 'brightwater', oneTake: true, before: ['brightwater --force'],
    async run(s, mode) {
      await s.goto('/finance?tab=add&add=tb')
      await s.p.locator('#tb-upload-drop input[type=file]').setInputFiles([F('Profit and Loss.xlsx'), F('Balance Sheet.xlsx')])
      const sorted = await s.waitText(/5 accounts need a quick check/, 30000)
      if (!sorted) return s.fail('the QuickBooks pair did not sort to "5 accounts need a quick check"') && false
      await sleep(700)
      await s.settle()
      await s.hover(V('5 accounts need a quick check'), 700)
      await sleep(1300)
      await s.click('button:has-text("Review 5 accounts") >> visible=true', { ms: 800 })
      const pop = await s.visible('[role=dialog]:has-text("Review 5 accounts")', 8000)
      if (!pop) return s.fail('review popup did not open') && false
      s.mark('popupAt')
      await sleep(1200)
      await s.hover(V('MONEY IN'), 600)
      await sleep(700)
      await s.hover(V('SUGGESTED'), 600)
      await sleep(900)
      const row = s.p.locator('[role=dialog] select').nth(2)
      const label = await row.evaluate((e) => e.closest('div')?.parentElement?.innerText || '').catch(() => '')
      if (!/Summer Program/.test(label)) s.note('3rd select is not Summer Program — searching')
      const sel = (await s.p.locator('[role=dialog] select').evaluateAll((els) => els.findIndex((e) => { let p = e; for (let i = 0; i < 5 && p; i++) { if (/Summer Program/.test(p.innerText || '')) return !/Graduation|Yearbook|Facility|Other Expense/.test(p.innerText); p = p.parentElement } return false })))
      const target = s.p.locator('[role=dialog] select').nth(sel >= 0 ? sel : 2)
      await s.click(target, { ms: 800, label: 'Summer Program select' })
      await target.selectOption({ label: 'Instructional salaries' })
      s.mark('pickedAt')
      await sleep(1400)
      if (mode !== 'final') {
        await s.hover('button:has-text("Approve and build statements")', 800)
        s.note('DRY: "Approve and build statements" hovered, NOT pressed (approve only on the final take)')
        await sleep(1500)
        // Close WITHOUT saving (never "Save and finish later": that writes the picks).
        await s.click('button[aria-label="Close without saving"]', { ms: 600 })
        await sleep(1200)
      } else {
        await s.click('button:has-text("Approve and build statements")', { ms: 800 })
        s.mark('approveAt')
        await s.p.locator('[role=dialog]:has-text("Review 5 accounts")').waitFor({ state: 'hidden', timeout: 30000 }).catch(() => s.note('popup still open after approve'))
        await sleep(1500)
      }
      await s.scrollTo('button:has-text("Done — show my numbers") >> visible=true', 1000, { offset: 700 })
      await s.click('button:has-text("Done — show my numbers") >> visible=true', { ms: 800 })
      s.mark('doneAt')
      await s.p.waitForURL(/\/finance(\?|$)/, { timeout: 20000 }).catch(() => {})
      await sleep(3500)
      s.mark('financeAt')
      if (!s.owlDid('celebrate', s.marks.doneAt)) s.note('no cap toss seen after "Done — show my numbers"')
      // "What changed" (the light-up) needs a prior year to change from; Brightwater
      // has one year of books, so the overview shows no "What changed" control.
      if (await s.visible(V('What changed'), 1200)) {
        await s.click(V('What changed'), { ms: 700 })
        s.mark('lightUpAt')
        await sleep(4200)
      } else s.note('no "What changed" on Brightwater (one year of books — the light-up needs a prior year); held on the verdict + doors instead')
      await s.hover(V('closed'), 700)
      await sleep(1500)
      await s.scrollTo(V('Go further'), 1500, { offset: 120 })
      s.mark('doorsAt')
      for (const d of ['Statements', 'Analytics', 'Budget', 'Reports']) { await s.hover(`h3:has-text("${d}") >> visible=true`, 450); await sleep(450) }
      await sleep(1000)
      return true
    },
  },
  f4_verdict: {
    tempo: 0.6, school: 'cedar',
    async run(s) {
      await s.goto('/finance')
      await s.settle()
      await s.hover(V('closed'), 800)
      await sleep(1500)
      for (const t of ['Operating margin', 'Days of cash', 'Reserve', 'Against budget']) { await s.hover(V(t), 500); await sleep(700) }
      await s.click('button:has-text("FY 2025") >> visible=true', { ms: 700 })
      s.mark('fy25At')
      await sleep(2200)
      await s.click('button:has-text("FY 2026") >> visible=true', { ms: 600 })
      s.mark('fy26At')
      await sleep(1800)
      await s.scrollTo(V('Warnings'), 1400, { offset: 120 })
      s.mark('warningsAt')
      for (const t of ['Tuition Discount Rate', 'Days Cash on Hand is', 'Plan Readiness is']) { await s.hover(V(t), 500); await sleep(600) }
      await s.scrollTo(V('Money in vs. money out'), 1400, { offset: 160 })
      s.mark('moneyAt')
      await s.hover(V('left over'), 700)
      await sleep(2200)
      return true
    },
  },
  f5_statements: {
    tempo: 0.5, school: 'cedar',
    async run(s) {
      await s.goto('/statements')
      await s.settle()
      await s.scrollTo(V('Your statements'), 1200, { offset: 40 })
      for (const t of ['Statement of Financial Position', 'Statement of Cash Flows', 'Statement of Activities']) {
        await s.click(`button:has-text("${t}") >> visible=true`, { ms: 650 })
        s.mark('pill_' + t.split(' ').pop())
        await sleep(1700)
      }
      const cell = 'button.lineage-cell[title^="Trace Tuitions and fees"] >> visible=true'
      await s.click(cell, { ms: 900 })
      s.mark('lineageAt')
      await sleep(1500)
      await s.hover(V('Accounts tie out to the line total.'), 700)
      await sleep(1400)
      if (await s.visible(V('How this line changed'), 1500)) { await s.click(V('How this line changed'), { ms: 600 }); s.mark('historyAt'); await sleep(2000) }
      await s.hover(V('HISTORY'), 600)
      await sleep(1600)
      await s.hover(V('SOURCE'), 600)
      await sleep(1400)
      await s.p.keyboard.press('Escape')
      await sleep(900)
      await s.click('[role=button][aria-label^="Open Statement of Activities full screen"] >> visible=true', { ms: 800, dx: 300 })
      s.mark('zoomAt')
      await sleep(2600)
      await s.p.keyboard.press('Escape')
      await sleep(800)
      return true
    },
  },
  f6_budget: {
    tempo: 0.55, school: 'cedar',
    async run(s) {
      await s.goto('/budget')
      await s.settle()
      await s.click('button:has-text("Budget vs. Actual") >> visible=true', { ms: 700 })
      s.mark('bvaAt')
      await sleep(400)
      await s.scrollTo(V('From plan to what happened'), 1100, { offset: 120 })
      await sleep(2400)
      await s.scrollTo(V('What moved'), 1200, { offset: 140 })
      s.mark('movedAt')
      await s.hover(V('Development below budget'), 600)
      await sleep(900)
      await s.hover(V('Facilities under budget'), 600)
      await sleep(900)
      // Cut to Brightwater: the Guided budget (five plain questions).
      s.mark('cutBrightwater')
      await s.switchTo('brightwater', 'school', '/budget')
      s.mark('brightwaterAt')
      await s.click('button[aria-label="Answer a few questions"]', { ms: 600 })
      s.mark('guidedAt')
      await sleep(700)
      const typeIn = async (loc, val, label) => {
        if (!(await loc.count())) return s.note(`no input "${label}"`)
        await s.click(loc, { ms: 300, label })
        await s.p.keyboard.press('Control+A')
        await s.p.keyboard.type(String(val), { delay: 28 })
      }
      for (const [g, n] of [['Grade 9', 92], ['Grade 10', 90], ['Grade 11', 88], ['Grade 12', 86]])
        await typeIn(s.p.locator(`input[aria-label="Students in ${g}"]`).filter({ visible: true }).first(), n, g)
      await sleep(600)
      const next = () => s.click(s.p.locator('button').filter({ hasText: /^(Next|Review)$/ }).filter({ visible: true }).last(), { ms: 380, label: 'Next' })
      await next()
      s.mark('tuitionAt')
      await sleep(300)
      await typeIn(s.p.locator('input').filter({ visible: true }).nth(4), 12500, 'Upper school price')
      await sleep(600)
      await next()
      await sleep(250)
      await next()
      s.mark('staffAt')
      await sleep(300)
      const staff = s.p.locator('input').filter({ visible: true })
      await typeIn(staff.nth(0), 28, 'Teachers')
      await typeIn(staff.nth(1), 62000, 'Teacher pay')
      await typeIn(staff.nth(2), 6, 'Administration')
      await typeIn(staff.nth(3), 78000, 'Admin pay')
      await sleep(700)
      await next()
      await sleep(250)
      await next()
      s.mark('reviewAt')
      await sleep(500)
      await s.hover('button:has-text("Apply this budget") >> visible=true', 600)
      s.note('"Apply this budget" hovered, NOT pressed')
      await sleep(1400)
      return true
    },
  },
  f7_cash: {
    tempo: 0.85, school: 'cedar', oneTake: true, after: ['f7'],
    async run(s, mode) {
      await s.goto('/cash-flow')
      await s.settle()
      await s.scrollTo(V('Build your forecast'), 1200, { offset: 140 })
      const input = 'input[aria-label="Available operating cash"]'
      if (!(await s.visible(input, 3000))) return s.fail('no "Available operating cash" input — is the forecast already built?') && false
      await s.click(input, { ms: 800 })
      await s.type('1180000', 70)
      s.mark('typedAt')
      await sleep(900)
      if (mode !== 'final') {
        await s.hover('button:has-text("Build forecast")', 700)
        s.note('DRY: "Build forecast" hovered, NOT pressed (a built forecast cannot be removed)')
        await sleep(1500)
        return true
      }
      await s.click('button:has-text("Build forecast")', { ms: 700 })
      s.mark('buildAt')
      const built = await s.waitText(/Cash covers you through|covers you through/i, 30000)
      if (!built) s.fail('verdict "Cash covers you through…" not seen')
      await s.scrollTop(900)
      s.mark('builtAt')
      await sleep(1500)
      for (const t of ['Cash you can spend', 'Lowest point', 'Covered through', 'Ending balance']) { await s.hover(V(t), 450); await sleep(500) }
      await s.click('button:has-text("6M") >> visible=true', { ms: 600 })
      s.mark('h6At')
      await sleep(1600)
      await s.click('button:has-text("13W") >> visible=true', { ms: 600 })
      s.mark('h13At')
      await sleep(1600)
      const gift = await giftBeat(s)
      await s.scrollTo(V('What is not in this forecast'), 1500, { offset: 160 })
      s.mark('notInAt')
      await sleep(1600)
      await s.scrollTop(900)
      await s.hover(V('confidence'), 700)
      await sleep(1500)
      if (!gift) s.note('gift beat failed — re-film it as f7_gift (reset f7 first)')
      return built
    },
  },
  // Fallback: the gift beat alone (the forecast is already built by f7's one take).
  // Rough-cut fix (2026-10-17): the first gift take asked KYRO for the April pledge on
  // the 13W horizon (window ends mid-January), so nothing recounted. Two causes: the
  // gift fell outside the window, and the forecast page does not reproject when KYRO
  // applies a change (useCashFlowProjection ignores penny:data-changed — a product
  // follow-up). This take stays on the build's 13W view and adds a gift dated INSIDE
  // the window through the page's own "Add expected item" form, which reprojects live:
  // the low point, the ending balance and the verdict really recount on camera.
  f7_gift: {
    tempo: 1, school: 'cedar', before: ['f7'], after: ['f7'],
    async run(s) {
      await s.goto('/cash-flow')
      // Pre-roll: the 13W horizon the build was filmed on.
      await s.owlLanded(8000)
      await s.p.locator('button:has-text("13W") >> visible=true').first().click().catch(() => {})
      await s.goto('/cash-flow')
      await s.settle()
      s.mark('beforeAt')
      s.before = await s.p.evaluate(() => document.querySelector('#cf-hero')?.innerText || '').catch(() => '')
      await s.hover(V('Lowest point'), 600)
      await sleep(700)
      await s.hover(V('Ending balance'), 600)
      await sleep(700)
      const ok = await giftBeatForm(s)
      if (!ok) return false
      await s.scrollTo(V('What is not in this forecast'), 1500, { offset: 160 })
      s.mark('notInAt')
      await sleep(1600)
      await s.scrollTop(900)
      await s.hover(V('confidence'), 700)
      await sleep(1500)
      return ok
    },
  },
  f8_analytics: {
    tempo: 0.5, school: 'cedar',
    async run(s) {
      await s.goto('/analytics')
      await s.settle()
      await s.hover(V('Days of cash'), 600)
      await sleep(900)
      await s.click('button:has-text("Scorecard") >> visible=true', { ms: 700 })
      s.mark('scorecardAt')
      await sleep(1500)
      await s.click('button[aria-label="Open the Days Cash on Hand chart"]', { ms: 800 })
      s.mark('chartFlyAt')
      await sleep(2600)
      await s.scrollTop(900)
      await s.click('button:has-text("Peers") >> visible=true', { ms: 700 })
      s.mark('peersAt')
      await sleep(2600)
      await s.hover(V('Peer median'), 600)
      await sleep(1600)
      await s.click('button:has-text("All schools") >> visible=true', { ms: 700 })
      s.mark('orgAt')
      await sleep(2000)
      await s.click('button:has-text("Charts") >> visible=true', { ms: 600 })
      s.mark('orgChartsAt')
      await sleep(1200)
      await s.scrollTo(V('SMALL MULTIPLES, SAME SCALE'), 1300, { offset: 120 })
      await sleep(1600)
      await s.scrollTo(V('WATCH THE RANKING MOVE'), 1300, { offset: 200 })
      await s.click('button:has-text("Play") >> visible=true', { ms: 600 })
      s.mark('raceAt')
      await sleep(5500)
      return true
    },
  },
  f9_board: {
    tempo: 0.45, school: 'cedar', ai: true, before: ['f9'],
    async run(s) {
      await s.goto('/reports')
      await s.settle()
      await s.click('button:has-text("Build board report") >> visible=true', { ms: 800 })
      await sleep(1400)
      s.mark('step1At')
      await s.hover('button:has-text("FY 2026") >> visible=true', 600)
      await sleep(500)
      // Monthly (as the storyboard asks) shows "No operations data for this period" for
      // every month, so the take uses Annual — the variance table and MD&A render.
      await s.click('button:has-text("Annual") >> visible=true', { ms: 600 })
      await sleep(900)
      await s.click('button:has-text("Confirm financials") >> visible=true', { ms: 700 })
      s.mark('step2At')
      await sleep(1800)
      await s.click('button:has-text("Review variance") >> visible=true', { ms: 700 })
      s.mark('step3At')
      await sleep(1600)
      const note = s.p.locator('textarea[placeholder^="Add a comment"] >> visible=true').nth(1)
      await s.click(note, { ms: 700, label: 'Development comment' })
      await s.type('Spring gala moved to July; pledges are on track.', 32)
      s.mark('noteAt')
      await sleep(700)
      await s.scrollTo(V('Management discussion & analysis'), 1200, { offset: 300 })
      await s.click('button:has-text("Draft with AI") >> visible=true', { ms: 700 })
      s.mark('draftAt')
      let drafted = false
      for (let i = 0; i < 90 && !drafted; i++) {
        await sleep(1000)
        drafted = await s.p.evaluate(() => { const t = [...document.querySelectorAll('textarea')].find((e) => /narrative for the committee/.test(e.placeholder)); return !!t && t.value.trim().length > 120 }).catch(() => false)
      }
      s.mark('draftedAt')
      if (!drafted) return s.fail('MD&A not drafted within 90 s') && false
      s.splice('drafting', s.marks.draftAt + 1.6, s.marks.draftedAt - 0.5)
      await sleep(1200)
      await s.hover(V('AI draft'), 600).catch(() => {})
      await sleep(1600)
      await s.click(s.p.locator('button:has-text("Branding") >> visible=true').last(), { ms: 700 })
      await sleep(1300)
      await s.click(s.p.locator('button:has-text("Generate") >> visible=true').last(), { ms: 700 })
      s.mark('step5At')
      await sleep(1300)
      await s.click('button:has-text("Preview in browser") >> visible=true', { ms: 700 })
      await s.p.waitForURL(/\/reports\/board\/print/, { timeout: 20000 }).catch(() => {})
      await sleep(2500)
      s.mark('printAt')
      for (const t of ['Management Discussion & Analysis', 'Statement of Operations', 'Key Indicators', 'Cash & Investments', 'Capital Campaign']) {
        const ok = await s.p.evaluate((t) => {
          const hs = [...document.querySelectorAll('h1,h2,h3,h4')].filter((h) => h.offsetParent && h.textContent.trim().startsWith(t))
          const h = hs.at(-1)
          if (!h) return false
          window.scrollBy({ top: h.getBoundingClientRect().top - 120, behavior: 'smooth' })
          return true
        }, t)
        if (!ok) s.note(`print heading "${t}" not found`)
        await sleep(1300)
        s.mark('print_' + t.split(' ')[0])
      }
      await sleep(1000)
      return true
    },
  },
  // Optional Florida scene (owner approved: Bayview is a Florida network; voiced).
  f10_readiness: {
    tempo: 0.67, school: 'aurelia',
    async run(s) {
      await s.goto('/readiness')
      await s.settle()
      await s.hover(V('received'), 800)
      await sleep(1500)
      await s.hover(V('Report due September 15'), 600).catch(() => {})
      await sleep(1200)
      for (const t of ['Scholarship funds', 'Steps done', 'Checks passing', 'To fix']) { await s.hover(V(t), 450); await sleep(550) }
      await s.hover(V('A self-check'), 700)
      s.mark('selfCheckAt')
      await sleep(1300)
      await s.scrollTo(V('Your steps'), 1400, { offset: 300 })
      s.mark('stepperAt')
      for (const t of ['YOUR NUMBERS', 'RECONCILE', 'READINESS', 'CORRECTIVE', 'CHECKLIST']) { await s.hover(V(t), 420); await sleep(420) }
      await sleep(1200)
      return true
    },
  },
  // ── Ch 3 · Enrollment ───────────────────────────────────────────────────────
  e1_overview: {
    tempo: 0.6, school: 'aurelia',
    async run(s) {
      await s.goto('/enrollment')
      await s.settle()
      await s.hover(V('students'), 800)
      await sleep(1500)
      await s.hover(V('STUDENTS'), 700)
      await sleep(900)
      for (const t of ['Add data', 'Records', 'Analytics']) { await s.hover(s.p.locator(`button:has-text("${t}"), a:has-text("${t}")`).filter({ visible: true }), 450); await sleep(350) }
      for (const t of ['Students enrolled', 'Gap to plan', 'Plan']) { await s.hover(V(t), 450); await sleep(650) }
      await s.scrollTo(V('Students by grade'), 1500, { offset: 110 })
      s.mark('byGradeAt')
      await s.glide(900, 700, 900)
      await sleep(1200)
      await s.scrollTo(V('Look deeper'), 1500, { offset: 120 })
      s.mark('deeperAt')
      for (const t of ['Headcount', 'Grades', 'Cohorts']) { await s.hover(`h3:has-text("${t}") >> visible=true`, 500); await sleep(700) }
      await sleep(800)
      return true
    },
  },
  e2_in: {
    tempo: 0.7, school: 'brightwater', after: ['e2'],
    async run(s) {
      await s.goto('/enrollment?tab=add')
      await s.settle()
      await s.hover(V('Connect your SIS'), 800)
      s.mark('sisAt')
      await sleep(2600)
      await s.click('button[aria-label^="Upload a roster file"]', { ms: 800 })
      s.mark('uploadAt')
      await sleep(1200)
      await s.hover(V('Drop a roster file here'), 700)
      await s.p.locator('input[type=file]').first().setInputFiles(F('brightwater-oneroster/users.csv'))
      await sleep(1300)
      await s.click('button:has-text("Confirm & apply roster")', { ms: 700 })
      const saved = await s.waitText(/Student records saved/, 20000)
      s.mark('savedAt')
      await s.scrollTo(V('This file listed'), 1100, { offset: 260 })
      await s.hover(V('Student records saved'), 600)
      await sleep(1300)
      await s.hover(V('is now'), 600)
      await sleep(1500)
      // Org scope → "Import all schools": one diocesan file, every match reviewed.
      s.mark('cutDiocesan')
      await s.switchTo('aurelia', 'org', '/enrollment/diocesan-import')
      s.mark('diocesanAt')
      await s.p.locator('input[type=file]').first().setInputFiles(F('Bayview Fall Census 2026-27.xlsx'))
      const matched = await s.waitText(/Check each match/, 20000)
      await sleep(900)
      await s.scrollTo(V('Check each match'), 1400, { offset: 100 })
      s.mark('matchesAt')
      for (const t of ['Saint Aurelia Academy', 'Cedar Ridge Preparatory School', 'Heron Cove Acad.']) { await s.hover(V(t), 550); await sleep(800) }
      await sleep(1500)
      s.mark('actionEnd')
      // Cancel without committing (off the cut: after actionEnd).
      await s.scrollTop(500)
      await s.click('button:has-text("Discard") >> visible=true', { ms: 300 })
      await sleep(1500)
      return saved && matched
    },
  },
  e3_trend: {
    tempo: 1.35, school: 'aurelia',
    async run(s) {
      await s.goto('/enrollment?tab=analytics&view=trend')
      await s.settle()
      await s.scrollTo(V('Headcount over time'), 1500, { offset: 140 })
      s.mark('trendAt')
      await s.glide(1100, 640, 1200)
      await s.idle(5000, { box: [500, 400, 1700, 900] })
      return true
    },
  },
  e4_grades: {
    tempo: 0.6, school: 'aurelia', ai: true,
    async run(s) {
      await s.goto('/enrollment?tab=analytics&view=trend')
      await s.settle()
      await sleep(600)
      if (!(await s.openChat())) return false
      await s.askChat('Where do I see which grades are short of plan? Point it out.')
      const ok = await s.waitGuide(50000, 'enr-vs-plan')
      if (!ok) { s.note('no flight to #enr-vs-plan'); return false }
      s.splice('thinking', s.marks.askAt + 1.8, s.marks.flightAt - 0.6)
      await sleep(3200)
      await s.scrollTo(V('Which grades carry the miss'), 1500, { offset: 140 })
      s.mark('missAt')
      await sleep(1800)
      await s.scrollTo(V('Every grade, every year'), 1500, { offset: 140 })
      s.mark('heatAt')
      await sleep(1800)
      return /view=grades/.test(s.p.url())
    },
  },
  e5_cohorts: {
    tempo: 0.95, school: 'aurelia',
    async run(s) {
      await s.goto('/enrollment?tab=analytics&view=cohorts')
      await s.settle()
      await s.scrollTo(V('Cohort size progression'), 1500, { offset: 140 })
      s.mark('cohortsAt')
      await s.hover(V('One class per panel'), 700)
      s.mark('captionAt')
      await sleep(2000)
      // Glide along the panels; rest on one rung for its tooltip.
      const dots = s.p.locator('svg circle').filter({ visible: true })
      const n = await dots.count()
      for (const k of [0.15, 0.4, 0.62]) {
        if (n > 6) { await s.hover(dots.nth(Math.floor(n * k)), 900); await sleep(1400) }
      }
      s.mark('tooltipAt')
      await sleep(1600)
      await s.hover(V('One class per panel'), 900)
      await sleep(2200)
      return true
    },
  },
  e6_who: {
    tempo: 1.18, school: 'aurelia',
    async run(s) {
      await s.goto('/enrollment?tab=analytics&view=who')
      await s.settle()
      // Both cards sit side by side; keep "Explore the records" below the frame.
      await s.scrollTo(V('Demographic mix'), 1500, { offset: 380 })
      s.mark('mixAt')
      await s.hover(V('White'), 700).catch(() => {})
      await sleep(900)
      await s.hover(V('withheld'), 700).catch(() => {})
      s.mark('withheldAt')
      await sleep(1800)
      await s.hover(V('Support needs and register status'), 700).catch(() => {})
      s.mark('supportAt')
      await sleep(900)
      await s.hover(V('fewer than 5'), 700).catch(() => {})
      await sleep(2000)
      const explore = await s.p.evaluate(() => { const w = document.evaluate('//*[contains(text(),"Explore the records")]', document.body, null, 9, null).singleNodeValue; return w ? Math.round(w.getBoundingClientRect().top) : null })
      if (explore != null && explore < 1080) s.note(`"Explore the records" heading is on screen (y=${explore})`)
      return true
    },
  },
  // Rough-cut fix (2026-10-17): the first take pressed a page-level Ctrl+A at the
  // feeder field and filmed the whole Planning page selected; the cut also came
  // before the voice finished "…into tuition and cash". Now: the brief holds longer,
  // Planning opens (off the cut) already on the year-end forecast — below the band,
  // whose "—" tiles wait on a saved forecast that is never saved — and the feeder
  // value is typed into the field's own selection. Any page selection fails the take.
  e7_budget: {
    tempo: 1, school: 'aurelia', before: ['e7-before'], after: ['e7'],
    async run(s) {
      await s.goto('/app')
      // Pre-roll (before settledAt): the brief is LLM-worded and cached; regenerate it
      // off camera until the enrollment item reads "…below our plan of 207".
      await s.owlLanded(8000)
      await s.p.locator('button:has-text("Open Daily Briefing")').first().click().catch(() => {})
      const item = () => s.p.evaluate(() => (document.body.innerText.match(/[^\n]*students below[^\n]*/) || [''])[0]).catch(() => '')
      const wait = async (pred, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await item(); if (pred(v)) return v; await rawSleep(400) } return item() }
      let line = await wait((v) => v.length > 0, 60000)
      for (let k = 0; k < 6 && !/below our plan of 207/.test(line); k++) {
        s.note(`pre-roll: brief reads "${line.slice(0, 90)}" — regenerating`)
        const prev = line
        await s.p.locator('button[aria-label="Regenerate the morning brief"]').first().click().catch(() => {})
        await rawSleep(1500)
        line = await wait((v) => v.length > 0 && v !== prev, 90000)
      }
      await s.p.keyboard.press('Escape').catch(() => {})
      await s.goto('/app')
      await s.settle()
      await sleep(400)
      await s.click('button:has-text("Open Daily Briefing")', { ms: 800 })
      const ok = await s.waitText(/below our plan of/, 45000)
      s.mark('briefAt')
      const words = await s.p.evaluate(() => (document.body.innerText.match(/[^\n]*below our plan of[^\n]*/) || [''])[0])
      s.briefLine = words
      if (!/below our plan of 207/.test(words)) s.note(`brief wording: "${words.slice(0, 120)}"`)
      await sleep(700)
      await s.hover(V('below our plan of'), 800)
      s.mark('enrollmentItemAt')
      await sleep(4600)
      s.mark('cutPlanning')
      // Off the cut: close the brief, open Planning on the year-end forecast.
      const c = s.at()
      await s.p.keyboard.press('Escape')
      await s.goto('/planning', { settle: 400 })
      await s.owlLanded(6000)
      await s.p.locator(V('Fiscal-year-end forecast')).first().evaluate((n) => window.scrollTo({ top: n.getBoundingClientRect().top + scrollY - 90, behavior: 'instant' })).catch(() => s.note('no year-end forecast section'))
      await s.p.evaluate(() => window.getSelection()?.removeAllRanges()).catch(() => {})
      await rawSleep(700)
      s.splice('cut /planning', c + 0.05, s.at() - 0.05)
      s.mark('planningAt')
      await s.hover(V('Next year’s roster is computed'), 600).catch(() => {})
      await sleep(500)
      await s.click('button:has-text("Roll forward from this year")', { ms: 700 })
      s.mark('rollAt')
      await sleep(1000)
      const grad = s.p.locator('select >> visible=true').filter({ has: s.p.locator('option:text-is("Grade 12")') }).first()
      await s.smoothTo(grad, 800, { offset: 430 })
      await s.click(grad, { ms: 500, label: 'Graduating grade' })
      const v = await grad.evaluate((e) => [...e.options].find((o) => o.textContent.trim() === 'Grade 8')?.value).catch(() => null)
      if (v != null) await grad.selectOption(v)
      else s.note('no "Grade 8" option')
      await s.p.keyboard.press('Escape').catch(() => {})
      s.mark('gradAt')
      await sleep(800)
      const feeder = s.p.locator('input[aria-label="PK-3 — incoming students"]')
      await s.smoothTo(feeder, 700, { offset: 560 })
      await s.click(feeder, { ms: 500, label: 'PK-3 feeder' })
      await feeder.evaluate((e) => e.select()) // the field's own value only — never the page
      await s.type('6', 120)
      s.mark('feederAt')
      await s.p.keyboard.press('Tab')
      await sleep(700)
      if ((await s.selectedChars()) > 0) s.fail('page text is selected after typing the feeder value')
      await s.smoothTo(V('Fiscal-year-end forecast'), 900, { offset: 90 })
      s.mark('forecastAt')
      await s.hover(V('FORECAST REVENUE'), 500)
      await sleep(800)
      await s.hover(V('NET SURPLUS'), 500)
      s.mark('netAt')
      await sleep(2400)
      if ((await s.selectedChars()) > 0) return s.fail('page text is selected at the end of the take') && false
      return ok
    },
  },
  // ── Ch 4 · Academics ────────────────────────────────────────────────────────
  a1_upload: {
    tempo: 0.8, school: 'aurelia', scope: 'org', before: ['a1'],
    async run(s) {
      await s.goto('/academics/network')
      await s.settle()
      await s.hover(V('Academics'), 700)
      await sleep(900)
      await s.click(s.p.getByText('Upload results', { exact: true }).filter({ visible: true }), { ms: 800, label: 'Upload results' })
      await sleep(1600)
      await s.scrollTo(V('One file, every school'), 1300, { offset: 90 })
      s.mark('sectionAt')
      await s.hover(V('The publisher'), 600).catch(() => {})
      await s.p.locator('input[type=file]').first().setInputFiles(F('bayview-terranova-2026-results.csv'))
      const prev = await s.waitText(/SCHOOLS MATCHED|Schools matched/i, 20000)
      await sleep(600)
      await s.scrollTo(V('One file, every school'), 900, { offset: 60 })
      s.mark('previewAt')
      await s.hover(V('SCHOOLS MATCHED'), 600).catch(() => {})
      await sleep(1100)
      for (const t of ['St. Aurelia Academy', 'St. Odile Catholic School', 'Heron Cove Academy']) { await s.hover(`text=${t} >> visible=true >> nth=-1`, 500); await sleep(500) }
      await s.click('button:has-text("Save to 3 schools") >> visible=true', { ms: 800 })
      s.mark('saveAt')
      await sleep(3000)
      return prev
    },
  },
  a2_overview: {
    school: 'aurelia',
    async run(s) {
      await s.goto('/academics')
      await s.settle()
      await sleep(1500)
      for (const t of ['Average score', 'Rank', 'Widest gap', 'Trend', 'Participation']) { await s.hover(V(t), 500); await sleep(800) }
      await s.scrollTo(V('How you compare'), 1500, { offset: 120 })
      s.mark('compareAt')
      await s.hover(V('of 3 schools'), 600).catch(() => {})
      await sleep(2400)
      return true
    },
  },
  a3_standing: {
    tempo: 1.1, school: 'aurelia',
    async run(s) {
      await s.goto('/academics?tab=analytics&view=standing')
      await s.settle()
      await s.scrollTo(V('Every school'), 1300, { offset: 160 })
      await sleep(1300)
      const sw = s.p.locator('[role=switch]:near(:text("Hide peer names")), button:has-text("Hide peer names"), label:has-text("Hide peer names")').first()
      await s.click(sw, { ms: 700, label: 'Hide peer names' })
      s.mark('hideAt')
      await sleep(2600)
      await s.scrollTo(V('Where the gap actually is'), 1400, { offset: 140 })
      s.mark('gapAt')
      await sleep(2000)
      await s.scrollTo(V('Where instruction is landing'), 1400, { offset: 140 })
      s.mark('heatAt')
      await sleep(2400)
      s.mark('actionEnd')
      // Put the switch back (off camera: after actionEnd).
      await s.scrollTo(V('Hide peer names'), 300, { offset: 300 })
      await s.click(sw, { ms: 200, label: 'Hide peer names (restore)' })
      await sleep(800)
      return true
    },
  },
  a4_classroom: {
    tempo: 0.8, school: 'aurelia',
    async run(s) {
      await s.goto('/academics?tab=analytics&view=classroom')
      await s.settle()
      for (const t of ['Where students actually sit', 'Who the average is hiding', 'What this school does well', 'Where to put the next hour']) {
        await s.scrollTo(V(t), 1300, { offset: 130 })
        s.mark('sec_' + t.split(' ').slice(-1)[0])
        await s.glide(1000, 600, 700)
        await sleep(1700)
      }
      return true
    },
  },
  // Rough-cut fix (2026-10-17): the first take's native smooth scroll was cancelled,
  // so "Growth against achievement" stayed below the fold while the voice described
  // it. Frame-driven scroll; the four-corner chart is held, St. Aurelia's dot first.
  a5_time: {
    tempo: 1, school: 'aurelia',
    async run(s) {
      await s.goto('/academics?tab=analytics&view=time')
      await s.settle()
      await s.smoothTo(V('Are we moving'), 900, { offset: 120 })
      s.mark('trendAt')
      await s.glide(1150, 560, 800)
      await sleep(1700)
      // Exact text: "The trend, and growth against achievement" (the section subtitle)
      // also matches a loose text= locator, which is what the first take scrolled to.
      const qh = s.p.getByText('Growth against achievement', { exact: true }).filter({ visible: true })
      await s.smoothTo(qh, 1100, { offset: 96 })
      s.mark('quadrantAt')
      const top = await qh.first().evaluate((n) => Math.round(n.getBoundingClientRect().top)).catch(() => null)
      if (top == null || top < 0 || top > 260) s.fail(`quadrant header not framed (top=${top})`)
      // St. Aurelia's dot label — the one inside the chart, not the sidebar switcher.
      const dot = await s.p.evaluate(() => {
        const els = [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && /^St\. Aurelia/.test((e.textContent || '').trim()))
        const r = els.map((e) => e.getBoundingClientRect()).find((r) => r.left > 320 && r.top > 120 && r.top < 1000 && r.width > 0)
        return r ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null
      }).catch(() => null)
      if (dot) await s.glide(dot.x, dot.y, 700)
      else s.note('St. Aurelia dot label not found in the quadrant')
      s.mark('dotAt')
      await sleep(1500)
      await s.hover(V('Behind, but rising'), 600)
      s.mark('cornersAt')
      await sleep(500)
      await s.hover(V('Ahead, but slipping'), 600)
      await sleep(500)
      await s.hover(V('Ahead and rising'), 600)
      s.mark('aheadAt')
      await sleep(900)
      await s.hover(V('Behind and falling'), 600)
      s.mark('fallingAt')
      await sleep(900)
      if (dot) await s.glide(dot.x, dot.y, 700)
      await sleep(1500)
      return top != null && top >= 0 && top <= 260
    },
  },
  a6_cohorts: {
    tempo: 0.6, school: 'aurelia', ai: true,
    async run(s) {
      await s.goto('/academics?tab=analytics&view=time')
      // Pre-roll (before settledAt): clear an earlier scene's conversation off camera,
      // so the on-camera open shows "Hi! I'm KYRO" (the first take showed e4's chat).
      await s.owlLanded(8000)
      await s.freshChat()
      await s.goto('/academics?tab=analytics&view=time')
      await s.settle()
      await sleep(600)
      if (!(await s.openChat())) return false
      if (s.staleChatAt != null) return s.fail('the chat opened on an earlier conversation on camera') && false
      await s.askChat("Where do I see how this year's fifth graders have moved since third grade? Point it out.")
      const ok = await s.waitGuide(50000, 'academics-cohort-panels')
      if (!ok) { s.note('no flight to #academics-cohort-panels'); return false }
      s.splice('thinking', s.marks.askAt + 1.8, s.marks.flightAt - 0.6)
      await sleep(3200)
      await s.hover(V('Grades 3 → 5'), 700).catch(() => {})
      await sleep(2200)
      return /view=cohorts/.test(s.p.url())
    },
  },
  a7_network: {
    school: 'cedar',
    async run(s) {
      await s.goto('/academics?tab=analytics&view=network')
      await s.settle()
      await sleep(900)
      await s.click(s.p.getByRole('button', { name: 'ACT', exact: true }), { ms: 800, label: 'ACT chip' })
      s.mark('actAt')
      await sleep(2000)
      await s.scrollTo(V('Every school, both years'), 1400, { offset: 130 })
      await sleep(1800)
      await s.scrollTo(V('Sortable, for the packet'), 1400, { offset: 130 })
      s.mark('sortableAt')
      const th = s.p.locator('th:has-text("Change"), button:has-text("Change")').filter({ visible: true }).first()
      if (await th.count()) { await s.click(th, { ms: 700, label: 'sort by movement' }); s.mark('sortAt'); await sleep(1500) }
      await s.scrollTo(V('Participation against score'), 1400, { offset: 130 })
      s.mark('participationAt')
      await s.hover(V('read with care'), 700).catch(() => {})
      await sleep(2000)
      await s.scrollTo(V('What this score cost'), 1400, { offset: 130 })
      s.mark('costAt')
      await sleep(2200)
      return await s.visible(V('read with care'), 1000).catch(() => false)
    },
  },
  // ── Ch 5 · Accreditation (Cedar Ridge) ──────────────────────────────────────
  r1_overview: {
    tempo: 1.2, school: 'cedar',
    async run(s) {
      await s.goto('/accreditation')
      await s.settle()
      await s.hover(V('from Accredited'), 900)
      await sleep(2200)
      await s.scrollTo(V('Where you are in the cycle'), 1500, { offset: 120 })
      s.mark('cycleAt')
      await s.hover(V('You are here'), 700).catch(() => {})
      await sleep(2200)
      await s.hover(V('Next:'), 700).catch(() => {})
      s.mark('nextAt')
      await sleep(2400)
      return true
    },
  },
  r2_frameworks: {
    school: 'cedar', after: ['r2'],
    async run(s) {
      await s.goto('/accreditation')
      await s.settle()
      await s.click('button:has-text("Frameworks") >> visible=true', { ms: 800 })
      s.mark('modalAt')
      await sleep(1800)
      await s.hover(V('Cognia'), 600).catch(() => {})
      await sleep(1200)
      for (const t of ['Florida Catholic Conference', 'Accreditrac', 'NIPSA', 'MSA', 'ACSI']) {
        const l = s.p.locator(`[role=dialog] >> text=${t} >> visible=true`).first()
        if (await l.count()) { await l.scrollIntoViewIfNeeded().catch(() => {}); await s.hover(l, 600); s.mark('fw_' + t.split(' ')[0]); await sleep(1100) } else s.note(`framework "${t}" not found in modal`)
      }
      await s.p.keyboard.press('Escape')
      s.mark('closedAt')
      await sleep(1200)
      return true
    },
  },
  r3_wins: {
    school: 'cedar',
    async run(s) {
      await s.goto('/accreditation')
      await s.settle()
      await s.scrollTo(V('Quickest wins'), 1500, { offset: 100 })
      s.mark('winsAt')
      for (const t of ['COG-11', 'COG-14', 'COG-23']) { await s.hover(V(t), 500); await sleep(700) }
      await sleep(600)
      await s.scrollTo(V('Must-pass checks'), 1400, { offset: 100 })
      s.mark('mustAt')
      await s.hover(V('Not met'), 600)
      await sleep(1600)
      await s.hover(V('4 of 6 met'), 600).catch(() => {})
      await sleep(1600)
      return true
    },
  },
  r4_standard: {
    tempo: 0.8, school: 'cedar', after: ['r4'],
    async run(s) {
      await s.goto('/accreditation')
      await s.settle()
      await s.scrollTo(V('Quickest wins'), 1300, { offset: 100 })
      await s.click('button:has-text("Work on it") >> visible=true', { ms: 800 })
      const ok = await s.visible('[role=dialog] >> text=What raises this standard', 5000)
      s.mark('panelAt')
      await sleep(1200)
      // 1. Score it against the rubric (the dial behind ticks).
      await s.click('[role=dialog] [role=radio][aria-label^="2 — "] >> nth=0', { ms: 700, label: 'rubric 2' })
      s.mark('scoredAt')
      await sleep(1500)
      // 2. Attach evidence → "Attach from operations": policies, then (scrolled) the
      //    board reports and approved minutes — attach the latest board minutes.
      await s.click('[role=dialog] button:has-text("Attach from operations") >> nth=0', { ms: 700 })
      await sleep(1100)
      s.mark('operationsAt')
      const pick = s.p.locator('[role=dialog]').filter({ hasText: 'Attach from operations' }).last()
      await s.hover(pick.locator('text=Board Governance Policy Manual').first(), 600).catch(() => {})
      await sleep(600)
      // Scroll the list itself (its own scroll box) so BOARD REPORTS + MINUTES show.
      await pick.locator('text=BOARD REPORTS').first().evaluate((n) => {
        let b = n.parentElement
        while (b && !(b.scrollHeight > b.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(b).overflowY))) b = b.parentElement
        if (!b) return n.scrollIntoView({ block: 'start', behavior: 'smooth' })
        const to = b.scrollTop + n.getBoundingClientRect().top - b.getBoundingClientRect().top - 12
        b.scrollTo({ top: to, behavior: 'smooth' })
      }).catch(() => s.note('no BOARD REPORTS group in the attach list'))
      await sleep(1100)
      s.mark('minutesAt')
      await s.hover(pick.locator('text=Board report — FY 2026').first(), 550).catch(() => {})
      await sleep(500)
      const mins = pick.locator('text=/Board of Trustees — regular meeting — 2026-09-17/').first()
      await s.hover(mins, 550).catch(() => {})
      await sleep(400)
      const row = pick.locator('li, div').filter({ hasText: /Board of Trustees — regular meeting — 2026-09-17/ }).filter({ has: s.p.locator('button:has-text("Attach")') }).last()
      const attachBtn = row.locator('button:has-text("Attach")').first()
      if (await attachBtn.count()) await s.click(attachBtn, { ms: 500, label: 'Attach minutes' })
      else { s.note('minutes row not found — attaching the first item'); await s.click(pick.locator('button:has-text("Attach")').first(), { ms: 500, label: 'Attach (first)' }) }
      s.mark('attachedAt')
      await sleep(1500)
      // 3. Plan the work → the Improvement tab (owners and dates).
      const openImp = s.p.locator('[role=dialog] button:has-text("Open improvement")').first()
      await openImp.scrollIntoViewIfNeeded().catch(() => {})
      await sleep(400)
      await s.click(openImp, { ms: 700, label: 'Open improvement' })
      s.mark('improvementAt')
      await sleep(900)
      await s.scrollTo('[role=tabpanel] >> visible=true', 1300, { offset: 160, timeout: 2500 })
      await s.glide(1000, 600, 700)
      await sleep(1800)
      return ok
    },
  },
  r5_warnings: {
    school: 'cedar',
    async run(s) {
      await s.goto('/accreditation?center=signals')
      await s.settle()
      await s.scrollTo(V('next twenty-four months'), 1400, { offset: 120 })
      s.mark('timelineAt')
      await s.glide(1000, 640, 900)
      await sleep(1600)
      await s.scrollTo(V('past their own scheduled review date'), 1400, { offset: 160 })
      s.mark('policiesAt')
      await sleep(1600)
      await s.scrollTo(V('Operational signals'), 1400, { offset: 120 })
      s.mark('signalsAt')
      await sleep(1600)
      await s.click(V('What KYRO could read'), { ms: 700 })
      s.mark('couldReadAt')
      await sleep(2200)
      return true
    },
  },
  r6_visit: {
    school: 'cedar',
    async run(s) {
      await s.goto('/accreditation/visit')
      await s.settle()
      for (const t of ['Projected score', 'Backed by proof', 'Likely findings', 'Strengths to commend']) { await s.hover(V(t), 450); await sleep(500) }
      for (const k of ['arrival', 'commendations', 'findings', 'requests', 'unanswered', 'plan']) {
        await s.scrollTo(`#act-${k}`, 1050, { offset: 110, timeout: 2500 })
        s.mark('act_' + k)
      }
      await s.scrollTop(1000)
      await s.click('button:has-text("Read it to me") >> visible=true', { ms: 800 })
      s.mark('readAt')
      await sleep(6500)
      if (!s.owlDid('talking', s.marks.readAt)) s.note('the owl did not talk during "Read it to me"')
      return true
    },
  },
  r7_board: {
    tempo: 0.8, school: 'cedar',
    async run(s) {
      await s.goto('/accreditation/board/print')
      await s.settle()
      await s.hover(V('Where we stand'), 700).catch(() => {})
      await sleep(1300)
      await s.scrollTo(V('Executive summary'), 1200, { offset: 140 })
      await sleep(900)
      await s.scrollTo(V('likely find'), 1200, { offset: 140 })
      await sleep(800)
      s.mark('cutImprovement')
      // Off the cut: Improvement, scrolled to the initiatives in flight (owners, dates).
      const c = s.at()
      await s.goto('/improvement', { settle: 400 })
      await s.owlLanded(6000)
      await s.p.locator('text=Owned, dated work').first().evaluate((n) => window.scrollTo({ top: n.getBoundingClientRect().top + scrollY - 330, behavior: 'instant' })).catch(() => s.note('no Initiatives section'))
      await rawSleep(600)
      s.splice('cut /improvement', c + 0.05, s.at() - 0.05)
      s.mark('improvementAt')
      await s.hover(V('Self-score the remaining'), 700).catch(() => {})
      await sleep(700)
      await s.hover(V('due Dec 18, 2026'), 600).catch(() => {})
      s.mark('dueAt')
      await sleep(800)
      // Exact: a loose match is the band's "1 behind pace." and scrolls the page up.
      await s.hover(s.p.getByText('Behind pace', { exact: true }).filter({ visible: true }), 500).catch(() => {})
      await sleep(700)
      await s.hover(V('File the legal-compliance'), 600).catch(() => {})
      await sleep(1600)
      return true
    },
  },
  // ── Ch 6 · One school or many ───────────────────────────────────────────────
  // Rough-cut fix (2026-10-17): the pages are held to the voice (Governance through
  // "…the same way: governance", quick looks at Facilities, Advancement and H R, and
  // Strategic Planning from "strategic" to the end); the build cuts on those words.
  x1_sweep: {
    tempo: 1, school: 'aurelia',
    async run(s) {
      await s.goto('/governance')
      await s.settle()
      const pages = ['/governance', '/facilities', '/advancement', '/hr', '/strategy']
      const dwell = { governance: 4300, facilities: 1900, advancement: 1900, hr: 2100 }
      for (let i = 0; i < pages.length; i++) {
        const key = pages[i].slice(1)
        if (i) { const c = s.at(); await s.goto(pages[i], { settle: 400 }); await s.owlLanded(4000); s.splice('load_' + key, c + 0.1, s.at() - 0.1) }
        s.mark(key + 'At')
        if (key === 'strategy') {
          await s.glide(980, 420, 800)
          await sleep(1500)
          await s.drift(420, 2600)
          await s.glide(1100, 640, 900)
          await sleep(3200)
        } else {
          const ms = dwell[key]
          await s.glide(800 + Math.random() * 500, 300 + Math.random() * 150, 600)
          await sleep(ms - 1400)
          await s.drift(110, 800)
        }
      }
      return true
    },
  },
  // Rough-cut fix (2026-10-17): o1 ended on the campus home still fading in. The org
  // beats are tighter, and after the drill the take waits for Cedar Ridge's home to
  // render (band + tiles) and holds it, so the last beat is the campus itself.
  o1_org: {
    tempo: 1, school: 'aurelia',
    async run(s) {
      await s.goto('/app')
      await s.settle()
      await sleep(300)
      await s.click('button[aria-label^="Viewing"]', { ms: 700 })
      s.mark('switcherAt')
      await sleep(900)
      await s.click('[role=menuitem]:has-text("Whole organization")', { ms: 600 })
      s.mark('orgAt')
      await s.waitText(/Across the network/i, 15000)
      await sleep(1000)
      await s.hover(V('Across the network'), 600).catch(() => {})
      await sleep(600)
      await s.scrollTo(V('Schools'), 1100, { offset: 140 }).catch(() => {})
      s.mark('registerAt')
      await sleep(700)
      await s.click('[role=tab]:has-text("Modules") >> visible=true', { ms: 600 })
      s.mark('modulesAt')
      await sleep(1100)
      await s.click('[role=tab]:has-text("Organization KPIs") >> visible=true', { ms: 500 })
      s.mark('kpisAt')
      await sleep(900)
      const drill = s.p.locator('button[aria-label^="Switch to Cedar Ridge"], a:has-text("Cedar Ridge Preparatory"), button:has-text("Cedar Ridge Preparatory")').filter({ visible: true }).first()
      await s.click(drill, { ms: 800, label: 'drill into Cedar Ridge' })
      s.mark('drillAt')
      const t0 = Date.now()
      let home = false
      while (!home && Date.now() - t0 < 15000) {
        home = await s.p.evaluate(() => {
          const txt = document.body.innerText
          if (!/Good morning, Morgan/.test(txt) || !/Cedar Ridge Preparatory/.test(txt)) return false
          if ([...document.querySelectorAll('h3')].filter((h) => h.getBoundingClientRect().width > 0).length < 8) return false
          const busy = [...document.querySelectorAll('.animate-pulse, [class*="skeleton"], [aria-busy="true"]')].some((e) => { const r = e.getBoundingClientRect(); return r.width > 200 && r.height > 40 && r.bottom > 0 && r.top < innerHeight })
          return !busy
        }).catch(() => false)
        if (!home) await rawSleep(150)
      }
      await rawSleep(700) // let the page's fade-in finish
      s.mark('cedarHomeAt')
      if (!home) s.note('Cedar Ridge home not seen settled within 15 s')
      await s.glide(760, 540, 900)
      await sleep(3800)
      return home
    },
  },
  o2_studio: {
    tempo: 0.65, school: 'aurelia', ai: true, oneTake: true, after: ['o2'],
    async run(s, mode) {
      await s.goto('/penny')
      await s.settle('settledAt', { studio: true })
      // S9: what the stubbed mic will "hear" (set after the navigation, on this document).
      await s.p.evaluate(() => { window.__kyroSpeech = { text: 'show me five years of enrollment', wordMs: 360, leadMs: 900 } })
      await sleep(1500)
      await s.click('button[aria-label="Turn on hands-free voice"]', { ms: 900 })
      s.mark('listenAt')
      await s.p.evaluate(() => { setTimeout(() => { window.__kyroSpeech = { text: '' } }, 300) })
      const heard = await s.waitText(/five years of enrollment/i, 8000)
      s.mark('heardAt')
      let chart = false
      for (let i = 0; i < 70 && !chart; i++) {
        await sleep(1000)
        chart = await s.p.evaluate(() => [...document.querySelectorAll('main svg, [class*=chart] svg')].some((e) => e.getBoundingClientRect().width > 300)).catch(() => false)
      }
      s.mark('chartAt')
      s.splice('thinking', s.marks.heardAt + 2.0, s.marks.chartAt - 0.8)
      await sleep(3500)
      await s.click('button[aria-label="Turn off hands-free voice"]', { ms: 600 }).catch(() => {})
      await s.drift(300, 1200)
      await sleep(1200)
      const ta = s.p.locator('textarea >> visible=true').last()
      await s.click(ta, { ms: 700, label: 'Studio ask bar' })
      await s.type('Add a repair for the gym roof', 32)
      s.mark('askAt')
      await s.p.keyboard.press('Enter')
      const prop = s.p.locator('button:has-text("Confirm") >> visible=true').last()
      const gotProp = await prop.waitFor({ state: 'visible', timeout: 70000 }).then(() => true).catch(() => false)
      s.mark('proposalAt')
      s.splice('thinking2', s.marks.askAt + 1.8, s.marks.proposalAt - 0.8)
      await sleep(1500)
      if (!gotProp) return s.fail('no proposal with Confirm') && false
      await s.hover(prop, 700)
      await sleep(1200)
      if (mode !== 'final') { s.note('DRY: Confirm hovered, NOT pressed (the action log keeps every row)'); await sleep(1200); return heard && chart }
      await s.click(prop, { ms: 400 })
      s.mark('confirmAt')
      await sleep(3000)
      const undo = s.p.locator('button:has-text("Undo") >> visible=true').first()
      if (await undo.count()) { await undo.scrollIntoViewIfNeeded().catch(() => {}); await s.hover(undo, 800); s.mark('undoShownAt') } else s.note('no Undo row visible after Confirm')
      await sleep(2500)
      return heard && chart
    },
  },
}

async function giftBeat(s) {
  if (!(await s.openChat())) return false
  await s.askChat('Add the April capital-campaign gift to my cash forecast: the Whitcombe pledge, $150,000, one time on April 15, 2027.')
  const prop = s.p.locator('[aria-label="KYRO AI assistant"] button:has-text("Confirm") >> visible=true').last()
  const got = await prop.waitFor({ state: 'visible', timeout: 70000 }).then(() => true).catch(() => false)
  s.mark('giftProposalAt')
  if (!got) { s.note('no gift proposal'); return false }
  s.splice('giftThinking', s.marks.askAt + 1.8, s.marks.giftProposalAt - 0.8)
  await sleep(1600)
  await s.click(prop, { ms: 700 })
  s.mark('giftConfirmAt')
  await sleep(2800)
  await s.click('button[aria-label="Close KYRO AI"]', { ms: 600 }).catch(() => {})
  await sleep(1800) // the figures recount
  s.mark('recountAt')
  return true
}

/** f7's gift beat through the page's own form ("Add expected item" → Add to forecast),
 *  which reprojects on save. Fails the take unless the hero figures change. */
async function giftBeatForm(s) {
  const fig = (t) => (t.match(/\$[\d,]+/g) || []).join(' ')
  const hero = () => s.p.evaluate(() => document.querySelector('#cf-hero')?.innerText || '').catch(() => '')
  await s.click('button:has-text("Add expected item") >> visible=true', { ms: 700 })
  s.mark('addAt')
  const dlg = s.p.locator('[role=dialog]').filter({ hasText: 'Money in or out' }).last()
  if (!(await dlg.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false))) return s.fail('the expected-item form did not open') && false
  await sleep(500)
  await s.type('Year-end gift', 45)
  s.mark('labelDoneAt')
  await sleep(300)
  const sels = dlg.locator('select')
  const nSel = await sels.count()
  if (nSel < 4) s.note(`expected 4 selects in the form, found ${nSel}`)
  await s.click(sels.nth(0), { ms: 450, label: 'Money in or out' })
  await sels.nth(0).selectOption('in')
  await s.p.keyboard.press('Escape').catch(() => {})
  await sleep(250)
  const amt = dlg.getByLabel('Amount')
  await s.click(amt, { ms: 450, label: 'Amount' })
  await s.type('150000', 45)
  await sleep(250)
  await s.click(dlg.getByText('Select date…'), { ms: 450, label: 'Date' })
  const cal = s.p.locator('[role=dialog][aria-label="Choose a date"]')
  await cal.waitFor({ state: 'visible', timeout: 3000 }).catch(() => s.note('date picker did not open'))
  await s.click(cal.locator('button[aria-label="Next month"]'), { ms: 350, label: 'Next month' })
  await sleep(200)
  await s.click(cal.locator('button[aria-label="Next month"]'), { ms: 200, label: 'Next month' })
  await sleep(250)
  await s.click(cal.locator('button').filter({ hasText: /^1$/ }).first(), { ms: 350, label: 'December 1' })
  await sleep(300)
  if (nSel >= 4) {
    await sels.nth(2).selectOption('fundraising').catch(() => s.note('category not set'))
    await sels.nth(3).selectOption('committed').catch(() => s.note('confidence not set'))
  }
  const formText = await dlg.innerText().catch(() => '')
  if (!/Dec(ember)? 1,? 2026|2026-12-01|12\/0?1\/2026/.test(formText)) s.note(`date field reads: "${formText.replace(/\s+/g, ' ').slice(0, 200)}"`)
  s.mark('formDoneAt')
  await sleep(500)
  await s.click(dlg.locator('button:has-text("Add to forecast")'), { ms: 600, label: 'Add to forecast' })
  s.mark('saveAt')
  const t0 = Date.now()
  let after = await hero()
  while (fig(after) === fig(s.before || '') && Date.now() - t0 < 15000) { await rawSleep(120); after = await hero() }
  s.mark('recountAt')
  await s.hover(V('Lowest point'), 450)
  await sleep(1000)
  await s.hover(V('Ending balance'), 500)
  await sleep(1300)
  await s.hover(V('Cash covers you through'), 600).catch(() => {})
  await sleep(1800)
  s.after = await hero()
  s.note(`hero before: ${fig(s.before || '')} → after: ${fig(s.after)}`)
  if (fig(s.before || '') === fig(s.after)) return s.fail('the forecast figures did not change after the gift') && false
  return true
}

/** f7's gift beat, re-planned: a gift dated inside the 13-week window, so every card
 *  that depends on it recounts (the April pledge falls outside 13W). Fails the take
 *  unless the proposal carries the in-window date and the hero figures change. */
async function giftBeatInWindow(s) {
  if (!(await s.openChat())) return false
  if (s.staleChatAt != null) return s.fail('chat opened on an earlier conversation on camera') && false
  await sleep(500)
  await s.askChat('Add an expected year-end gift to my cash forecast: $150,000, one time on December 1, 2026.')
  const prop = s.p.locator('[aria-label="KYRO AI assistant"] button:has-text("Confirm") >> visible=true').last()
  const got = await prop.waitFor({ state: 'visible', timeout: 70000 }).then(() => true).catch(() => false)
  s.mark('giftProposalAt')
  if (!got) { s.note('no gift proposal'); return false }
  s.splice('giftThinking', s.marks.askAt + 1.6, s.marks.giftProposalAt - 0.7)
  const said = await s.p.locator('[aria-label="KYRO AI assistant"]').innerText().catch(() => '')
  if (!/2026-12-01|Dec(ember)? 1,? 2026/.test(said)) return s.fail(`proposal is not dated December 1, 2026: "${said.slice(-260).replace(/\s+/g, ' ')}"`) && false
  await sleep(1300)
  await s.click(prop, { ms: 600 })
  s.mark('giftConfirmAt')
  await sleep(1500) // "Applied · Undo"
  await s.click('button[aria-label="Close KYRO AI"]', { ms: 500 }).catch(() => {})
  s.mark('closedAt')
  await s.hover(V('Lowest point'), 450)
  s.mark('recountAt')
  await sleep(900)
  await s.hover(V('Ending balance'), 500)
  await sleep(1300)
  await s.hover(V('Cash covers you through'), 600).catch(() => {})
  await sleep(1600)
  s.after = await s.p.evaluate(() => document.querySelector('#cf-hero')?.innerText || '').catch(() => '')
  const fig = (t) => (t.match(/\$[\d,]+/g) || []).join(' ')
  s.note(`hero before: ${fig(s.before || '')} → after: ${fig(s.after)}`)
  if (fig(s.before || '') === fig(s.after)) return s.fail('the forecast figures did not change after the gift') && false
  return true
}

// ═════════════════════════════════════════════════════════════════════════════
// Runner
// ═════════════════════════════════════════════════════════════════════════════
// Storyboard §E filming order (state later scenes depend on), a7 last.
export const ORDER = [
  'f1_drop', 'f2_messy', 'f4_insert', 'e2_in', 'f3_review', 'f6_budget',
  'a1_upload', 'a2_overview', 'a3_standing', 'a4_classroom', 'a5_time', 'a6_cohorts',
  'c0_promise', 's1_home', 's2_brief', 's3_showme', 'f4_verdict', 'f5_statements', 'f7_cash', 'f9_board', 'f10_readiness',
  'e1_overview', 'e3_trend', 'e4_grades', 'e5_cohorts', 'e6_who', 'e7_budget',
  'r1_overview', 'r2_frameworks', 'r3_wins', 'r4_standard', 'r5_warnings', 'r6_visit', 'r7_board',
  'x1_sweep', 'o2_studio',
  'o1_org', 'f8_analytics',
  'a7_network',
]

const LINE_MIN = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(DIR, 'vo-v4-lines.json'), 'utf8')).lines.map((l) => [l.id, l.minSec ?? 0]))
function voSeconds(id) {
  const f = path.join(DIR, 'vo-v4', `${id}.mp3`)
  return fs.existsSync(f) ? Math.round(durOf(f) * 100) / 100 : null
}

async function film(env2, id, mode, take) {
  const scene = SCENES[id]
  TIMING.tempo = scene.tempo ?? 1
  const ctx = scene.ctx === 'public' ? env2.publicCtx : env2.ctx
  if (scene.ctx !== 'public') await setScope(env2.ctrl, { school: scene.school, scope: scene.scope ?? 'school' })
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  const outDir = mode === 'dry' ? path.join(DIR, 'captures-v4/dry') : path.join(DIR, 'captures-v4/takes')
  fs.mkdirSync(outDir, { recursive: true })
  const rec = new Recorder(page, cdp, path.join(DIR, `captures-v4/.frames-${id}`))
  await rec.start()
  const s = new Shot(page, rec, id)
  s.startSampler()
  const g0 = { v: GUARD.violations.length, w: GUARD.writes.length, tts: GUARD.ttsCalls }
  PIN.hits = {}
  let success = false
  let err = null
  try {
    success = !!(await scene.run(s, mode))
  } catch (e) {
    err = String(e.message || e).split('\n')[0]
    s.note('ERROR: ' + err)
  }
  s.mark('actionEnd' in s.marks ? 'endAt' : 'actionEnd')
  await sleep(600)
  await s.stopSampler()
  await rec.stop()
  await page.close().catch(() => {})
  const base = mode === 'dry' ? path.join(outDir, id) : path.join(outDir, `${id}.t${take}`)
  const stats = rec.encode(base + '.webm')
  rec.cleanup()
  const vo = voSeconds(id)
  const marks = Object.fromEntries(Object.entries(s.marks).filter(([k]) => k !== 'settledAt'))
  const settledAt = s.marks.settledAt ?? 0
  const end = s.marks.actionEnd ?? stats.seconds
  const spliced = s.splices.reduce((a, x) => a + (x.to - x.from), 0)
  const usable = Math.round((end - settledAt - spliced) * 100) / 100
  const need = vo != null ? Math.round(Math.max(LINE_MIN[id] ?? 0, vo + 1) * 100) / 100 : null
  const meta = {
    id, mode, take, at: new Date().toISOString(),
    school: scene.ctx === 'public' ? 'logged out' : `${SCHOOL_NAME[scene.school]}${scene.scope === 'org' ? ' (org scope)' : ''}`,
    success, error: err,
    settledAt, marks, splices: s.splices,
    fit: { voSec: vo, needSec: need, usableSec: usable, speed: need ? Math.round(Math.max(1, usable / need) * 100) / 100 : null, fits: need ? usable / need <= 1.25 || usable < need : null, tailFreezeSec: need && usable < need ? Math.round((need - usable) * 100) / 100 : 0 },
    notes: s.notes,
    owlTimeline: s.owlTimeline,
    owlMissingAt: s.owlMissing ?? [],
    bannerHits: s.bannerHits,
    selectionAt: s.selectionHits ?? [],
    guard: { violations: GUARD.violations.slice(g0.v), writes: GUARD.writes.slice(g0.w), ttsStubbed: GUARD.ttsCalls - g0.tts },
    recording: stats,
    // The film's day: what the page's clock read, and every server field re-dated.
    filmDay: PIN.on ? { day: PIN.day, apiDayShift: pinShift(), redated: { ...PIN.hits } } : null,
  }
  if (s.briefLine) meta.briefLine = s.briefLine
  fs.writeFileSync(base + '.json', JSON.stringify(meta, null, 2))
  const sheetDir = mode === 'dry' ? path.join(DIR, 'captures-v4/dry/contact') : path.join(DIR, 'captures-v4/contact')
  fs.mkdirSync(sheetDir, { recursive: true })
  const sheet = contactSheet(base + '.webm', base + '.json', path.join(sheetDir, mode === 'dry' ? `${id}.png` : `${id}.t${take}.png`))
  meta.contactSheet = sheet
  fs.writeFileSync(base + '.json', JSON.stringify(meta, null, 2))
  const clean = success && !meta.bannerHits.length && !meta.guard.violations.length && !err && !meta.selectionAt.length
  console.log(`  ${clean ? '✓' : '✗'} ${id} [${mode}${mode === 'final' ? ' t' + take : ''}] ${stats.seconds}s rec · settled ${settledAt}s · usable ${usable}s vs need ${need}s · ${stats.srcFps} fps src${meta.bannerHits.length ? ' · BANNER ' + meta.bannerHits.join(',') : ''}${meta.selectionAt.length ? ' · SELECTION ' + meta.selectionAt.join(',') : ''}${meta.guard.violations.length ? ' · GUARD ' + meta.guard.violations.length : ''}`)
  return { meta, base, clean }
}

export async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--list')) { console.log(ORDER.join('\n')); return }
  const mode = args.includes('--dry') ? 'dry' : 'final'
  const noReset = args.includes('--no-reset')
  const maxTakes = Number((args.find((a) => a.startsWith('--takes=')) || '').split('=')[1] || 0)
  const wanted = args.filter((a) => !a.startsWith('--'))
  const ids = wanted.length ? wanted : ORDER.filter((x) => x !== 'a7_network')
  for (const id of ids) if (!SCENES[id]) throw new Error('unknown scene ' + id)
  const { browser, ctx } = await openBrowser()
  const env2 = { browser, ctx, ctrl: null, publicCtx: null }
  if (ids.some((i) => SCENES[i].ctx !== 'public')) { env2.ctrl = await login(ctx); console.log('logged in once as the demo user (session in memory only)') }
  if (ids.some((i) => SCENES[i].ctx === 'public')) env2.publicCtx = await newContext(browser)
  const summary = []
  for (const id of ids) {
    const sc = SCENES[id]
    const takes = maxTakes || (sc.ai ? 5 : sc.oneTake ? 1 : 2)
    console.log(`▸ ${id} (${mode})`)
    let best = null
    for (let t = 1; t <= (mode === 'dry' ? 1 : takes); t++) {
      if (!noReset) for (const r of sc.before ?? []) reset(...r.split(' '))
      const res = await film(env2, id, mode, t)
      if (!noReset) for (const r of sc.after ?? []) reset(...r.split(' '))
      if (id === 'e7_budget' && res.clean && !/below our plan of 207/.test(res.meta.briefLine || '')) { res.clean = false; console.log('    e7: brief wording does not read "…below our plan of 207" — another take') }
      if (!best || (res.clean && !best.clean)) best = res
      if (res.clean) break
      if (sc.oneTake && mode === 'final') break
    }
    if (mode === 'final' && best) {
      fs.copyFileSync(best.base + '.webm', path.join(DIR, `captures-v4/${id}.webm`))
      const m = { ...best.meta, chosenFrom: path.basename(best.base) }
      fs.writeFileSync(path.join(DIR, `captures-v4/${id}.json`), JSON.stringify(m, null, 2))
      const cs = path.join(DIR, `captures-v4/contact/${id}.png`)
      fs.copyFileSync(best.meta.contactSheet, cs)
    }
    summary.push({ id, clean: best?.clean, take: best?.meta.take, contact: best?.meta.contactSheet })
  }
  fs.writeFileSync(path.join(DIR, `captures-v4/${mode === 'dry' ? 'dry/' : ''}run-${Date.now()}.json`), JSON.stringify({ mode, summary, guard: GUARD }, null, 2))
  await browser.close()
  if (GUARD.violations.length) { console.error('GUARD VIOLATIONS', GUARD.violations); process.exitCode = 3 }
}

if (isMain) await main()
