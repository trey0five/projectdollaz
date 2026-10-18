#!/usr/bin/env node
// KYRO demo v4 — PRE-PRODUCTION VERIFIER (READ-ONLY).
//
// Asserts, scene by scene (storyboard §B, ~/.cache/kyro-demo-v4/rev/STORYBOARD.md),
// that every screen we are about to film has its data, plus the pipeline gates
// (secrets, the gitignored demo login file, voice lines, rig renders, hero video,
// the owl gate of §C.3).
//
// Safety:
//   • ONE real login as the fictional demo user Morgan, typed into the /login form
//     (POST /auth/login; on 429 it waits and retries). The session lives only in
//     this in-memory browser context; the access token is read from that page's
//     localStorage into a JS variable for the API GETs and is never printed or
//     written anywhere. No storage-state / auth file is ever written.
//   • Every non-GET API request from the page is ABORTED except login/refresh and
//     the cash page's compute-only preview (POST cash-flow/project, persist:false).
//   • Any request for a school id outside the demo network is flagged.
//   • The DB is only READ, and only for counts (name-collision check); nothing printed
//     from outside the demo org.
//   • Fixes nothing. Exit code 1 if any FAIL.
//
// Usage: node demo-video/seed-v4/verify-v4.mjs [--no-browser] [--only=s1,f4,...]
// Output: stdout PASS/WARN/FAIL lines + ~/.cache/kyro-demo-v4/verify/report.json
//         + screenshots/frames under ~/.cache/kyro-demo-v4/verify/
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

const REPO = '/home/dream/dollaz'
const DV = path.join(REPO, 'demo-video')
const API = 'http://127.0.0.1:8000'
const WEB = 'http://127.0.0.1:5173'
const OUT = '/home/dream/.cache/kyro-demo-v4/verify'
const ARGS = process.argv.slice(2)
const NO_BROWSER = ARGS.includes('--no-browser')
const ONLY = (ARGS.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean)
const want = (id) => !ONLY.length || ONLY.some((o) => id.startsWith(o))
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true })
fs.mkdirSync(path.join(OUT, 'frames'), { recursive: true })

const man = JSON.parse(fs.readFileSync(path.join(DV, 'seed-v4/out/structure.json'), 'utf8'))
const BOARD = fs.readFileSync('/home/dream/.cache/kyro-demo-v4/rev/STORYBOARD.md', 'utf8')
const RESET_SRC = fs.existsSync(path.join(DV, 'seed-v4/reset-v4.mjs')) ? fs.readFileSync(path.join(DV, 'seed-v4/reset-v4.mjs'), 'utf8') : ''
const S = Object.fromEntries(man.schools.map((s) => [s.key, s]))
const DEMO_IDS = new Set(man.schools.map((s) => s.id))
const ORG = man.org.id
const env = Object.fromEntries(
  fs.readFileSync(path.join(DV, '.env.capture.local'), 'utf8').split(/\r?\n/).map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]),
)

// ── report plumbing ─────────────────────────────────────────────────────────
const results = []
let section = 'setup'
const rec = (level, label, detail) => {
  results.push({ section, level, label, detail: detail ?? null })
  console.log(`${level.padEnd(4)}  [${section}] ${label}${detail ? `  — ${String(detail).slice(0, 400)}` : ''}`)
}
const check = (ok, label, detail) => rec(ok ? 'PASS' : 'FAIL', label, ok ? null : detail)
const warn = (label, detail) => rec('WARN', label, detail)
const info = (label, detail) => rec('INFO', label, detail)
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 << 20, ...opts })

