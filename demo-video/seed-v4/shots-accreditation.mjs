#!/usr/bin/env node
// KYRO demo v4 — READ-ONLY screenshots of the accreditation scenes (r1–r7) at
// Cedar Ridge and the x1 sweep / o2 Studio at St. Aurelia, as the fictional demo
// user Morgan on the local web (:5173), 1920×1080. Every non-GET request except
// the login is ABORTED, so nothing on screen can write (opening the improve panel
// or the frameworks modal is a read). The login is typed into the real /login form
// once; the session lives only in this in-memory browser context (no saved browser state).
//
//   node demo-video/seed-v4/shots-accreditation.mjs [outDir] [only,names]
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire('/home/dream/village-finder/package.json')
const { chromium } = require('playwright')
const REPO = '/home/dream/dollaz'
const BASE = 'http://127.0.0.1:5173'
const OUT = process.argv[2] || '/home/dream/.cache/kyro-demo-v4/seed-shots/accreditation'
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
await page.addInitScript(() => {
  window.print = () => {}
})
const blocked = []
await page.route('**/api/**', (route) => {
  const req = route.request()
  const m = req.method()
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return route.continue()
  if (m === 'POST' && /\/api\/auth\/(login|refresh)$/.test(req.url())) return route.continue()
  blocked.push(`${m} ${req.url().replace(BASE, '')}`)
  return route.abort()
})
page.on('pageerror', (e) => console.log('  pageerror', e.message.slice(0, 300)))
page.on('console', (m) => {
  if (m.type() === 'error') console.log('  console.error', m.text().slice(0, 300))
})

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

