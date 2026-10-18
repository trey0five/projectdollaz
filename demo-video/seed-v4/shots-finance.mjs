#!/usr/bin/env node
// KYRO demo v4 — READ-ONLY screenshots of the Finance scenes as Morgan on :5173.
// One real login through the login form (the token stays in this browser's
// memory; no storageState / auth file is written). Every non-GET API call except
// login/refresh is ABORTED (sole exception: POST cash-flow/project with
// persist:false — the forecast page's compute-only preview, which the service
// never stores), so nothing on screen can write. 1920×1080.
// Usage: node shots-finance.mjs [shotName ...]
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire('/home/dream/village-finder/package.json')
const { chromium } = require('playwright')

const REPO = '/home/dream/dollaz'
const BASE = 'http://127.0.0.1:5173'
const OUT = '/home/dream/.cache/kyro-demo-v4/seed-shots/finance'
const env = Object.fromEntries(fs.readFileSync(path.join(REPO, 'demo-video/.env.capture.local'), 'utf8').split(/\r?\n/).map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]))
const man = JSON.parse(fs.readFileSync(path.join(REPO, 'demo-video/seed-v4/out/structure.json'), 'utf8'))
const S = Object.fromEntries(man.schools.map((s) => [s.key, s]))
const only = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
const blocked = []
const previews = []
await page.route('**/api/**', (route) => {
  const req = route.request()
  const m = req.method()
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return route.continue()
  if (/\/api\/auth\/(login|refresh)/.test(req.url())) return route.continue()
  // The one exception: the cash page's rehydrate PREVIEW (persist:false) is a
  // compute-only POST — the service stores nothing when persist === false.
  if (m === 'POST' && /\/cash-flow\/project$/.test(req.url())) {
    let b = null
    try {
      b = JSON.parse(req.postData() || '{}')
    } catch {}
    if (b && b.persist === false) {
      previews.push(req.url().replace(BASE, ''))
      return route.continue()
    }
  }
  blocked.push(`${m} ${req.url().replace(BASE, '')}`)
  return route.abort()
})
const errors = []
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)))

// ── one login ──
for (let i = 0; i < 6; i++) {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
  await page.waitForSelector('input[type=email]')
  await page.fill('input[type=email]', env.MORGAN_EMAIL)
  await page.fill('input[type=password]', env.MORGAN_PASSWORD)
  const resp = page.waitForResponse((r) => r.url().includes('/api/auth/login'), { timeout: 20000 })
  await page.press('input[type=password]', 'Enter')
  const r = await resp
  if (r.status() === 429) {
    const w = (Number(r.headers()['retry-after']) || 20) * 1000
    console.log(`login 429 — waiting ${w / 1000}s`)
    await page.waitForTimeout(w)
    continue
  }
  await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 20000 })
  break
}
console.log('logged in at', page.url())

async function useSchool(key) {
  await page.evaluate((id) => localStorage.setItem('finrep_active_school_id', id), S[key].id)
}
async function settle(ms = 2500) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(ms)
}
async function audit(name) {
  const text = await page.evaluate(() => document.body.innerText)
  const flags = []
  if (/DEMO DATA/i.test(text)) flags.push('DEMO DATA chip')
  const dashes = await page.evaluate(() =>
    [...document.querySelectorAll('body *')].filter((el) => el.children.length === 0 && el.textContent.trim() === '—' && el.offsetParent !== null).length,
  )
  if (dashes) flags.push(`${dashes} lone "—"`)
  const ctxs = text.split('\n').filter((l) => /no numbers yet|Not yet reported|isn.t on your plan/i.test(l)).slice(0, 4)
  if (ctxs.length) flags.push(`ctx: ${ctxs.join(' | ').slice(0, 300)}`)
  for (const pat of [/Not yet reported/i, /no numbers yet/i, /Something went wrong/i, /couldn.t load/i, /isn.t on your plan yet/i, /Nothing flagged/i]) if (pat.test(text)) flags.push(`text: ${pat}`)
  return flags
}
const results = []
async function shot(name, key, url, { before, full = false, scrollTo, wait = 2500 } = {}) {
  if (only.length && !only.includes(name)) return
  await useSchool(key)
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded' })
  await settle(wait)
  if (before) await before()
  if (scrollTo != null) {
    await page.evaluate((y) => window.scrollTo(0, y), scrollTo)
    await page.waitForTimeout(1200)
  }
  if (full) {
    // reveal-on-scroll sections: walk the page first
    const h = await page.evaluate(() => document.body.scrollHeight)
    for (let y = 0; y < h; y += 700) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y)
      await page.waitForTimeout(250)
    }
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(800)
  }
  const file = path.join(OUT, `${name}.png`)
  await page.screenshot({ path: file, fullPage: full })
  const flags = await audit(name)
  results.push({ name, school: S[key].name, url, flags })
  console.log(`${name.padEnd(28)} ${S[key].name.padEnd(36)} ${url.padEnd(34)} ${flags.length ? 'FLAGS: ' + flags.join('; ') : 'ok'}`)
}
const clickText = (t) => async () => {
  const el = page.getByText(t, { exact: false }).first()
  if (await el.count()) {
    await el.click().catch(() => {})
    await settle(2000)
  } else console.log(`   (no "${t}" to click)`)
}