// ════════════════════════════════════════════════════════════════════════════
// 1. STATIC GATES (no login)
// ════════════════════════════════════════════════════════════════════════════
section = 'secrets'
{
  // New / changed pipeline files (untracked + modified under demo-video, minus the
  // owner's scenes-v3.json) and every JSON the loaders wrote.
  const listed = sh('git', ['-C', REPO, 'status', '--porcelain', '-uall', 'demo-video'])
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(3).replace(/^"|"$/g, ''))
  const extra = []
  for (const d of ['seed-v4/out', 'scholar-v4/out', 'vo-v4']) {
    const walk = (p) => {
      for (const e of fs.readdirSync(p, { withFileTypes: true })) {
        const f = path.join(p, e.name)
        if (e.isDirectory()) walk(f)
        else if (/\.(json|txt|md|csv|mjs|js|py|html|sh)$/i.test(e.name)) extra.push(path.relative(REPO, f))
      }
    }
    if (fs.existsSync(path.join(DV, d))) walk(path.join(DV, d))
  }
  const files = [...new Set([...listed, ...extra])].filter((f) => /\.(json|txt|md|csv|mjs|js|py|html|sh|css)$/i.test(f))
  // Patterns are assembled so this file does not match itself.
  const J = 'JWT' + '_SECRET'
  const PATS = [
    [new RegExp(J), J],
    [new RegExp('print' + 'env'), 'print' + 'env'],
    [new RegExp('json' + 'webtoken'), 'json' + 'webtoken'],
    [new RegExp('mint' + 'Token'), 'mint' + 'Token'],
    [/\bsk-[A-Za-z0-9_-]{20,}/, 'OpenAI-style key prefix'],
    [/\bsk_[A-Za-z0-9]{20,}/, 'ElevenLabs-style key prefix'],
    [/eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}/, 'JWT literal'],
    [/storageState\s*\(\s*\{\s*path/, 'storageState written to disk'],
  ]
  // Exact secret values, read by NAME only and never printed.
  const vf = fs.readFileSync('/home/dream/village-finder/.env', 'utf8')
  const keyVal = (name) => {
    const m = vf.match(new RegExp(`^${name}=(.*)$`, 'm'))
    return m ? m[1].trim().replace(/^["']|["']$/g, '').split(/\s/)[0] : null
  }
  const secrets = [
    ['ELEVENLABS_API_KEY value', keyVal('ELEVENLABS_API_KEY')],
    ['OPENAI_API_KEY value', keyVal('OPENAI_API_KEY')],
    ['Morgan password', env.MORGAN_PASSWORD],
  ].filter(([, v]) => v && v.length >= 8)
  const hits = []
  for (const rel of files) {
    if (rel === 'demo-video/.env.capture.local' || rel.endsWith('seed-v4/verify-v4.mjs')) continue
    const abs = path.join(REPO, rel)
    if (!fs.existsSync(abs) || fs.statSync(abs).size > 8 << 20) continue
    const txt = fs.readFileSync(abs, 'utf8')
    for (const [re, label] of PATS) if (re.test(txt)) hits.push(`${rel}: ${label}`)
    for (const [label, v] of secrets) if (txt.includes(v)) hits.push(`${rel}: contains the ${label}`)
  }
  check(hits.length === 0, `no secrets / token tooling in ${files.length} new pipeline files`, hits.join(' | '))
  // capture-v3 / load-local must not be referenced by any v4 file
  const v4refs = files.filter((f) => /seed-v4|scholar-v4|make-vo-v4/.test(f) && !f.endsWith('verify-v4.mjs')).filter((f) => {
    const abs = path.join(REPO, f)
    return fs.existsSync(abs) && /capture-v3\.mjs|load-local\.mjs|seed-demo-accreditation|readiness-history/i.test(fs.readFileSync(abs, 'utf8').replace(/\/\/.*$/gm, ''))
  })
  check(v4refs.length === 0, 'no v4 script calls capture-v3 / load-local / the isDemo seeders', v4refs.join(', '))

  const envFile = path.join(DV, '.env.capture.local')
  let ignored = false
  try {
    sh('git', ['-C', REPO, 'check-ignore', '-q', envFile])
    ignored = true
  } catch {}
  check(ignored, '.env.capture.local is gitignored')
  const mode = (fs.statSync(envFile).mode & 0o777).toString(8)
  check(mode === '600', `.env.capture.local mode 600 (is ${mode})`)
  const tracked = sh('git', ['-C', REPO, 'ls-files', 'demo-video/.env.capture.local']).trim()
  check(!tracked, '.env.capture.local is not tracked')
  for (const d of ['vo-v4', 'seed-v4/out', 'scholar-v4/out', 'captures-v4', 'out-v4']) {
    let ig = false
    try {
      sh('git', ['-C', REPO, 'check-ignore', '-q', path.join(DV, d, 'probe.x')])
      ig = true
    } catch {}
    check(ig, `${d}/ is gitignored`)
  }
  for (const f of ['assets/hero-v3-master.mp4', 'assets/hero-v3-1080.mp4', 'assets/hero-v3-audio.wav']) {
    let ig = false
    try {
      sh('git', ['-C', REPO, 'check-ignore', '-q', path.join(DV, f)])
      ig = true
    } catch {}
    check(ig, `${f} is gitignored`)
  }
}

section = 'names'
{
  // Fictional names must not collide with any school / org outside the demo org.
  // Prints COUNTS only — never a name from outside the demo org.
  const words = ['Aurelia', 'Cedar Ridge', 'Mangrove Point', 'Odile', 'Heron Cove', 'Brightwater', 'Bayview']
  const q = (sql) => sh('docker', ['exec', 'dollaz-postgres-1', 'psql', '-U', 'finrep', '-d', 'finrep', '-tAc', sql]).trim()
  for (const w of words) {
    const lit = w.replace(/'/g, "''")
    const n = Number(q(`select count(*) from schools where organization_id is distinct from '${ORG}' and name ilike '%${lit}%'`))
    const o = Number(q(`select count(*) from organizations where id <> '${ORG}' and name ilike '%${lit}%'`))
    check(n === 0 && o === 0, `"${w}" used by no school/org outside the demo network`, `${n} school(s), ${o} org(s) outside`)
  }
  try {
    const n = Number(
      q(
        `select (select count(*) from accreditation_readiness_snapshots r join schools s on s.id=r.school_id where s.organization_id='${ORG}' and r.is_demo)
              + (select count(*) from accreditation_findings f join schools s on s.id=f.school_id where s.organization_id='${ORG}' and f.is_demo)`,
      ),
    )
    check(n === 0, `no isDemo readiness/finding rows in the demo org (the "DEMO DATA" seeders never ran) — ${n}`)
  } catch (e) {
    warn('isDemo row check could not run', String(e.message).split('\n')[0])
  }
}

section = 'voice'
{
  const lines = JSON.parse(fs.readFileSync(path.join(DV, 'vo-v4-lines.json'), 'utf8')).lines
  const approved = JSON.parse(fs.readFileSync('/home/dream/.cache/kyro-demo-v4/rev/vo_v4_rev.json', 'utf8'))
  const approvedText = (id) => (typeof approved[id] === 'string' ? approved[id] : approved[id]?.text ?? approved[id]?.narration ?? null)
  const src = fs.readFileSync(path.join(DV, 'make-vo-v4.py'), 'utf8')
  const accepted = {}
  for (const m of src.matchAll(/'(\w+)':\s*\(\[([^\]]*)\]/g)) accepted[m[1]] = m[2].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean)
  const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16)
  let ok = 0
  const bad = []
  let total = 0
  const voiced = lines.filter((l) => (l.text ?? '').trim())
  for (const l of voiced) {
    const mp3 = path.join(DV, 'vo-v4', `${l.id}.mp3`)
    const js = path.join(DV, 'vo-v4', `${l.id}.json`)
    const errs = []
    if (!fs.existsSync(mp3) || !fs.existsSync(js)) {
      bad.push(`${l.id}: missing mp3/json`)
      continue
    }
    const sc = JSON.parse(fs.readFileSync(js, 'utf8'))
    if (sc.text !== l.text) errs.push('sidecar text ≠ vo-v4-lines.json')
    const ap = approvedText(l.id)
    if (ap != null && ap !== l.text) errs.push('line text ≠ approved vo_v4_rev.json')
    const tag = sh('ffprobe', ['-v', 'quiet', '-show_entries', 'format_tags=comment', '-of', 'csv=p=0', mp3]).trim()
    if (tag !== `kyro-vo-v4:${sc.fingerprint}`) errs.push(`mp3 tag ${tag} ≠ fingerprint ${sc.fingerprint}`)
    const dur = Number(sh('ffprobe', ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3]).trim())
    if (Math.abs(dur - sc.duration) > 0.15) errs.push(`duration ${dur.toFixed(2)} ≠ sidecar ${sc.duration}`)
    total += dur
    const words = sc.words ?? []
    if (!words.length) errs.push('no word timings')
    else {
      const last = words[words.length - 1]
      if (!(last.end > 0 && last.end <= dur + 0.2 && last.end > dur - 2.5)) errs.push(`last word ends ${last.end}s vs audio ${dur.toFixed(2)}s`)
      if (words.some((w, i) => i && w.start + 0.001 < words[i - 1].start)) errs.push('word timings not monotonic')
    }
    const w = sc.whisper
    if (!w) errs.push('no transcript check')
    else {
      if (w.fingerprint !== sc.fingerprint) errs.push('transcript is for an older take (fingerprint)')
      if (w.audio_sha !== sha(mp3)) errs.push('transcript is for different audio (sha)')
      const left = (w.suspect ?? []).filter((t) => !(accepted[l.id] ?? []).includes(t))
      if (left.length) errs.push(`unaccepted suspect words: ${left.join(', ')}`)
    }
    if (errs.length) bad.push(`${l.id}: ${errs.join('; ')}`)
    else ok++
  }
  check(bad.length === 0, `voice: ${ok}/${voiced.length} voiced lines have mp3 + fingerprint tag + word timings + a clean (or accepted) Whisper diff`, bad.join(' | '))
  const accIds = Object.keys(accepted)
  info(`voice: total narration ${total.toFixed(1)} s; accepted transcriber misses on ${accIds.join(', ') || 'none'}`)
  const led = JSON.parse(fs.readFileSync(path.join(DV, 'vo-v4/_ledger.json'), 'utf8'))
  check(led.spent <= led.budget, `voice ledger ${led.spent}/${led.budget} characters`)
  // Script rules re-checked on the approved display text.
  const rules = []
  for (const l of lines) {
    if (/KYRO/.test(l.text)) rules.push(`${l.id}: "KYRO" in voiced text`)
    if (/\bKPIs?\b|K P Is/.test(l.text)) rules.push(`${l.id}: KPI wording`)
    if (/\d/.test(l.text)) rules.push(`${l.id}: digit`)
    if (/\b(he|she|his|her|him)\b/i.test(l.text)) rules.push(`${l.id}: gendered pronoun`)
    if (/\bcompliant\b/i.test(l.text)) rules.push(`${l.id}: "compliant"`)
  }
  check(rules.length === 0, 'voice: script rules (Cairo, no KPI, no digits, no pronouns, no "compliant")', rules.join(' | '))
  const z1 = lines.find((l) => l.id === 'z1_trust')?.text ?? ''
  check(/No student-facing surfaces, so COPPA does not apply/.test(z1) && /FERPA-aligned by contract/.test(z1), 'voice: z1 uses the approved privacy wording')
  const riv = lines.find((l) => l.id === 'c0_rivals')?.text ?? ''
  check(/Each may do its own job well/.test(riv) && !lines.some((l) => l.id.includes('altB')), 'voice: competitor line is Version A, hedged, no altB')
}

