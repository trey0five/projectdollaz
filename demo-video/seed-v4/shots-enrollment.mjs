#!/usr/bin/env node
// KYRO demo v4 — READ-ONLY screenshots of the enrollment scenes (e1–e7) as the
// fictional demo user Morgan on the local web (:5173). Every non-GET request
// except the login is ABORTED, so nothing on screen can write. The login is typed
// into the real /login form once; the session lives only in this in-memory
// browser context (no storageState, nothing written to disk but the PNGs).
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire('/home/dream/village-finder/package.json')
const { chromium } = require('playwright')
const REPO = '/home/dream/dollaz'
const BASE = 'http://127.0.0.1:5173'
const OUT = process.argv[2] || '/home/dream/.cache/kyro-demo-v4/seed-shots/enrollment'
const ONLY = process.argv[3] ? new Set(process.argv[3].split(',')) : null
fs.mkdirSync(OUT, { recursive: true })
const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'demo-video/seed-v4/out/structure.json'), 'utf8'))
const S = Object.fromEntries(manifest.schools.map((s) => [s.key, s]))
const env = Object.fromEntries(
  fs.readFileSync(path.join(REPO, 'demo-video/.env.capture.local'), 'utf8').split(/\r?\n/).map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]),
)

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
const page = await ctx.newPage()
const blocked = []
await page.route('**/api/**', (route) => {
  const req = route.request()
  const m = req.method()
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return route.continue()
  if (m === 'POST' && /\/api\/auth\/login$/.test(req.url())) return route.continue()
  blocked.push(`${m} ${req.url().replace(BASE, '')}`)
  return route.abort()
})
page.on('pageerror', (e) => console.log('  pageerror', e.message.slice(0, 160)))

await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
await page.waitForSelector('input[type=email]')
await page.fill('input[type=email]', env.MORGAN_EMAIL)
await page.fill('input[type=password]', env.MORGAN_PASSWORD)
await page.press('input[type=password]', 'Enter')
await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 30000 })
console.log('logged in →', new URL(page.url()).pathname)

const setScope = (id, scope = 'school') =>
  page.evaluate(([id, scope]) => {
    localStorage.setItem('finrep_active_school_id', id)
    localStorage.setItem('finrep_scope_mode', scope)
  }, [id, scope])

async function shot(name, url, { fn, full = true, wait = 3500 } = {}) {
  if (ONLY && !ONLY.has(name)) return
  try {
    await page.goto(BASE + url, { waitUntil: 'networkidle', timeout: 45000 })
    await page.waitForTimeout(wait)
    if (fn) await fn()
    // Scroll through so in-view animations settle before a full-page capture.
    if (full) {
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) {
          window.scrollTo(0, y)
          await new Promise((r) => setTimeout(r, 120))
        }
        window.scrollTo(0, 0)
      })
      await page.waitForTimeout(1200)
    }
    await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full })
    const txt = await page.evaluate(() => document.body.innerText)
    const flags = []
    if (/DEMO DATA/i.test(txt)) flags.push('DEMO DATA chip')
    if (/No enrollment plan has been entered/i.test(txt)) flags.push('no-plan note')
    if (/couldn't load|could not load|something went wrong/i.test(txt)) flags.push('load error text')
    console.log(`OK ${name}${flags.length ? '  !! ' + flags.join(', ') : ''}`)
  } catch (e) {
    console.log(`ERR ${name}: ${e.message.split('\n')[0]}`)
  }
}

await setScope(S.aurelia.id)
await shot('e1_overview', '/enrollment')
await shot('e1_overview_fold', '/enrollment', { full: false })
await shot('e2_add', '/enrollment?tab=add')
await shot('e2_add_connect', '/enrollment?tab=add', {
  fn: async () => {
    const b = page.getByText(/Connect (a system|your SIS)/i).first()
    if (await b.count()) {
      await b.click()
      await page.waitForTimeout(1500)
    }
  },
})
await shot('e3_trend', '/enrollment?tab=analytics&view=trend')
await shot('e4_grades', '/enrollment?tab=analytics&view=grades')
await shot('e5_cohorts', '/enrollment?tab=analytics&view=cohorts')
await shot('e6_who', '/enrollment?tab=analytics&view=who')
await shot('e7_planning', '/planning')
await shot('s1_home', '/app')
await setScope(S.aurelia.id, 'org')
await shot('e2_diocesan', '/enrollment/diocesan-import')
await shot('org_enrollment', '/enrollment')
await setScope(S.aurelia.id)

console.log(blocked.length ? `blocked ${blocked.length} writes:\n  ${[...new Set(blocked)].join('\n  ')}` : 'no writes attempted')
await browser.close()