await shot('s1_home_aurelia', 'aurelia', '/app', { full: true })
await shot('s3_cashflow_aurelia', 'aurelia', '/cash-flow', { wait: 4000 })
await shot('f1_add_brightwater', 'brightwater', '/finance?tab=add&add=tb', { wait: 3000 })
// S3 dry run: drop the made-up QuickBooks pair on EMPTY Brightwater. The parse is
// client-side; the autosave's POSTs are aborted by the guard, so nothing lands.
const V4 = path.join(REPO, 'demo-video/assets/v4-files')
const dropFiles = (files) => async () => {
  const input = page.locator('input[type=file]').first()
  await input.setInputFiles(files.map((f) => path.join(V4, f)))
  await page.waitForTimeout(3500)
  const status = await page.evaluate(() => [...document.querySelectorAll('body *')].map((e) => (e.children.length === 0 ? e.textContent.trim() : '')).filter((t) => /sorted|quick check|Review \d|couldn|Show KYRO|Balance Sheet/i.test(t)).slice(0, 8))
  console.log('   status:', JSON.stringify(status))
}
await shot('f1_drop_pair_brightwater_DRYRUN', 'brightwater', '/finance?tab=add&add=tb', { before: dropFiles(['Profit and Loss.xlsx', 'Balance Sheet.xlsx']), wait: 3000 })
await shot('f2_drop_messy_brightwater_DRYRUN', 'brightwater', '/finance?tab=add&add=tb', { before: dropFiles(['messy/Trial Balance Export.xlsx']), wait: 3000 })
await shot('f4_drop_plonly_brightwater_DRYRUN', 'brightwater', '/finance?tab=add&add=tb', { before: dropFiles(['pl-only/Profit and Loss.xlsx']), wait: 3000 })
await shot('f4_finance_cedar', 'cedar', '/finance', { wait: 4000 })
await shot('f4_finance_cedar_full', 'cedar', '/finance', { full: true, wait: 4000 })
await shot('f4_finance_aurelia', 'aurelia', '/finance', { wait: 4000 })
await shot('f5_statements_cedar', 'cedar', '/statements', { wait: 4000 })
await shot('f5_statements_cedar_full', 'cedar', '/statements', { full: true, wait: 4000 })
await shot('f6_budget_cedar', 'cedar', '/budget', { wait: 3500 })
await shot('f6_budget_bva_cedar', 'cedar', '/budget', { before: clickText('Budget vs. Actual'), wait: 3500 })
await shot('f6_budget_bva_cedar_full', 'cedar', '/budget', { before: clickText('Budget vs. Actual'), full: true, wait: 3500 })
await shot('f7_cashflow_cedar', 'cedar', '/cash-flow', { wait: 4000 })
await shot('f8_analytics_cedar', 'cedar', '/analytics', { wait: 4500 })
await shot('f8_analytics_cedar_full', 'cedar', '/analytics', { full: true, wait: 4500 })
await shot('f8_peers_cedar', 'cedar', '/analytics?scope=peers', { wait: 5000 })
await shot('f8_peers_cedar_full', 'cedar', '/analytics?scope=peers', { full: true, wait: 5000 })
await shot('f8_org_cedar', 'cedar', '/analytics?scope=org', { wait: 5000 })
await shot('f8_org_cedar_full', 'cedar', '/analytics?scope=org', { full: true, wait: 5000 })
await shot('f8_org_charts_cedar', 'cedar', '/analytics?scope=org', { before: clickText('Charts'), full: true, wait: 5000 })
await shot('f8_scorecard_cedar', 'cedar', '/analytics', { before: clickText('Scorecard'), full: true, wait: 4500 })
await shot('f9_reports_cedar', 'cedar', '/reports', { wait: 3500 })
await shot('f9_board_print_monthly_cedar', 'cedar', '/reports/board/print?period=a063fa11-d9d0-47d9-be9c-4127d8175408&granularity=monthly&month=2026-06', { full: true, wait: 6000 })
await shot('f9_board_print_annual_cedar', 'cedar', '/reports/board/print?period=a063fa11-d9d0-47d9-be9c-4127d8175408', { full: true, wait: 6000 })
await shot('f9_schedules_cedar', 'cedar', '/reports/schedules', { full: true, wait: 3500 })
await shot('f10_readiness_aurelia', 'aurelia', '/readiness', { full: true, wait: 4000 })

fs.writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify({ at: new Date().toISOString(), results, blocked, errors }, null, 1))
console.log(`blocked writes: ${blocked.length}${blocked.length ? '\n  ' + [...new Set(blocked)].join('\n  ') : ''}`)
console.log(`compute-only previews allowed: ${previews.length}`)
console.log(`page errors: ${errors.length}${errors.length ? '\n  ' + [...new Set(errors)].slice(0, 8).join('\n  ') : ''}`)
await browser.close()