section = 'rig'
{
  const RIG = path.join(DV, 'scholar-v4/out')
  const want = ['c0_rivals', 'c0_meet', 'card1', 'card2', 'card3', 'card4', 'card5', 'card6', 'z1_trust', 'z2_end']
  const vodur = (id) => {
    const p = path.join(DV, 'vo-v4', `${id}.json`)
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')).duration : null
  }
  for (const id of want) {
    const mp4 = path.join(RIG, `${id}.mp4`)
    if (!fs.existsSync(mp4)) {
      check(false, `rig ${id}.mp4 exists`)
      continue
    }
    const probe = JSON.parse(sh('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', mp4]))
    const v = probe.streams.find((s) => s.codec_type === 'video')
    const dur = Number(probe.format.duration)
    const fps = v.r_frame_rate
    const vd = vodur(id)
    const longEnough = vd == null || dur + 0.05 >= vd
    check(v.width === 1920 && v.height === 1080 && fps === '30/1' && longEnough, `rig ${id}: ${v.width}×${v.height} @${fps}, ${dur.toFixed(2)} s${vd ? ` (voice ${vd.toFixed(2)} s)` : ''}`, `size/fps/length off`)
    // three sample frames for a human look
    for (const [tag, t] of [['a', 0.15], ['b', dur / 2], ['c', Math.max(0, dur - 0.2)]]) {
      try {
        sh('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', mp4, '-frames:v', '1', '-vf', 'scale=640:-1', path.join(OUT, 'frames', `${id}-${tag}.png`)])
      } catch {}
    }
    if (/^card\d$/.test(id)) {
      const mov = path.join(RIG, `${id}-alpha.mov`)
      if (fs.existsSync(mov)) {
        const pv = JSON.parse(sh('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_streams', mov])).streams.find((s) => s.codec_type === 'video')
        check(/a/.test(pv.pix_fmt) || /yuva|argb|rgba/.test(pv.pix_fmt), `rig ${id}-alpha.mov carries alpha (${pv.codec_name} ${pv.pix_fmt})`)
      } else warn(`rig ${id}-alpha.mov missing`)
    }
  }
  // Owl gate for the rig: no old-owl assets referenced by scholar-v4 / build-v4.
  const rigSrc = ['card.html', 'end.html', 'meet.html', 'rivals.html', 'trust.html', 'render.mjs', 'lib/owl.js', 'lib/stage.js']
    .map((f) => path.join(DV, 'scholar-v4', f))
    .filter((f) => fs.existsSync(f))
  if (fs.existsSync(path.join(DV, 'build-v4.py'))) rigSrc.push(path.join(DV, 'build-v4.py'))
  const oldRefs = rigSrc.filter((f) => /kyro-owl-perch|endcard\.html|KyroDove|kyroDoveManifest|\/kyro-owl\//.test(fs.readFileSync(f, 'utf8')))
  check(oldRefs.length === 0, 'rig references none of the old owl/dove assets', oldRefs.map((f) => path.relative(DV, f)).join(', '))
}

section = 'hero'
{
  const hero = path.join(DV, 'assets/hero-v3-1080.mp4')
  if (!fs.existsSync(hero)) check(false, 'hero-v3-1080.mp4 exists')
  else {
    const p = JSON.parse(sh('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', '-count_frames', hero]))
    const v = p.streams.find((s) => s.codec_type === 'video')
    const a = p.streams.find((s) => s.codec_type === 'audio')
    check(v.width === 1920 && v.height === 1080 && v.r_frame_rate === '30/1', `hero-v3-1080.mp4 is ${v.width}×${v.height} @${v.r_frame_rate}, ${v.nb_read_frames} frames, audio ${a ? a.codec_name : 'none'}`)
    // cadence: per-frame luma diff; a duplicated frame has YDIF≈0. Expect exactly one repeat per 5 output frames.
    const raw = sh('ffprobe', ['-v', 'quiet', '-f', 'lavfi', '-i', `movie=${hero},signalstats`, '-show_entries', 'frame_tags=lavfi.signalstats.YDIF', '-of', 'csv=p=0'])
    const ydif = raw.split('\n').filter(Boolean).map(Number)
    const dups = ydif.map((y, i) => (i > 0 && y < 0.05 ? i : -1)).filter((i) => i > 0)
    const gaps = dups.slice(1).map((d, i) => d - dups[i])
    const even = gaps.every((g) => g === 5)
    check(even && dups.length >= 55, `hero cadence: ${dups.length} repeated frames, spacing ${[...new Set(gaps)].join('/') || '—'} (even 4:5 pulldown)`)
    for (const t of [1, 5.8, 8.5]) {
      try {
        sh('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', hero, '-frames:v', '1', '-vf', 'scale=640:-1', path.join(OUT, 'frames', `hero-${t}.png`)])
      } catch {}
    }
    const readme = fs.readFileSync(path.join(DV, 'assets/v4-README.md'), 'utf8')
    if (/judder/i.test(readme)) warn('hero: the asset register still carries a judder note (24p→30p pulldown on the 0–1.5 s pan and the 5–6.8 s push-in) — accepted by nobody yet; owner sign-off or a Veo 1080p/30 re-export closes it')
  }
}

section = 'owl-gate'
{
  // Code (not comments, not specs) must not import / reference the old owl or dove.
  const list = []
  const walkSrc = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name)
      if (e.isDirectory()) walkSrc(f)
      else if (/\.(jsx?|css)$/.test(e.name) && !/\.spec\./.test(e.name)) {
        const code = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
        if (/KyroDove|kyroDoveManifest|useSpriteFrame|\/kyro-owl\//.test(code)) list.push(path.relative(REPO, f))
      }
    }
  }
  walkSrc(path.join(REPO, 'apps/web/src'))
  check(list.length === 0, `§C.3 code search: no KyroDove / kyroDoveManifest / useSpriteFrame / "/kyro-owl/" in apps/web/src code (comments/specs excluded)`, list.join(', '))
  const head = sh('git', ['-C', REPO, 'log', '-1', '--format=%h %s']).trim()
  info('served checkout HEAD', head)
}

if (NO_BROWSER) finish()

// ════════════════════════════════════════════════════════════════════════════
// 2. LIVE: one login, then API GETs + a browser pass over every filmed route
// ════════════════════════════════════════════════════════════════════════════
const require = createRequire('/home/dream/village-finder/package.json')
const { chromium } = require('playwright')
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
await page.addInitScript(() => {
  window.print = () => {}
})
const blocked = []
const foreign = new Set()
const owlReqs = []
const pageErrors = []
page.on('request', (req) => {
  const u = req.url()
  if (u.includes('/kyro-owl/')) owlReqs.push(u.replace(WEB, ''))
  const m = u.match(/\/api\/schools\/([0-9a-f-]{36})/)
  if (m && !DEMO_IDS.has(m[1])) foreign.add(m[1].slice(0, 8))
})
page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 200)))
await page.route('**/api/**', (route) => {
  const req = route.request()
  const m = req.method()
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return route.continue()
  if (m === 'POST' && /\/api\/auth\/(login|refresh)$/.test(req.url())) return route.continue()
  if (m === 'POST' && /\/cash-flow\/project$/.test(req.url())) {
    try {
      if (JSON.parse(req.postData() || '{}').persist === false) return route.continue()
    } catch {}
  }
  blocked.push(`${m} ${req.url().replace(WEB, '')}`)
  return route.abort()
})

const settle = async (ms = 2500) => {
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(ms)
}
const walk = async () => {
  await page.evaluate(async () => {
    const h = document.documentElement.scrollHeight
    for (let y = 0; y < h; y += 700) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 120))
    }
    window.scrollTo(0, 0)
  })
  await page.waitForTimeout(700)
}
const text = () => page.evaluate(() => document.body.innerText)
const loneDashes = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('body *')]
      .filter((el) => el.children.length === 0 && /^[—–-]$/.test(el.textContent.trim()) && el.offsetParent !== null)
      .map((el) => {
        let p = el
        for (let i = 0; i < 3 && p.parentElement; i++) p = p.parentElement
        return p.innerText.replace(/\s+/g, ' ').trim().slice(0, 70)
      }),
  )