const FLAGS = [
  [/DEMO DATA/i, 'DEMO DATA chip'],
  [/couldn['’]t load|could not load|something went wrong/i, 'load error text'],
  [/No work started yet/i, '"No work started yet"'],
  [/isn['’]t on your plan yet/i, 'not-on-plan band'],
]
const want = (n) => !ONLY || ONLY.has(n) || [...ONLY].some((o) => n.startsWith(o))
async function settle(full) {
  await page.evaluate(async () => {
    const h = document.body.scrollHeight
    for (let y = 0; y < h; y += 700) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 110))
    }
  })
  if (!full) await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(900)
}
async function capture(name, { full = false } = {}) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full })
  const txt = await page.evaluate(() => document.body.innerText)
  const flags = FLAGS.filter(([re]) => re.test(txt)).map(([, l]) => l)
  console.log(`OK ${name}${flags.length ? '  !! ' + flags.join(', ') : ''}`)
  return txt
}
async function go(url, wait = 4000) {
  await page.goto(BASE + url, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(wait)
}
const scrollToText = async (t, block = 'start', offset = -90) => {
  const el = page.getByText(t, { exact: false }).first()
  await el.evaluate((e, [block, offset]) => {
    e.scrollIntoView({ block })
    window.scrollBy(0, offset)
  }, [block, offset])
  await page.waitForTimeout(1000)
}
const tryit = async (label, fn) => {
  if (!want(label)) return
  try {
    await fn()
  } catch (e) {
    console.log(`ERR ${label}: ${String(e.message).split('\n')[0].slice(0, 200)}`)
  }
}

// ── Ch 5 — Cedar Ridge ──────────────────────────────────────────────────────
await setScope(S.cedar.id)

await tryit('r1', async () => {
  await go('/accreditation')
  await settle(false)
  await capture('r1_overview_top')
  await capture('r1_overview_full', { full: true })
  await go('/accreditation?center=journey')
  await page.locator('[role=tablist][aria-label=Records]').first().evaluate((e) => {
    e.scrollIntoView({ block: 'start' })
    window.scrollBy(0, -90)
  })
  await page.waitForTimeout(1500)
  await capture('r1_journey')
  await page.mouse.wheel(0, 800)
  await page.waitForTimeout(900)
  await capture('r1_journey_b')
})

await tryit('r2', async () => {
  await go('/accreditation')
  await page.getByRole('button', { name: /Frameworks/ }).first().click({ timeout: 5000 })
  await page.waitForTimeout(2500)
  await capture('r2_frameworks_modal')
  await page.getByText('Florida Catholic Conference', { exact: false }).first().evaluate((e) => e.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(900)
  await capture('r2_frameworks_fcc')
  await page.getByText('NIPSA', { exact: false }).last().evaluate((e) => e.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(900)
  await capture('r2_frameworks_nipsa')
  await page.keyboard.press('Escape')
})

await tryit('r3', async () => {
  await go('/accreditation')
  await settle(false)
  await scrollToText('Quickest wins')
  await capture('r3_wins_mustpass')
  await scrollToText('Your score')
  await capture('r3_your_score')
})

await tryit('r4', async () => {
  await go('/accreditation')
  await settle(false)
  await scrollToText('Quickest wins')
  await page.getByRole('button', { name: 'Work on it' }).first().click({ timeout: 5000 })
  await page.waitForTimeout(2500)
  await capture('r4_improve_panel')
  const attach = page.getByRole('button', { name: /Attach from operations/i }).first()
  if (await attach.count()) {
    await attach.click()
    await page.waitForTimeout(2000)
    await capture('r4_attach_from_operations')
    await page.locator('[role=dialog]').last().evaluate((e) => {
      const sc = e.querySelector('aside') || e
      sc.scrollTop = sc.scrollHeight
    }).catch(() => {})
    await page.waitForTimeout(700)
    await capture('r4_attach_list_b')
  } else console.log('  (no "Attach from operations" button found)')
  await page.keyboard.press('Escape')
})

await tryit('r5', async () => {
  await go('/accreditation?center=signals', 5000)
  await page.locator('[role=tablist][aria-label=Records]').first().evaluate((e) => {
    e.scrollIntoView({ block: 'start' })
    window.scrollBy(0, -90)
  })
  await page.waitForTimeout(1500)
  await capture('r5_warnings')
  await scrollToText('The next twenty-four months')
  await capture('r5_horizon')
  await page.mouse.wheel(0, 900)
  await page.waitForTimeout(900)
  await capture('r5_signals')
  await page.mouse.wheel(0, 900)
  await page.waitForTimeout(900)
  await capture('r5_signals_b')
  const disc = page.getByText('What KYRO could read', { exact: false }).first()
  await disc.evaluate((e) => {
    e.scrollIntoView({ block: 'start' })
    window.scrollBy(0, -90)
  })
  await disc.click()
  await page.waitForTimeout(1500)
  await capture('r5_what_kyro_could_read')
  await capture('r5_full', { full: true })
})

await tryit('r6', async () => {
  await go('/accreditation/visit', 7000)
  await settle(false)
  await capture('r6_visit_top')
  for (const [t, n] of [
    ['The team is here', 'r6_act1_arrival'],
    ["What they'd commend", 'r6_act2_commend'],
    ["What they'd likely find", 'r6_act3_findings'],
    ["What they'd ask for", 'r6_act4_requests'],
    ['What we could not answer', 'r6_act5_unanswered'],
    ["So here's the plan", 'r6_act6_plan'],
  ]) {
    try {
      await page.locator(`h2:has-text("${t}"), h3:has-text("${t}")`).first().evaluate((e) => {
        e.scrollIntoView({ block: 'start' })
        window.scrollBy(0, -90)
      })
      await page.waitForTimeout(1000)
      await capture(n)
    } catch (e) {
      console.log(`ERR ${n}: ${String(e.message).split('\n')[0].slice(0, 160)}`)
    }
  }
  await capture('r6_visit_full', { full: true })
})

await tryit('r7', async () => {
  await go('/accreditation/board/print', 6000)
  await capture('r7_board_onepager')
  await capture('r7_board_onepager_full', { full: true })
  await go('/improvement', 6000)
  await settle(false)
  await capture('r7_improvement')
  await capture('r7_improvement_full', { full: true })
})

// ── Ch 6 — St. Aurelia sweep + Studio ───────────────────────────────────────
await setScope(S.aurelia.id)
for (const [n, url] of [
  ['x1_governance', '/governance'],
  ['x1_facilities', '/facilities'],
  ['x1_advancement', '/advancement'],
  ['x1_hr', '/hr'],
  ['x1_strategy', '/strategy'],
]) {
  await tryit(n, async () => {
    await go(url, 5000)
    await settle(false)
    await capture(n)
    await capture(`${n}_full`, { full: true })
  })
}
await tryit('o2_studio', async () => {
  await go('/penny', 6000)
  await capture('o2_studio')
})
await tryit('x1_home', async () => {
  await go('/app', 6000)
  await settle(false)
  await capture('x1_home_aurelia')
})

console.log(blocked.length ? `blocked ${blocked.length} non-GET: ${[...new Set(blocked)].slice(0, 8).join(' | ')}` : 'no writes attempted')
await browser.close()
