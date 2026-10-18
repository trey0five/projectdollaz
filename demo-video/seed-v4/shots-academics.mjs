#!/usr/bin/env node
// KYRO demo v4 — READ-ONLY screenshots of the Academics scenes (a1–a7) as Morgan.
// Logs in once through the real /login form; every non-GET request except the
// login POST is ABORTED, so nothing on the page can write. No auth state is
// written to disk (in-memory browser context only). Never prints the password.
// Usage: node shots-academics.mjs [outDir]
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire('/home/dream/village-finder/package.json')
const { chromium } = require('playwright')

const REPO = '/home/dream/dollaz'
const WEB = 'http://127.0.0.1:5173'
const OUT = process.argv[2] || '/home/dream/.cache/kyro-demo-v4/seed-shots/academics'
fs.mkdirSync(OUT, { recursive: true })
const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'demo-video/seed-v4/out/structure.json'), 'utf8'))
const S = Object.fromEntries(manifest.schools.map((s) => [s.key, s]))
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(REPO, 'demo-video/.env.capture.local'), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
)

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
const blocked = []
await ctx.route('**/*', (route) => {
  const req = route.request()
  if (req.method() === 'GET' || req.method() === 'HEAD' || req.method() === 'OPTIONS') return route.continue()
  if (/\/auth\/login$/.test(new URL(req.url()).pathname)) return route.continue()
  blocked.push(`${req.method()} ${new URL(req.url()).pathname}`)
  return route.abort()
})
const page = await ctx.newPage()
const consoleErrors = []
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200))
})

await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' })
await page.waitForSelector('input[type=email]')
await page.fill('input[type=email]', env.MORGAN_EMAIL)
await page.fill('input[type=password]', env.MORGAN_PASSWORD)
await page.press('input[type=password]', 'Enter')
await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 30000 })
console.log('login ok →', new URL(page.url()).pathname)

async function setSchool(id, scope = 'school') {
  await page.evaluate(
    ([sid, sc]) => {
      localStorage.setItem('finrep_active_school_id', sid)
      localStorage.setItem('finrep_scope_mode', sc)
    },
    [id, scope],
  )
}
async function settle(ms = 2500) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(ms)
}
async function scrollThrough() {
  const h = await page.evaluate(() => document.documentElement.scrollHeight)
  for (let y = 0; y < h; y += 700) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y)
    await page.waitForTimeout(250)
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(600)
}
async function shoot(name, { full = true } = {}) {
  await scrollThrough()
  await page.screenshot({ path: path.join(OUT, `${name}.png`) })
  if (full) await page.screenshot({ path: path.join(OUT, `${name}-full.png`), fullPage: true })
  const text = await page.evaluate(() => document.body.innerText)
  const flags = {
    demoChip: /DEMO DATA/i.test(text),
    emDashKpi: (text.match(/\n—\n/g) ?? []).length,
    noData: /No assessment results loaded|No scores yet|Could not load|isn't on this plan/i.test(text),
  }
  console.log(`shot  ${name}  ${JSON.stringify(flags)}`)
  return text
}
async function scrollToText(t) {
  const loc = page.getByText(t, { exact: false }).first()
  await loc.scrollIntoViewIfNeeded().catch(() => {})
  await page.evaluate(() => window.scrollBy(0, -120))
  await page.waitForTimeout(900)
}

// a1 — the network console (org scope). The preview itself is a POST, so it is
// verified through the API by the loader, not here.
await setSchool(S.aurelia.id, 'org')
await page.goto(`${WEB}/academics/network`, { waitUntil: 'networkidle' })
await settle(3000)
await shoot('a1-network-console')
const up = page.getByRole('button', { name: /Upload results/i }).first()
if (await up.count()) {
  await up.click().catch(() => {})
  await page.waitForTimeout(1500)
  await page.screenshot({ path: path.join(OUT, 'a1-upload-section.png') })
  console.log('shot  a1-upload-section')
}

// a2–a6 — St. Aurelia.
await setSchool(S.aurelia.id, 'school')
await page.goto(`${WEB}/academics`, { waitUntil: 'networkidle' })
await settle(3000)
await shoot('a2-overview')
await scrollToText('How you compare')
await page.screenshot({ path: path.join(OUT, 'a2-how-you-compare.png') })

await page.goto(`${WEB}/academics?tab=analytics&view=standing`, { waitUntil: 'networkidle' })
await settle(3000)
await shoot('a3-standing')
await scrollToText('Where the gap actually is')
await page.screenshot({ path: path.join(OUT, 'a3-gap.png') })
await scrollToText('Where instruction is landing')
await page.screenshot({ path: path.join(OUT, 'a3-heatmap.png') })
// Hide peer names — the switch re-fetches with a GET.
await page.evaluate(() => window.scrollTo(0, 0))
const hide = page.getByText(/Hide peer names/i).first()
if (await hide.count()) {
  await hide.click().catch(() => {})
  await settle(2500)
  await shoot('a3-standing-peers-hidden', { full: true })
} else console.log('WARN no "Hide peer names" control found')

await page.goto(`${WEB}/academics?tab=analytics&view=classroom`, { waitUntil: 'networkidle' })
await settle(3000)
await shoot('a4-classroom')
await scrollToText('Who the average is hiding')
await page.screenshot({ path: path.join(OUT, 'a4-subgroups.png') })
await scrollToText('What this school does well')
await page.screenshot({ path: path.join(OUT, 'a4-objectives.png') })

await page.goto(`${WEB}/academics?tab=analytics&view=time`, { waitUntil: 'networkidle' })
await settle(3000)
await shoot('a5-time')
await scrollToText('Growth against achievement')
await page.screenshot({ path: path.join(OUT, 'a5-quadrant.png') })

await page.goto(`${WEB}/academics?tab=analytics&view=cohorts`, { waitUntil: 'networkidle' })
await settle(3500)
await shoot('a6-cohorts')

// a7 — Cedar Ridge, Network view, ACT.
await setSchool(S.cedar.id, 'school')
await page.goto(`${WEB}/academics?tab=analytics&view=network`, { waitUntil: 'networkidle' })
await settle(3000)
await shoot('a7-network-default')
// The test family is chosen network-wide (TerraNova has the most rows), so the
// a7 take clicks the band's "ACT" chip — a GET re-fetch with testType=act.
const actChip = page.getByRole('button', { name: /^ACT$/ }).first()
if (await actChip.count()) {
  await actChip.click()
  await settle(3000)
} else console.log('WARN no ACT chip found')
await shoot('a7-network-act')
await scrollToText('Sortable, for the packet')
await page.screenshot({ path: path.join(OUT, 'a7-table.png') })
await scrollToText('Participation against score')
await page.screenshot({ path: path.join(OUT, 'a7-participation.png') })

console.log('blocked non-GET:', JSON.stringify([...new Set(blocked)]))
console.log('console errors:', consoleErrors.length, JSON.stringify(consoleErrors.slice(0, 8)))
await browser.close()