const GLOBAL_FORBID = [
  [/DEMO DATA/i, 'DEMO DATA chip'],
  [/something went wrong|couldn['’]t load|could not load|failed to load/i, 'load-error text'],
]
async function screen(id, key, url, { scope = 'school', before, expect = [], forbid = [], allowDash = 0, full = true, wait = 3000 } = {}) {
  if (!want(id)) return null
  section = id
  try {
    await page.evaluate(
      ([sid, sc]) => {
        localStorage.setItem('finrep_active_school_id', sid)
        localStorage.setItem('finrep_scope_mode', sc)
      },
      [S[key].id, scope],
    )
    await page.goto(WEB + url, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await settle(wait)
    if (before) await before()
    if (full) await walk()
    await page.screenshot({ path: path.join(OUT, 'shots', `${id}.png`), fullPage: full })
    const t = await text()
    for (const [re, label] of [...GLOBAL_FORBID, ...forbid]) check(!re.test(t), `no ${label}`, (t.match(re) || [])[0])
    for (const [re, label] of expect) check(re.test(t), `shows ${label}`, `not found: ${re}`)
    const d = await loneDashes()
    if (d.length > allowDash) warn(`${d.length} lone "—" cell(s) on screen`, [...new Set(d)].slice(0, 6).join(' ‖ '))
    return t
  } catch (e) {
    check(false, `${url} rendered`, String(e.message).split('\n')[0])
    return ''
  }
}
const clickText = (re, { role } = {}) => async () => {
  const el = role ? page.getByRole(role, { name: re }).first() : page.getByText(re).first()
  if (await el.count()) {
    await el.click().catch(() => {})
    await settle(2000)
  } else warn(`no control matching ${re} to click`)
}

// ── c0_promise: the landing, logged OUT, before the one login ───────────────
if (want('c0')) {
  section = 'c0_promise'
  await page.goto(WEB + '/', { waitUntil: 'domcontentloaded' })
  await settle(3500)
  await walk()
  await page.screenshot({ path: path.join(OUT, 'shots', 'c0_promise.png'), fullPage: true })
  const t = await text()
  check(/Many moving parts/i.test(t), 'landing hero "Many moving parts. One platform."')
  check(/Everything orbits KYRO/i.test(t), 'landing "Everything orbits KYRO" section')
  check(!/\beight domains\b/i.test(t), 'landing no longer says "eight domains" (nine-planet orbit)', (t.match(/.{0,40}eight domains.{0,40}/i) || [])[0])
  const planets = await page.evaluate(() => {
    const labels = ['Finance', 'Enrollment', 'Academics', 'Accreditation', 'Governance', 'Facilities', 'Advancement', 'HR', 'Strategy', 'Planning']
    const t = document.body.innerText
    return labels.filter((l) => new RegExp(`\\b${l}\\b`).test(t))
  })
  check(planets.includes('Academics'), `landing names Academics among the modules (${planets.join(', ')})`)
  if (/FACTS, Blackbaud, OneRoster/.test(t)) warn('landing Enrollment planet still says rosters sync from "FACTS, Blackbaud, OneRoster" — FACTS connector is dark (decision G4: fix the line or keep it off camera)')
  check(/Many, not a hundred|\bmany\b/i.test(t) && !/a hundred/i.test(t), 'landing says "many", not "a hundred"')
  check(
    !/No student logins/i.test(t),
    'landing uses only approved privacy wording (no "No student logins")',
    'the hero card footnote (landingContent.js hero line, filmed in c0_promise) says "Built to FERPA standards. No student logins." — the approved wording is "No student-facing surfaces"',
  )
}

// ── the ONE login ───────────────────────────────────────────────────────────
section = 'login'
let TOKEN = null
for (let i = 0; i < 6 && !TOKEN; i++) {
  await page.goto(WEB + '/login', { waitUntil: 'networkidle' })
  await page.waitForSelector('input[type=email]')
  await page.fill('input[type=email]', env.MORGAN_EMAIL)
  await page.fill('input[type=password]', env.MORGAN_PASSWORD)
  const resp = page.waitForResponse((r) => r.url().includes('/api/auth/login'), { timeout: 20000 })
  await page.press('input[type=password]', 'Enter')
  const r = await resp
  if (r.status() === 429) {
    const w = (Number(r.headers()['retry-after']) || 20) * 1000
    warn(`login 429 — waiting ${w / 1000}s`)
    await page.waitForTimeout(w)
    continue
  }
  check(r.status() === 200, `POST /auth/login as the demo user → ${r.status()}`)
  await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 20000 })
  TOKEN = await page.evaluate(() => localStorage.getItem('finrep_access_token'))
}
if (!TOKEN) {
  check(false, 'logged in')
  await browser.close()
  finish()
}
const H = { authorization: `Bearer ${TOKEN}` }
const get = async (p) => {
  const r = await fetch(API + p, { headers: H })
  let body = null
  try {
    body = await r.json()
  } catch {}
  if (!r.ok) throw new Error(`GET ${p} → ${r.status} ${JSON.stringify(body?.message ?? '').slice(0, 120)}`)
  return body
}
const tryGet = (p) => get(p).catch((e) => ({ __err: e.message }))

// ── network-wide API preconditions ──────────────────────────────────────────
section = 'network'
const schools = await get('/schools')
check(
  schools.length === 6 && schools.every((s) => DEMO_IDS.has(s.id) && s.role === 'owner'),
  `GET /schools → exactly the 6 demo schools, all owner (${schools.map((s) => s.name).join(', ')})`,
)
const orgMe = await get('/organizations/me')
check(orgMe.id === ORG && orgMe.name === 'Bayview Catholic Schools', `org = ${orgMe.name}`)
const periods = {}
for (const k of Object.keys(S)) periods[k] = await get(`/schools/${S[k].id}/periods`)
const pid = (k, y) => periods[k].find((p) => p.periodEndDate === `${y}-06-30`)?.id
{
  const held = periods.brightwater.filter((p) => p.hasSnapshot || p.roles?.cy || p.roles?.py || p.roles?.audit)
  check(held.length === 0, `Brightwater holds no finance data (f1–f3 start empty) — ${periods.brightwater.length} period(s), ${held.length} with data`)
  if (periods.brightwater.length) info('Brightwater keeps empty period(s) from an earlier take (no route removes a period; reset-v4 brightwater re-checks them empty)')
}
const bwImports = await tryGet(`/schools/${S.brightwater.id}/enrollment/snapshots`)
check(Array.isArray(bwImports) && bwImports.length === 0, 'Brightwater has no enrollment snapshots (e2 drop starts empty)')
const bwEnr = await get(`/schools/${S.brightwater.id}/enrollment/status`)
check(bwEnr.studentCount === 0 && bwEnr.rosterMode === 'none', `Brightwater roster empty (${bwEnr.studentCount} students, mode ${bwEnr.rosterMode})`)
for (const k of ['aurelia', 'cedar', 'mangrove', 'odile', 'heron'])
  check([2022, 2023, 2024, 2025, 2026].every((y) => pid(k, y)), `${S[k].name}: FY22–FY26 periods present`)

// Org roll-ups (f8 All schools, o1): every reporting school on FY 2026, Brightwater the only "not reported".
const bySchool = await get(`/organizations/${ORG}/metrics/by-school`)
const notRep = (bySchool.notReported ?? []).map((s) => s.name)
check(notRep.length === 1 && notRep[0] === 'Brightwater School', `org roll-up "not reported" = [${notRep.join(', ')}] (Brightwater only, until the f3 final take)`)
const stale = (bySchool.schools ?? []).filter((s) => s.periodEndDate !== '2026-06-30')
check(
  stale.length === 0,
  'org roll-up (default view, no FY picked) shows every reporting school on FY 2026',
  stale.map((s) => `${s.schoolName} on ${s.periodEndDate}`).join(', ') +
    ' — the roll-up takes each school’s most recently GENERATED snapshot, and that school’s older years were regenerated after FY26; regenerate its FY26 statements last (as Morgan) or always pick FY 2026 in the scope bar',
)
const orgBrief = await get(`/organizations/${ORG}/briefing`)
const obStale = (orgBrief.schools ?? []).filter((s) => s.reported && s.periodLabel !== 'FY 2026')
check(obStale.length === 0, 'org briefing reads FY 2026 for every reporting school', obStale.map((s) => `${s.name}: ${s.periodLabel}`).join(', '))
const obSources = new Set((orgBrief.items ?? []).map((i) => i.source))
check((orgBrief.items ?? []).length >= 3 && obSources.size >= 3, `org briefing: ${(orgBrief.items ?? []).length} items from ${obSources.size} domains (${[...obSources].join(', ')})`)
const peers = await tryGet(`/organizations/${ORG}/metrics/peers/${S.cedar.id}`)
if (peers.__err) check(false, 'peers for Cedar Ridge', peers.__err)
else {
  const n = peers.peerCount ?? peers.peers?.length ?? peers.group?.size ?? peers.cohort?.size ?? null
  info('peers payload keys', Object.keys(peers).join(', '))
  check(!(peers.insufficient || peers.tooFew || (n != null && n < 2)), `Cedar Ridge peers form a group (n=${n})`)
}

// ── Ch1 ─────────────────────────────────────────────────────────────────────
const briefs = []
page.on('response', async (r) => {
  if (/\/api\/schools\/[^/]+\/periods\/[^/]+\/briefing/.test(r.url()) && r.request().method() === 'GET') {
    try {
      briefs.push(await r.json())
    } catch {}
  }
})
{
  const t = await screen('s1_home', 'aurelia', '/app', {
    expect: [
      [/Here are \d+ things? that need/i, '"Here are N things that need a decision"'],
      [/All clear/, 'an "All clear" tile'],
      [/needs? attention/, 'an "N need attention" tile'],
      [/Play/, 'the brief Play button (s2)'],
    ],
  })
  if (t != null) {
    const n = Number((t.match(/Here are (\d+) things?/) || [])[1] || 0)
    check(n >= 3, `brief count on home = ${n} (≥3)`)
    const b = briefs.at(-1)
    if (b) {
      const src = new Set((b.items ?? []).map((i) => i.source))
      check((b.items ?? []).length >= 3 && src.size >= 3, `home brief (${b.label}): ${(b.items ?? []).length} items from ${src.size} domains (${[...src].join(', ')})`)
      check(!(b.items ?? []).some((i) => i.source === 'data'), 'home brief has no "Generate this period’s statements" data item')
    } else warn('home did not fetch a school briefing (could not read its items)')
    const tiles = (t.match(/\d+ needs? attention/g) || []).length
    check(tiles >= 3, `home: ${tiles} module tiles need attention`)
    // the switcher: only the demo network
    section = 'switcher'
    const trig = page.locator('button[aria-haspopup=menu][aria-label^="Viewing"]').first()
    if (await trig.count()) {
      await trig.click()
      await page.waitForTimeout(800)
      const items = await page.locator('[role=menu][aria-label="Switch context"] [role=menuitem]').allInnerTexts()
      const names = items.map((s) => s.replace(/\s+/g, ' ').trim())
      await page.screenshot({ path: path.join(OUT, 'shots', 'switcher.png') })
      const demoNames = man.schools.map((s) => s.name)
      const extra = names.filter((n) => !/Whole organization/i.test(n) && !demoNames.some((d) => n.includes(d)))
      check(names.length === 7 && extra.length === 0 && names.some((n) => /Whole organization/i.test(n)), `switcher lists Whole organization + the 6 demo schools only (${names.length} items)`, `extra: ${extra.join(' | ')}`)
      await page.keyboard.press('Escape')
    } else check(false, 'context switcher trigger found')
  }
}
await screen('s3_showme', 'aurelia', '/cash-flow', {
  expect: [[/Cash covers you through/i, 'a dated verdict "Cash covers you through …"']],
  forbid: [[/isn['’]t on your plan yet/i, '"cash forecast isn’t on your plan yet" band']],
  before: async () => check((await page.locator('#cf-hero').count()) > 0, 'walkthrough target #cf-hero mounted'),
})

// ── Ch2 Finance ─────────────────────────────────────────────────────────────
await screen('f1_drop', 'brightwater', '/finance?tab=add&add=tb', {
  before: async () => check((await page.locator('#tb-upload-drop').count()) > 0, 'walkthrough target #tb-upload-drop mounted (Brightwater, empty)'),
})
for (const f of ['Profit and Loss.xlsx', 'Balance Sheet.xlsx', 'pl-only/Profit and Loss.xlsx', 'messy/Trial Balance Export.xlsx'])
  if (want('f1')) {
    section = 'f1_drop'
    check(fs.existsSync(path.join(DV, 'assets/v4-files', f)), `upload file ${f} present`)
  }
await screen('f4_verdict', 'cedar', '/finance', {
  expect: [
    [/closed \$[\d,]+ ahead/i, 'the verdict "FY 2026 closed $X ahead"'],
    [/Cash is the one to watch/i, '"Cash is the one to watch"'],
    [/\bGood\b/, 'a Good chip'],
    [/\bWatch\b/, 'a Watch chip'],
    [/At risk|Behind plan/i, 'an At-risk / Behind-plan chip'],
    [/FY 2025/, 'the FY 2025 pill to flip to'],
  ],
  forbid: [[/no numbers yet/i, '"no numbers yet" tile']],
})
if (want('f4')) {
  section = 'f4_verdict'
  const m = await get(`/schools/${S.cedar.id}/periods/${pid('cedar', 2026)}/metrics`)
  const arr = Array.isArray(m) ? m : m.metrics ?? m.items ?? []
  const st = Object.fromEntries(arr.map((x) => [x.key ?? x.metricKey, x.status]))
  check(
    st.operating_margin === 'good' && st.days_cash_on_hand === 'watch' && st.months_operating_reserve === 'good',
    `Cedar FY26: margin ${st.operating_margin}, days cash ${st.days_cash_on_hand}, reserve ${st.months_operating_reserve}`,
  )
}
await screen('f5_statements', 'cedar', '/statements', { expect: [[/Tuitions? and fees, net/i, 'the "Tuitions and fees, net" line']] })
if (want('f5')) {
  const h = await tryGet(`/schools/${S.cedar.id}/periods/${pid('cedar', 2026)}/statements/history`)
  const n = Array.isArray(h) ? h.length : h.versions?.length ?? h.history?.length ?? null
  check(n >= 2, `Cedar FY26 statement history has ${n} versions ("How this line changed" shows the original upload, the corrected re-upload and the regeneration)`)
  check(new RegExp(`How this line changed[^\\n]*${n} versions`).test(BOARD), `storyboard f5 names ${n} versions`)
}
await screen('f6_budget', 'cedar', '/budget', {
  before: clickText(/Budget vs\.? Actual/i),
  expect: [[/Plan/i, 'the waterfall Plan bar'], [/From plan to what happened/i, 'the waterfall card']],
})
if (want('f6')) {
  section = 'f6_budget'
  const t = await text()
  check(
    /What moved/i.test(t),
    'Budget vs. Actual shows the "What moved" tiles',
    'not rendered: the tiles list only lines that miss budget by MORE than 10%, and every Cedar FY26 line is within ~4% — give 1–3 lines a >10% variance (e.g. Development, Facilities) while keeping the totals',
  )
}
if (want('f6')) {
  section = 'f6_budget'
  if (!periods.brightwater.some((p) => p.hasSnapshot))
    check(/f3 final take[^\n]*\bf6\b/i.test(BOARD), 'f6 Brightwater "Guided" beat is filmed only AFTER the f3 final take (storyboard filming order) — Budget reads "Add a year’s numbers first" while Brightwater is empty')
}
await screen('f7_cash', 'cedar', '/cash-flow', {
  expect: [[/Build your forecast/i, '"Build your forecast"'], [/Build forecast/i, 'the Build forecast button']],
  forbid: [[/Cash covers you through/i, 'an already-built forecast (f7 must start unbuilt)']],
})
if (want('f7')) {
  const op = await get(`/schools/${S.cedar.id}/cash-flow/opening`)
  check(op.openingCash == null, 'Cedar has no saved forecast run (f7 builds it live)')
  if (op.tbCash == null)
    check(!/Your trial balance shows/i.test(BOARD) && /1,180,000/.test(BOARD), 'f7: no QuickBooks balance offer for a file-upload school — the storyboard types the opening ($1,180,000) instead of promising "Your trial balance shows $X of cash"')
  const cm = await get(`/schools/${S.cedar.id}/cash-flow/commitments`)
  const n = (Array.isArray(cm) ? cm : cm.commitments ?? []).length
  check(n >= 2, `Cedar cash commitments: ${n}`)
  const camps = await get(`/schools/${S.cedar.id}/advancement/campaigns`)
  check((camps.campaigns ?? camps).some((c) => /Building Our Future/i.test(c.name)), 'Cedar capital campaign present (for "add the April gift")')
}
await screen('f8_analytics', 'cedar', '/analytics', { expect: [[/Days Cash/i, 'days-cash KPI']] })
await screen('f8_scorecard', 'cedar', '/analytics', { before: clickText(/^Scorecard$/), expect: [[/Scorecard/i, 'the Scorecard view']] })
await screen('f8_peers', 'cedar', '/analytics?scope=peers', {
  wait: 4500,
  expect: [[/median/i, 'peer median'], [/percentile|rank/i, 'rank / percentile']],
  forbid: [[/not enough (comparable|peer)|too few (peers|schools)/i, 'a too-few-peers state']],
})
{
  const t = await screen('f8_org', 'cedar', '/analytics?scope=org', { wait: 4500 })
  if (t) {
    const ctxs = t.split('\n').filter((l) => /Not yet reported/i.test(l))
    check(ctxs.length === 0 || ctxs.every((l) => /Brightwater/.test(l)), `f8 org: no "Not yet reported" except Brightwater`, ctxs.slice(0, 3).join(' | '))
    check(/5 of 6 reporting FY 2026/i.test(t), 'f8 org: "5 of 6 reporting FY 2026" (Brightwater the one missing until the f3 final take)')
  }
}
await screen('f9_board', 'cedar', '/reports', { expect: [[/Board/i, 'the board report wizard']] })
if (want('f9')) {
  const b = await get(`/schools/${S.cedar.id}/periods/${pid('cedar', 2026)}/board-report`)
  check(!b.mda?.text, 'Cedar board MD&A blank ("Draft with AI", not "Regenerate")')
  check(b.availability?.hasSnapshot && b.availability?.hasBudget, 'board report has statements + budget')
  check(b.capitalBudget && b.cashInvestments && b.capitalCampaign, 'board report has capital / cash & investments / campaign schedules')
  const ms = await tryGet(`/schools/${S.cedar.id}/periods/${pid('cedar', 2026)}/monthly-snapshots`)
  const months = Array.isArray(ms) ? ms.length : (ms.months ?? []).length
  check(months >= 12, `Cedar FY26 month-end snapshots: ${months}`)
}
await screen('f9_print', 'cedar', `/reports/board/print?period=${pid('cedar', 2026)}&granularity=monthly&month=2026-06`, {
  wait: 6000,
  expect: [[/Key Indicators/i, 'Key Indicators'], [/Cash (and|&) Investments/i, 'Cash & Investments'], [/Capital Campaign/i, 'Capital Campaign']],
  allowDash: 999,
})
await screen('f10_readiness', 'aurelia', '/readiness', {
  expect: [[/250,000|\$250k/i, 'the $250k trigger'], [/September 15|Sept\.? 15|Sep 15/i, 'due September 15'], [/self-check/i, 'the "A self-check — not the official AUP" line']],
})

// ── Ch3 Enrollment ──────────────────────────────────────────────────────────
await screen('e1_overview', 'aurelia', '/enrollment', {
  expect: [
    [/\d+ students across \d+ grades/i, 'the verdict "N students across N grades"'],
    [/short of the plan/i, '"… short of the plan"'],
    [/Watch/, 'Gap to plan Watch'],
    [/Look deeper/i, '"Look deeper"'],
    [/grew/i, 'cohorts "N grew"'],
  ],
  forbid: [[/fewer than 5\b(?!.*withheld)/i, 'a "fewer than 5" grade tile on the overview']],
})
{
  const t = await screen('e2_add', 'brightwater', '/enrollment?tab=add', { expect: [[/Get your enrollment numbers in|Connect your S\s?I\s?S|student information system/i, 'the SIS / roster entry']] })
  if (t && /FACTS|Veracross/.test(t) && !/picker[^\n]*off camera/i.test(BOARD))
    warn('e2: the "Connect your SIS" card itself names "Blackbaud, FACTS, Veracross, OneRoster" — FACTS/Veracross connectors are dark, so per decision G4 keep that card copy off camera (crop/hold on the roster drop) unless the owner confirms they are offered')
}
await screen('e2_diocesan', 'aurelia', '/enrollment/diocesan-import', { scope: 'org', expect: [[/Import all schools|one file|diocesan/i, 'the diocesan import page']] })
if (want('e2')) {
  check(fs.existsSync(path.join(DV, 'assets/v4-files/brightwater-oneroster/users.csv')), 'e2 OneRoster CSV present')
  check(fs.existsSync(path.join(DV, 'assets/v4-files/Bayview Fall Census 2026-27.xlsx')), 'e2 diocesan file present')
}
await screen('e3_trend', 'aurelia', '/enrollment?tab=analytics&view=trend', {
  expect: [
    [/Headcount over time/i, '"Headcount over time"'],
  ],
})
if (want('e3') || want('e7')) {
  section = 'e7_budget'
  // e7's first beat is the St. Aurelia morning brief (the newest year with statements):
  // the enrollment page's "What it means for the budget" tile forwards the FY27
  // briefing, which needs FY27 statements — FY27 has no books yet, so it is not filmed.
  const b26 = await get(`/schools/${S.aurelia.id}/periods/${pid('aurelia', 2026)}/briefing`)
  const enr = (b26.items ?? []).find((i) => i.id === 'enrollment:below-plan')
  check(
    !!enr && /less tuition/.test(enr.why) && /days cash on hand/.test(enr.why),
    `e7: St. Aurelia's morning brief (${b26.label}) carries the enrollment → tuition → cash item (${enr ? enr.title : 'missing'})`,
    (b26.items ?? []).map((i) => `[${i.source}] ${i.title}`).join(' | '),
  )
  const b27 = await get(`/schools/${S.aurelia.id}/periods/${pid('aurelia', 2027)}/briefing`)
  info(`FY27 briefing (enrollment page tile source): ${(b27.items ?? []).map((i) => i.title).join(' | ')} — the tile appears once FY27 has statements`)
}
await screen('e4_grades', 'aurelia', '/enrollment?tab=analytics&view=grades', {
  expect: [
    [/Which grades carry the miss/i, '"Which grades carry the miss"'],
    [/Every grade, every year/i, '"Every grade, every year"'],
  ],
  before: async () => check((await page.locator('#enr-vs-plan').count()) > 0, 'walkthrough target #enr-vs-plan mounted'),
})
await screen('e5_cohorts', 'aurelia', '/enrollment?tab=analytics&view=cohorts', {
  expect: [[/Cohort size progression/i, '"Cohort size progression"'], [/size, not retention/i, '"its size, not retention"']],
})
await screen('e6_who', 'aurelia', '/enrollment?tab=analytics&view=who', {
  expect: [
    [/Demographic mix/i, '"Demographic mix"'],
    [/listed but not drawn/i, 'the privacy note "listed but not drawn"'],
    [/<5/, 'a "<5" withheld category'],
    [/Support needs/i, '"Support needs and register status"'],
    [/fewer than 5 — withheld/i, 'a withheld support flag'],
  ],
})
if (want('e6')) {
  const sa27 = pid('aurelia', 2027)
  const a = await get(`/schools/${S.aurelia.id}/enrollment/analytics?periodId=${sa27}`)
  void a
  const mixTxt = (await text()).split(/Demographic mix/i)[1]?.split(/Support needs/i)[0] ?? ''
  const lt5 = (mixTxt.replace(/show <5/gi, '').match(/<5/g) || []).length
  check(lt5 === 1, `e6: exactly one race category listed as <5 in the Demographic mix card (has ${lt5})`)
}
let e7Writes = []
const e7Staged = !!periods.aurelia.find((p) => p.periodEndDate === '2027-06-30')?.roles?.py
if (want('e7')) {
  section = 'e7_planning'
  if (!e7Staged) {
    check(/'e7-before'/.test(RESET_SRC) && /'e7'/.test(RESET_SRC), 'e7 Planning is staged per take: reset-v4.mjs e7-before (FY 2027 comparative → Planning opens on FY 2027), then reset-v4.mjs e7 after the take')
    const b27 = await get(`/schools/${S.aurelia.id}/periods/${pid('aurelia', 2027)}/budget`)
    const a = b27?.lines?.driverModel?.assumptions
    check(a?.staffing?.teachers?.count > 0 && a?.staffing?.teachers?.avgSalary > 0 && a?.tuitionRates?.elem > 0 && a?.tuitionRates?.middle > 0, `FY27 planning inputs on file: ${a?.staffing?.teachers?.count} teachers, tuition by grade group (elem $${a?.tuitionRates?.elem}, middle $${a?.tuitionRates?.middle})`)
    info('e7 Planning screen not staged now — run `node reset-v4.mjs e7-before` then `verify-v4.mjs --only=e7` to check the filmed state')
  }
}
if (e7Staged) {
  const t = await screen('e7_planning', 'aurelia', '/planning', {
    expect: [[/Roll forward from this year/i, '"Roll forward from this year"']],
    before: async () => {
      const n0 = blocked.length
      const rf = page.getByText(/Roll forward from this year/).first()
      if (await rf.count()) {
        await rf.click().catch(() => {})
        await settle(2500)
      }
      e7Writes = blocked.splice(n0)
    },
  })
  if (t != null && want('e7')) {
    const hero = t.split(/Needs attention/i)[0] ?? ''
    check(/FY 2027/.test(hero), 'Planning opens on FY 2027 (next fall, against the FY27 budget)', `hero reads ${(hero.match(/FY \d{4}/) || ['?'])[0]} — the page follows the app’s current period (latest year with statements = FY 2026), so the year-end forecast is for a CLOSED year and compares to the FY26 budget`)
    const money = (label) => Number(((t.match(new RegExp(label + '\\s*\\$([\\d,]+)', 'i')) || [])[1] || '0').replace(/,/g, ''))
    const fRev = money('FORECAST REVENUE'), fExp = money('FORECAST EXPENSE')
    check(fExp > 0.5 * fRev, `Year-end forecast after "Roll forward": revenue $${fRev.toLocaleString()} vs expense $${fExp.toLocaleString()}`, 'expenses are near zero (staff & pay / other expense inputs not seeded), so the forecast shows a seven-figure surplus and −100% expense lines on camera')
    if (e7Writes.length && !/'e7'/.test(RESET_SRC))
      warn(`"Roll forward from this year" fires a write on click (${[...new Set(e7Writes.map((w) => w.split(' ')[0]))].join(', ')} …/budget/forecast) — the method switch autosaves the forecast; the e7 take must be followed by a reset even though Save forecast is never pressed`)
    else if (e7Writes.length) info('"Roll forward from this year" autosaves the forecast on click — reset-v4.mjs e7 clears it after every take')
  }
}
if (want('e7')) {
  const fc = await get(`/schools/${S.aurelia.id}/periods/${pid('aurelia', 2027)}/budget/forecast`)
  check(fc.hasBudget === true && !fc.forecast, 'St. Aurelia FY27 budget present, no saved forecast')
}

// ── Ch4 Academics ───────────────────────────────────────────────────────────
await screen('a1_upload', 'aurelia', '/academics/network', { scope: 'org', expect: [[/Upload results/i, '"Upload results"'], [/One file, every school/i, '"One file, every school"']] })
if (want('a1')) {
  const od = await get(`/organizations/${ORG}/academics/dashboard`)
  const has26 = (od.context?.years ?? []).includes(2026)
  const fd = new FormData()
  const a1File = path.join(DV, 'assets/v4-files/bayview-terranova-2026-results.csv')
  fd.append('file', new Blob([fs.readFileSync(a1File, 'utf8')], { type: 'text/csv' }), path.basename(a1File))
  const pr = await fetch(`${API}/organizations/${ORG}/academics/assessments/upload`, { method: 'POST', headers: H, body: fd })
  const pv = await pr.json().catch(() => ({}))
  check(
    pr.ok && pv.testType === 'terranova' && pv.matched === 3 && pv.unmatched === 0 && !(pv.warnings ?? []).length,
    `a1 preview dry-run${has26 ? ' (TerraNova 2026 already committed)' : ''}: ${pv.testType} · ${pv.matched} matched / ${pv.unmatched} unmatched · ${(pv.warnings ?? []).length} warnings → a clean "Save to 3 schools", no replace/duplicate notice`,
    JSON.stringify({ status: pr.status, warnings: pv.warnings }),
  )
}
await screen('a2_overview', 'aurelia', '/academics', { expect: [[/2nd of 3|Rank\s*2/i, '"2nd of 3"'], [/Network/i, 'Network average'], [/Widest gap/i, 'Widest gap'], [/Participation/i, 'Participation']] })
await screen('a3_standing', 'aurelia', '/academics?tab=analytics&view=standing', {
  expect: [[/Rank 2 of 3|2 of 3/i, '"Rank 2 of 3"'], [/Where the gap actually is/i, '"Where the gap actually is"'], [/Where instruction is landing/i, 'the heat map'], [/Hide peer names/i, 'the "Hide peer names" switch']],
})
await screen('a4_classroom', 'aurelia', '/academics?tab=analytics&view=classroom', {
  expect: [
    [/Where students actually sit/i, '"Where students actually sit"'],
    [/Who the average is hiding/i, '"Who the average is hiding"'],
    [/What this school does well/i, '"What this school does well"'],
    [/Where to put the next hour/i, '"Where to put the next hour"'],
  ],
})
await screen('a5_time', 'aurelia', '/academics?tab=analytics&view=time', { expect: [[/Growth against achievement/i, 'the quadrant'], [/Ahead and rising|Behind, but rising/i, 'quadrant labels']] })
await screen('a6_cohorts', 'aurelia', '/academics?tab=analytics&view=cohorts', {
  expect: [[/Follow the same children/i, '"Follow the same children"'], [/Grades 3 → 5/, '"Grades 3 → 5" panel']],
  before: async () => check((await page.locator('#academics-cohort-panels').count()) > 0, 'walkthrough target #academics-cohort-panels mounted'),
})
{
  const t = await screen('a7_network', 'cedar', '/academics?tab=analytics&view=network', {
    before: clickText(/^ACT$/, { role: 'button' }),
    expect: [
      [/Sortable, for the packet/i, '"Sortable, for the packet"'],
      [/Participation against score/i, '"Participation against score"'],
      [/read with care/i, 'one school flagged "read with care"'],
      [/PER TEACHER\s*\n+\s*[\d.]+/i, '"What this score cost" per teacher (HR data)'],
      [/COST PER PUPIL\s*\n+\s*\$[\d,]+/i, '"What this score cost" cost per pupil (finance data)'],
    ],
  })
  if (t != null && want('a7')) {
    const head = t.split('Sortable')[0] ?? ''
    // The band reads "ANALYTICS · HIGH · ACT 2026 · …" once the ACT chip is on (the
    // chip row itself still lists TerraNova, so the word alone proves nothing).
    const onAct = /ANALYTICS · [^\n]*· ACT \d{4}/i.test(head) && !/Every comparison on this page is fair/i.test(t)
    if (!onAct)
      check(
        false,
        'a7 opens on A C T with one school flagged "read with care"',
        'after the "ACT" chip click the view still reads TerraNova',
      )
    else check(onAct, 'a7 opens on A C T with one school flagged "read with care"')
    const ar = await get(`/schools/${S.cedar.id}/academics/assessments/dashboard?testType=act`).catch(() => null)
    if (ar) info('a7 ACT rows', (ar.schools ?? []).map((s) => `${s.schoolName ?? s.name}`).join(', '))
  }
}

// ── Ch5 Accreditation (Cedar Ridge) ─────────────────────────────────────────
const rd = await get(`/schools/${S.cedar.id}/accreditation/readiness`)
await screen('r1_overview', 'cedar', '/accreditation', {
  expect: [[/points? from/i, '"N points from …"'], [/6-year (accreditation|Cognia) cycle/i, '"Your 6-year … cycle"'], [/Next up|in \d+ days/i, 'the next milestone']],
})
if (want('r1')) {
  section = 'r1_overview'
  check(rd.framework?.code === 'cognia_2025' && (rd.otherFrameworks ?? []).length === 0, `Cedar on Cognia 2025 only (${rd.framework?.code}, +${(rd.otherFrameworks ?? []).length})`)
  check(rd.readinessPct > 30 && rd.readinessPct < 90, `readiness dial mid-arc, not 100% (${rd.readinessPct}%)`)
  const cyc = await get(`/schools/${S.cedar.id}/accreditation/cycle`)
  check(cyc.anchor?.termYears === 6 && cyc.countdown?.daysRemaining > 0 && cyc.countdown?.daysRemaining <= 200, `cycle: ${cyc.anchor?.termYears}-year, year ${cyc.phase?.yearOfCycle}, next "${cyc.countdown?.label}" in ${cyc.countdown?.daysRemaining} days`)
}
if (want('r2')) {
  section = 'r2_frameworks'
  const fw = (await get(`/schools/${S.cedar.id}/accreditation/frameworks`)).frameworks
  const fcc = fw.find((f) => /Florida Catholic Conference/i.test(f.accreditor))
  check(!!fcc && /Accreditrac/.test(fcc.evidencePlatform?.name ?? ''), `FCC framework offered with "Accreditrac" (${fcc?.evidencePlatform?.name})`)
  check(!!fcc && !fcc.adopted, 'FCC not adopted (Cedar stays Cognia-only)')
  for (const a of ['NIPSA', 'MSA-CESS', 'ACSI']) check(fw.some((f) => f.accreditor === a), `${a} offered`)
  check(fw.some((f) => f.code === 'cognia_2025' && f.adopted && f.division === 'sacs_casi'), 'Cognia 2025 adopted with the SACS CASI division (Bayview is a Florida network)')
}
await screen('r2_modal', 'cedar', '/accreditation', {
  before: clickText(/Adopt a framework|Add a framework|Frameworks/i),
  expect: [[/Florida Catholic Conference/i, 'FCC card'], [/Accreditrac/, '"Accreditrac" on the FCC card']],
  full: false,
})
await screen('r3_wins', 'cedar', '/accreditation', {
  expect: [[/Quickest wins/i, '"Quickest wins"'], [/Must-pass checks/i, '"Must-pass checks"'], [/Not met/i, '"Not met"'], [/Work on it/i, '"Work on it"']],
})
if (want('r3')) {
  const met = rd.assurances.filter((a) => a.satisfied).length
  check(met === 4 && rd.assurances.length === 6, `must-pass ${met} of ${rd.assurances.length} met (want 4 of 6)`)
  check(rd.gaps.filter((g) => g.rubricScore == null).length >= 5, `≥5 unscored standards for Quickest wins (${rd.gaps.filter((g) => g.rubricScore == null).length})`)
}
if (want('r4')) {
  section = 'r4_standard'
  const src = await tryGet(`/schools/${S.cedar.id}/accreditation/evidence-sources`)
  const flat = JSON.stringify(src)
  check(/polic/i.test(flat) && /minutes|meeting/i.test(flat), '"Attach from operations" has policies + meeting minutes')
  check(/board/i.test(flat), '"Attach from operations" has a board report')
}
await screen('r5_warnings', 'cedar', '/accreditation?center=signals', {
  expect: [
    [/next twenty-four months/i, '"The next twenty-four months"'],
    [/past their own scheduled review date/i, '"Policies are past their own scheduled review date"'],
    [/Operational signals/i, '"Operational signals"'],
    [/What KYRO could read/i, '"What KYRO could read — and what it couldn’t"'],
  ],
})
{
  await screen('r6_visit', 'cedar', '/accreditation/visit', {
    wait: 4500,
    expect: [
      [/The team is here/i, 'act 1'],
      [/What they['’]d commend/i, 'act 2'],
      [/What they['’]d likely find/i, 'act 3'],
      [/What they['’]d ask for/i, 'act 4'],
      [/What we could not answer/i, 'act 5'],
      [/So here['’]s the plan/i, 'act 6'],
      [/Read it to me/i, '"Read it to me"'],
    ],
  })
  if (want('r6')) {
    const v = await get(`/schools/${S.cedar.id}/accreditation/visit`)
    const a = v.acts
    check(!v.demoData && !a.arrival.demoData, 'mock visit not stamped demoData')
    check(a.commendations.commendations.length >= 1, `commendations: ${a.commendations.commendations.length}`)
    const f = a.findings.severityCounts
    check(f.total >= 6 && f.total <= 9 && f.critical >= 1, `likely findings: ${f.total} (${f.critical} critical)`)
    const h = a.requests.health
    check(h.current > 0 && h.expiring > 0 && h.missing > 0, `requests: current ${h.current} / expiring ${h.expiring} / missing ${h.missing}`)
    check(a.unanswered.namedHoles.length >= 1 && a.unanswered.namedHoles.length <= 2, `what we could not answer: ${a.unanswered.namedHoles.length}`)
    check((a.plan.items ?? []).length > 0 && !a.plan.emptyReason, `plan has ${(a.plan.items ?? []).length} items, not confirmed`)
  }
}
await screen('r7_board', 'cedar', '/accreditation/board/print', { wait: 4500, expect: [[/Where we stand/i, '"Where we stand"'], [/Executive summary/i, '"Executive summary"']], allowDash: 999 })
await screen('r7_improvement', 'cedar', '/improvement', {
  expect: [[/What to work on next/i, '"What to work on next"']],
  forbid: [[/No work started yet/i, '"No work started yet"']],
})
if (want('r7')) {
  const im = await get(`/schools/${S.cedar.id}/improvement`)
  const ini = im.initiatives ?? []
  check(ini.length >= 2 && ini.some((i) => i.status === 'in_progress') && ini.some((i) => i.paceStatus === 'behind'), `improvement: ${ini.length} initiatives (in flight + one behind pace)`)
}

// ── Ch6 ─────────────────────────────────────────────────────────────────────
for (const [id, url, re] of [
  ['x1_governance', '/governance', /polic/i],
  ['x1_facilities', '/facilities', /maintenance|repair/i],
  ['x1_advancement', '/advancement', /campaign|Annual Fund/i],
  ['x1_hr', '/hr', /staff|teacher/i],
  ['x1_strategy', '/strategy', /goal/i],
])
  await screen(id, 'aurelia', url, { expect: [[re, `${url} content`]], forbid: [[/No (policies|campaigns|goals|items|staff) yet/i, 'an empty state']] })
{
  const t = await screen('o1_org', 'aurelia', '/app', { scope: 'org', wait: 4500, expect: [[/Bayview Catholic Schools/i, 'the org name'], [/Across the network|Schools/i, 'the network roll-up']] })
  if (t) {
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('tr')].map((tr) => tr.innerText.replace(/\s+/g, ' ').trim()).filter((r) => /Reported|Not yet reported/.test(r)),
    )
    const nyr = rows.filter((r) => /Not yet reported/.test(r))
    const bad = nyr.filter((r) => !/Brightwater/.test(r))
    check(nyr.length <= 1 && bad.length === 0, `o1 Schools register: "Not yet reported" only on Brightwater (${nyr.length} row(s))`, bad.join(' | '))
    const off = rows.filter((r) => /Reported/.test(r) && !/Not yet/.test(r) && !/FY 2026/.test(r))
    check(off.length === 0, 'o1 Schools register: every reporting school on FY 2026', off.join(' | '))
  }
}
await screen('o2_studio', 'aurelia', '/penny', { full: false, expect: [[/KYRO/, 'the Studio']] })
if (want('o2')) {
  const act = await get(`/schools/${S.aurelia.id}/assistant/activity`)
  check(Array.isArray(act) && act.length === 0, `Studio action log clean before the take (${act.length} rows)`)
}

// ── global browser findings ─────────────────────────────────────────────────
section = 'global'
check(owlReqs.length === 0, `§C.3: zero requests to /kyro-owl/ across the click-through (${owlReqs.length})`, [...new Set(owlReqs)].slice(0, 5).join(', '))
check(foreign.size === 0, 'no request for a school outside the demo network', [...foreign].join(', '))
check(blocked.length === 0, 'the read-only pass attempted no writes', [...new Set(blocked)].slice(0, 6).join(' | '))
if (pageErrors.length) warn(`${pageErrors.length} page error(s)`, [...new Set(pageErrors)].slice(0, 4).join(' | '))
await browser.close()
finish()

function finish() {
  const fails = results.filter((r) => r.level === 'FAIL')
  const warns = results.filter((r) => r.level === 'WARN')
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ at: new Date().toISOString(), fails: fails.length, warns: warns.length, results }, null, 1))
  console.log(`\n${results.filter((r) => r.level === 'PASS').length} PASS · ${warns.length} WARN · ${fails.length} FAIL   (report: ${path.join(OUT, 'report.json')})`)
  process.exit(fails.length ? 1 : 0)
}
