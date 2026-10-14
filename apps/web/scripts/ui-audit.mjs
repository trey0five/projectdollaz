#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// UI AUDIT — screenshots + a DOM census of the "card everywhere" tells, per route.
//
// Why this exists: the premium-UI overhaul (docs/Premium_UI_Plan.md) is judged by
// numbers, not taste — radius values ∈ {4, 6, 8, 9999}, nested cards 0, blur ≤ 1,
// no horizontal overflow, print routes pixel-identical. This script produces
// those numbers for every audited route so a phase can be checked before/after.
//
// Run (from anywhere; needs the local stack up — Vite :5173 + the API container):
//   node apps/web/scripts/ui-audit.mjs --label before          # app routes
//   node apps/web/scripts/ui-audit.mjs --label after --print   # + print routes
//   node apps/web/scripts/ui-audit.mjs --routes finance-overview,enrollment
//   node apps/web/scripts/ui-audit.mjs --diff before after     # pixel-diff two runs
//
// Output: apps/web/.ui-audit/<label>/{<id>.png,<id>-full.png,<id>-printmedia.png,
// census.json, census.md}. The directory is gitignored.
//
// Auth: JWTs are minted per run from the API container's JWT_SECRET (same as
// demo-video/capture-v3.mjs) — no passwords, no stale browser states.
// ─────────────────────────────────────────────────────────────────────────────
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB = resolve(HERE, '..')
const OUT_ROOT = resolve(WEB, '.ui-audit')
const BASE = process.env.UI_AUDIT_BASE ?? 'http://localhost:5173'

// Playwright lives in a sibling project (the house pattern — see capture-v3.mjs);
// prefer a local install when one exists, else fall back to that root.
function loadPlaywright() {
  const roots = [
    resolve(WEB, 'package.json'),
    process.env.PLAYWRIGHT_ROOT ? resolve(process.env.PLAYWRIGHT_ROOT, 'package.json') : null,
    '/home/dream/village-finder/frontend/package.json',
  ].filter(Boolean)
  for (const r of roots) {
    try {
      return createRequire(r)('playwright')
    } catch {
      /* try the next root */
    }
  }
  throw new Error('playwright not found — set PLAYWRIGHT_ROOT to a project that has it installed')
}

// ── Args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const flag = (name, dflt) => {
  const i = argv.indexOf(name)
  return i === -1 ? dflt : argv[i + 1]
}
const has = (name) => argv.includes(name)
const LABEL = flag('--label', new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'))
const ONLY = flag('--routes', '')?.split(',').filter(Boolean) ?? []
const WITH_PRINT = has('--print')
const DIFF = has('--diff')

// ── Cast (local seed data; ids match demo-video/capture-v3.mjs) ──────────────
const TORREY = '726f5d5b-e1a4-4e0d-aad3-b9c5697d0d1c' // Jon Snow · Sample High School Org
const OWNER = 'f399720d-82a8-43eb-b5cc-69a73c871793' // Ui Tester · DEMO — Sample Diocese
const NMB = '6413c8ed-f8d3-42c0-b988-07ce3d395bfc' // North Miami Beach Sr High
const CECILIA = '6ff259ef-cb28-4df0-a441-f0841f865094' // St. Cecilia Academy

function mint(userId) {
  const secret = execSync('docker exec dollaz-api-1 printenv JWT_SECRET').toString().trim()
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const head = b64({ alg: 'HS256', typ: 'JWT' })
  const body = b64({ sub: userId, type: 'access', iat: now, exp: now + 3600 })
  return `${head}.${body}.${createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')}`
}

// [id, user, school, scope, path]
export const APP_ROUTES = [
  ['home-school', 'torrey', NMB, null, '/app'],
  ['home-org', 'torrey', NMB, 'org', '/app'],
  ['home-owner', 'owner', CECILIA, null, '/app'],
  ['finance-overview', 'torrey', NMB, null, '/finance'],
  ['finance-add', 'torrey', NMB, null, '/finance?tab=add'],
  ['finance-records', 'torrey', NMB, null, '/finance?tab=records'],
  ['finance-reports', 'torrey', NMB, null, '/finance?tab=reports'],
  ['enrollment', 'torrey', NMB, null, '/enrollment'],
  ['enrollment-records', 'torrey', NMB, null, '/enrollment?tab=records'],
  ['academics', 'torrey', NMB, null, '/academics'],
  ['accreditation', 'torrey', NMB, null, '/accreditation'],
  ['analytics-overview', 'torrey', NMB, null, '/analytics'],
  ['analytics-charts', 'torrey', NMB, null, '/analytics?view=charts'],
  ['analytics-scorecard', 'torrey', NMB, null, '/analytics?view=scorecard'],
  ['analytics-peers', 'torrey', NMB, 'org', '/analytics?scope=org'],
  ['penny-studio', 'torrey', NMB, null, '/penny'],
  ['governance-records', 'torrey', NMB, null, '/governance?tab=records'],
  ['landing', null, null, null, '/'],
]
// Print routes are "sacred": they are screenshotted on screen AND under
// `media: print` emulation so a token change can be proven to leave the printed
// document untouched (--diff compares both).
export const PRINT_ROUTES = [
  ['print-board-report', 'torrey', NMB, null, '/reports/board/print'],
  ['print-board-packet', 'torrey', NMB, null, '/board-packet/print'],
  ['print-cap', 'torrey', NMB, null, '/readiness/cap/print'],
  ['print-workpapers', 'torrey', NMB, null, '/readiness/workpapers/print'],
  ['print-accred-evidence', 'torrey', NMB, null, '/accreditation/evidence/print'],
  ['print-accred-board', 'torrey', NMB, null, '/accreditation/board/print'],
  ['print-accred-visit', 'torrey', NMB, null, '/accreditation/visit/print'],
  ['print-governance', 'torrey', NMB, null, '/governance/report/print'],
]

// ── The census (runs in the page) ────────────────────────────────────────────
// A "card" = radius ≥ 12px, ≥160×60, and bordered / shadowed / filled. `radiiAll`
// is the histogram of every non-zero computed radius on a visible element — the
// acceptance check for the radius clamp.
const CENSUS = () => {
  const els = [...document.querySelectorAll('body *')]
  const cards = []
  const radii = {}
  const radiiAll = {}
  const fonts = {}
  let sh = 0
  let gr = 0
  let bl = 0
  const isCardEl = (el, cs, r) =>
    (parseFloat(cs.borderTopLeftRadius) || 0) >= 12 &&
    r.width >= 160 &&
    r.height >= 60 &&
    (cs.boxShadow !== 'none' || (cs.borderTopWidth !== '0px' && cs.borderTopStyle !== 'none'))
  const cardEls = []
  for (const el of els) {
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    if (r.width < 4 || r.height < 4) continue
    const br = parseFloat(cs.borderTopLeftRadius) || 0
    const hasBorder = cs.borderTopWidth !== '0px' && cs.borderTopStyle !== 'none'
    const hasShadow = cs.boxShadow !== 'none'
    const bgImg = cs.backgroundImage !== 'none'
    if (hasShadow) sh++
    if (/gradient/.test(cs.backgroundImage)) gr++
    if (cs.backdropFilter && cs.backdropFilter !== 'none') bl++
    if (br > 0) {
      // Pill radii are "9999px" or a %; bucket anything ≥ half the box as pill.
      const key = br >= Math.min(r.width, r.height) / 2 ? 'pill' : String(Math.round(br * 10) / 10)
      radiiAll[key] = (radiiAll[key] || 0) + 1
    }
    if (br >= 12 && r.width >= 160 && r.height >= 60 && (hasBorder || hasShadow || bgImg || cs.backgroundColor !== 'rgba(0, 0, 0, 0)')) {
      cards.push({
        tag: el.tagName,
        cls: (el.className?.baseVal ?? el.className ?? '').toString().slice(0, 80),
        w: Math.round(r.width),
        h: Math.round(r.height),
        br,
      })
      radii[br] = (radii[br] || 0) + 1
    }
    if (isCardEl(el, cs, r)) cardEls.push(el)
    if (el.children.length === 0 && (el.textContent || '').trim()) {
      const k = cs.fontSize + '/' + cs.fontFamily.split(',')[0] + '/' + cs.fontWeight
      fonts[k] = (fonts[k] || 0) + 1
    }
  }
  let nested = 0
  const cardSet = new Set(cardEls)
  for (const el of cardEls) {
    let p = el.parentElement
    while (p) {
      if (cardSet.has(p)) {
        nested++
        break
      }
      p = p.parentElement
    }
  }
  // Numeric columns in the new DataTable primitive must be right-aligned (P3 check).
  const dtNumWrong = [...document.querySelectorAll('.dt-num')].filter(
    (el) => getComputedStyle(el).textAlign !== 'right',
  ).length
  return {
    cards: cards.length,
    nested,
    radii,
    radiiAll,
    shadows: sh,
    gradients: gr,
    blur: bl,
    fontVariants: Object.keys(fonts).length,
    topFonts: Object.entries(fonts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 14),
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    docH: document.documentElement.scrollHeight,
    tables: document.querySelectorAll('table').length,
    dtNumWrong,
    sample: cards.slice(0, 12),
  }
}

// ── Markdown table ───────────────────────────────────────────────────────────
function censusTable(report) {
  const rows = Object.entries(report).map(([id, r]) => {
    if (r.error) return `| ${id} | ERR ${r.error.slice(0, 60)} | | | | | | | | |`
    const radiiStr = Object.entries(r.radiiAll || {})
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}×${v}`)
      .join(' ')
    return `| ${id} | ${r.cards} | ${r.nested} | ${r.shadows} | ${r.gradients} | ${r.blur} | ${r.fontVariants} | ${r.overflowX ? 'YES' : 'no'} | ${r.docH} | ${radiiStr} |`
  })
  return [
    '| route | cards | nested | shadows | gradients | blur | fonts | overflow-x | height | radii (px×count) |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...rows,
  ].join('\n')
}

// ── Pixel diff of two runs (print routes + anything both runs share) ─────────
async function diffRuns(a, b) {
  // Pure-node PNG diff with no deps: decode via Playwright's bundled Chromium.
  const { chromium } = loadPlaywright()
  const browser = await chromium.launch()
  const page = await browser.newPage()
  const dirA = resolve(OUT_ROOT, a)
  const dirB = resolve(OUT_ROOT, b)
  const censusA = JSON.parse(readFileSync(resolve(dirA, 'census.json'), 'utf8'))
  const ids = Object.keys(censusA)
  const out = []
  for (const id of ids) {
    for (const suffix of ['-printmedia', '-full', '']) {
      const fa = resolve(dirA, `${id}${suffix}.png`)
      const fb = resolve(dirB, `${id}${suffix}.png`)
      if (!existsSync(fa) || !existsSync(fb)) continue
      const [da, db] = [fa, fb].map((f) => 'data:image/png;base64,' + readFileSync(f).toString('base64'))
      const res = await page.evaluate(
        async ([ua, ub]) => {
          const load = (u) =>
            new Promise((ok, no) => {
              const im = new Image()
              im.onload = () => ok(im)
              im.onerror = no
              im.src = u
            })
          const [ia, ib] = await Promise.all([load(ua), load(ub)])
          if (ia.width !== ib.width || ia.height !== ib.height) {
            return { same: false, sizeA: `${ia.width}×${ia.height}`, sizeB: `${ib.width}×${ib.height}`, diffPx: -1 }
          }
          const c = document.createElement('canvas')
          c.width = ia.width
          c.height = ia.height
          const ctx = c.getContext('2d')
          ctx.drawImage(ia, 0, 0)
          const A = ctx.getImageData(0, 0, c.width, c.height).data
          ctx.drawImage(ib, 0, 0)
          const B = ctx.getImageData(0, 0, c.width, c.height).data
          let diff = 0
          let minX = c.width, minY = c.height, maxX = -1, maxY = -1
          for (let i = 0; i < A.length; i += 4) {
            if (A[i] !== B[i] || A[i + 1] !== B[i + 1] || A[i + 2] !== B[i + 2]) {
              diff++
              const px = (i / 4) % c.width
              const py = Math.floor(i / 4 / c.width)
              if (px < minX) minX = px
              if (px > maxX) maxX = px
              if (py < minY) minY = py
              if (py > maxY) maxY = py
            }
          }
          return { same: diff === 0, diffPx: diff, bbox: diff ? [minX, minY, maxX, maxY] : null, size: `${c.width}×${c.height}` }
        },
        [da, db],
      )
      out.push({ id: id + suffix, ...res })
      console.log(`${(id + suffix).padEnd(36)} ${res.same ? 'identical' : `DIFF ${res.diffPx}px bbox=${JSON.stringify(res.bbox ?? [res.sizeA, res.sizeB])}`}`)
    }
  }
  await browser.close()
  writeFileSync(resolve(dirB, `diff-vs-${a}.json`), JSON.stringify(out, null, 2))
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (DIFF) {
    const [a, b] = argv.slice(argv.indexOf('--diff') + 1, argv.indexOf('--diff') + 3)
    if (!a || !b) throw new Error('--diff <labelA> <labelB>')
    return diffRuns(a, b)
  }
  const { chromium } = loadPlaywright()
  const OUT = resolve(OUT_ROOT, LABEL)
  mkdirSync(OUT, { recursive: true })
  const T = { torrey: mint(TORREY), owner: mint(OWNER) }
  const routes = [...APP_ROUTES, ...(WITH_PRINT ? PRINT_ROUTES : [])].filter(
    ([id]) => ONLY.length === 0 || ONLY.includes(id),
  )
  const browser = await chromium.launch()
  const report = {}
  for (const [id, user, school, scope, path] of routes) {
    const isPrint = id.startsWith('print-')
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      reducedMotion: 'no-preference',
    })
    const p = await ctx.newPage()
    if (isPrint) {
      // The print pages auto-call window.print() on load; headless has no dialog,
      // but neutralise it so nothing can block the screenshot.
      await p.addInitScript(() => {
        window.print = () => {}
      })
    }
    if (user) {
      await p.addInitScript(
        ([t, s, sc]) => {
          localStorage.setItem('finrep_access_token', t)
          localStorage.setItem('finrep_active_school_id', s)
          if (sc) localStorage.setItem('finrep_scope_mode', sc)
          else localStorage.removeItem('finrep_scope_mode')
        },
        [T[user], school, scope],
      )
    }
    try {
      await p.goto(BASE + path, { waitUntil: 'networkidle', timeout: 45000 })
      // Let count-ups / entrance motion finish so the census sees the settled page.
      // A print document says "Preparing…" while its data loads (several
      // seconds for the board report); wait for that to clear, then settle.
      if (isPrint) {
        await p
          .waitForFunction(() => !/Preparing|Loading/i.test(document.body.innerText), null, { timeout: 12000 })
          .catch(() => {})
      }
      await p.waitForTimeout(isPrint ? 1500 : 2500)
      await p.screenshot({ path: resolve(OUT, `${id}.png`), fullPage: false })
      await p.screenshot({ path: resolve(OUT, `${id}-full.png`), fullPage: true })
      if (isPrint) {
        await p.emulateMedia({ media: 'print' })
        await p.waitForTimeout(300)
        await p.screenshot({ path: resolve(OUT, `${id}-printmedia.png`), fullPage: true })
        await p.emulateMedia({ media: 'screen' })
      }
      report[id] = { path, url: p.url(), ...(await p.evaluate(CENSUS)) }
      const r = report[id]
      console.log(
        id.padEnd(22),
        JSON.stringify({
          cards: r.cards,
          nested: r.nested,
          shadows: r.shadows,
          grads: r.gradients,
          blur: r.blur,
          fonts: r.fontVariants,
          ovf: r.overflowX,
          h: r.docH,
          tables: r.tables,
          radii: Object.keys(r.radiiAll).sort((a, b) => parseFloat(a) - parseFloat(b)).join('/'),
        }),
      )
    } catch (e) {
      report[id] = { path, error: e.message.slice(0, 200) }
      console.log(id, 'ERR', e.message.slice(0, 200))
    }
    await ctx.close()
  }
  await browser.close()
  writeFileSync(resolve(OUT, 'census.json'), JSON.stringify(report, null, 2))
  writeFileSync(resolve(OUT, 'census.md'), censusTable(report) + '\n')
  console.log(`\nwrote ${OUT}/census.{json,md}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
