// Captures every storyboard scene as a 1920x1080 webm via Playwright's
// recorder. One browser context per scene so each clip is its own file.
// Run: node capture.mjs [sceneId ...]   (no args = all scenes)
//
// AUTH: no passwords — an access token is MINTED per run with the API's own
// JWT_SECRET (read from the docker container) for the torrey.munroe demo
// profile, and injected into localStorage before each page loads. Stored
// browser states go stale (refresh-token rotation) and film the login page;
// minted tokens cannot.
import { createRequire } from 'module'
import { mkdirSync, renameSync, readdirSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'
import { createHmac } from 'crypto'
const require = createRequire('/home/dream/village-finder/frontend/package.json')
const { chromium } = require('playwright')

const BASE = 'http://localhost:5173'
const DIR = new URL('.', import.meta.url).pathname
const CAP = DIR + 'captures'
mkdirSync(CAP, { recursive: true })

const TORREY = '726f5d5b-e1a4-4e0d-aad3-b9c5697d0d1c'
const NMB = '6413c8ed-f8d3-42c0-b988-07ce3d395bfc'
const SP = 'ed11f400-69ee-4125-9fb5-4a8ae6b48ff4'
const SAMPLE = '3e99c8ee-e81d-432a-85a2-9705648a98ef'

function mintToken(userId) {
  const secret = execSync('docker exec dollaz-api-1 printenv JWT_SECRET').toString().trim()
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const head = b64({ alg: 'HS256', typ: 'JWT' })
  const body = b64({ sub: userId, type: 'access', iat: now, exp: now + 6 * 3600 })
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${sig}`
}
const TOKEN = mintToken(TORREY)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Human-feeling scroll: many small wheel ticks. */
async function drift(page, px, ms) {
  const steps = Math.max(8, Math.round(ms / 90))
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, px / steps)
    await sleep(ms / steps)
  }
}

/** Remove trial/2FA banners — marketing footage carries no chrome a paying
 *  customer wouldn't see. Only ever removes a wide-but-SHORT bar; page-level
 *  wrappers (which also contain the text) are excluded by the length cap. */
async function stripBanners(page) {
  await page.evaluate(() => {
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

const nav = async (p, path) => {
  await p.goto(BASE + path, { waitUntil: 'networkidle' })
  await sleep(1200)
  await stripBanners(p)
}

// Per scene: { school, scope?, run }. school==null → public page, no auth.
const SCENES = {
  // The landing hero video IS the website intro; everything else is in-app.
  v_intro: {
    school: null,
    async run(p) {
      await p.goto(BASE + '/', { waitUntil: 'networkidle' })
      await sleep(3800)
      await drift(p, 420, 2600)
      await sleep(2600)
    },
  },
  // The Daily Briefing — open it and let it walk the network's concerns.
  v_briefing: {
    school: NMB,
    scope: 'org',
    async run(p) {
      await nav(p, '/app')
      await sleep(3000)                                  // hero: '20 things · 10 critical'
      await p.locator('text=Open Daily Briefing').first().click({ timeout: 3000 }).catch(() => {})
      await sleep(2000)
      await stripBanners(p)
      await sleep(3200)                                  // the briefing itself
      await drift(p, 520, 3000)
      await sleep(2600)
      await drift(p, 520, 3000)
      await sleep(3400)
    },
  },
  // ANCHOR — the superintendent tour: briefing → KPIs → Schools → Needs
  // attention → click INTO North Miami Beach.
  v_org: {
    school: NMB,
    scope: 'org',
    async run(p) {
      await nav(p, '/app')
      await sleep(3200)                                  // briefing hero
      await drift(p, 640, 2800)                          // org KPI band
      await sleep(2800)
      await p.locator('text=Schools').first().click().catch(() => {})
      await sleep(4200)
      await p.locator('text=Needs attention').first().click().catch(() => {})
      await sleep(4200)
      await p.locator('text=North Miami Beach Sr High').first().click().catch(() => {})
      await sleep(1500)
      await stripBanners(p)
      await sleep(4300)                                  // inside the school
    },
  },
  v_enroll_overview: {
    school: NMB,
    async run(p) {
      await nav(p, '/enrollment')
      await sleep(5200)                                  // gauge + chips
      await drift(p, 260, 2200)
      await sleep(4200)
    },
  },
  v_enroll_roster: {
    school: NMB,
    async run(p) {
      await nav(p, '/enrollment')
      await sleep(800)
      // The roster analytics block sits ~700px down; smooth-scroll to it.
      await p.evaluate(() => window.scrollTo({ top: 640, behavior: 'smooth' }))
      await sleep(2600)
      // Work the filters: Grade 9, then the IEP chip. The filter row's first
      // select IS the grade filter (no selects render above it).
      const gradeSel = p.locator('select').first()
      await gradeSel.selectOption({ label: 'Grade 9' }, { timeout: 2500 }).catch(() => {})
      await sleep(3200)
      await gradeSel.selectOption({ index: 0 }, { timeout: 2500 }).catch(() => {})
      await sleep(1000)
      await p.locator('text=ISP').first().click({ timeout: 2500 }).catch(() => {})
      await sleep(2800)
      await p.locator('text=ISP').first().click({ timeout: 2500 }).catch(() => {})
      await drift(p, 520, 2600)
      await sleep(4200)
    },
  },
  v_statements: {
    school: NMB,
    async run(p) {
      await nav(p, '/statements')
      await sleep(3000)                                  // Activities
      await drift(p, 560, 2600)
      await sleep(1600)
      await p.locator('text=Statement of Financial Position').first().click().catch(() => {})
      await sleep(3400)
      await p.locator('text=Statement of Cash Flows').first().click().catch(() => {})
      await sleep(3000)
      await p.locator('text=Net Assets').first().click().catch(() => {})
      await sleep(3000)
    },
  },
  v_budget: {
    school: NMB,
    async run(p) {
      await nav(p, '/budget')
      await sleep(4600)                                  // summary cards
      await drift(p, 460, 2600)                          // categories + net
      await sleep(5000)
    },
  },
  v_consolidated: {
    school: NMB,
    async run(p) {
      await nav(p, '/budget')
      await sleep(1400)
      await p.locator('text=Organizational roll-up').first().click().catch(() => {})
      await sleep(4600)
      await p.locator('text=Consolidated statements').first().click().catch(() => {})
      await sleep(3200)
      await drift(p, 420, 2200)
      await sleep(3200)
    },
  },
  // The Board Report wizard — assembles from saved statements + budget,
  // with the Draft-with-AI narrative moment.
  v_report: {
    school: SAMPLE,
    async run(p) {
      await nav(p, '/reports')
      await sleep(1800)
      await p.locator('#reports-board-card').click({ timeout: 4000 })
        .catch(() => p.locator('text=Board Report').first().click({ timeout: 3000 }).catch(() => {}))
      await sleep(1000)
      await stripBanners(p)
      await sleep(2600)                                  // step 1: period + message
      await p.locator('button:has-text("Confirm financials")').first().click({ timeout: 4000 }).catch(() => {})
      await sleep(1000)
      await stripBanners(p)
      await sleep(4200)                                  // step 2: the pulled financials
      await p.locator('button:has-text("Review variance")').first().click({ timeout: 4000 }).catch(() => {})
      await sleep(1000)
      await stripBanners(p)
      await sleep(2600)                                  // step 3: variance table
      await drift(p, 760, 2800)                          // down to the MD&A editor
      await sleep(800)
      // The button reads 'Draft with AI' on an empty MD&A, 'Regenerate' when a
      // draft exists — either way, the AI writes the narrative on camera.
      const aiBtn = p.locator('button:has-text("Draft with AI"), button:has-text("Regenerate")').first()
      await aiBtn.click({ timeout: 4000 }).catch(() => {})
      await sleep(400)
      let drafting = true
      for (let i = 0; i < 30 && drafting; i++) {
        await sleep(1000)
        drafting = (await p.locator('text=Drafting…').count()) > 0
      }
      await sleep(4200)                                  // read the drafted narrative
      await p.locator('button:has-text("Branding")').first().click({ timeout: 3000 }).catch(() => {})
      await sleep(1500)
      await p.locator('button:has-text("Generate")').first().click({ timeout: 3000 }).catch(() => {})
      await sleep(1200)
      await stripBanners(p)
      await sleep(4400)                                  // step 5: the generated packet
      await drift(p, 420, 2200)
      await sleep(2600)
    },
  },
  v_analytics: {
    school: SAMPLE,
    async run(p) {
      await nav(p, '/analytics')
      await sleep(3600)                                  // Overview story
      await p.locator('text=Charts').first().click().catch(() => {})
      await sleep(2200)
      await drift(p, 520, 2600)                          // donuts + trends
      await sleep(2200)
      await p.locator('text=Scorecard').first().click().catch(() => {})
      await sleep(3800)
      await p.locator('text=Peers').first().click().catch(() => {})
      await sleep(2400)
      await drift(p, 380, 2200)
      await sleep(3600)
    },
  },
  v_cashflow: {
    school: SP,
    async run(p) {
      await nav(p, '/cash-flow')
      await sleep(2400)
      // The setup hero prefills operating cash — press the one button.
      await p.locator('button:has-text("Build forecast")').first().click({ timeout: 3000 }).catch(() => {})
      await sleep(4500)                                  // projection builds
      await p.locator('button:has-text("3M")').first().click({ timeout: 2500 }).catch(() => {})
      await sleep(2800)
      await p.locator('button:has-text("12M")').first().click({ timeout: 2500 }).catch(() => {})
      await sleep(2800)
      await p.locator('text=Workbook').first().click({ timeout: 2500 }).catch(() => {})
      await sleep(2200)
      await drift(p, 420, 2400)
      await sleep(3200)
    },
  },
  v_cash: {
    school: SP,
    async run(p) {
      await nav(p, '/cash')
      await sleep(4600)                                  // KPI tiles
      await drift(p, 520, 2800)                          // aging profile
      await sleep(3200)
      await drift(p, 460, 2600)                          // register + rail
      await sleep(4600)
    },
  },
  v_accred: {
    school: NMB,
    async run(p) {
      await nav(p, '/accreditation')
      await sleep(3600)                                  // gauge + fastest path
      await p.locator('text=Frameworks').first().click().catch(() => {})
      await sleep(3800)                                  // multi-framework modal
      await p.keyboard.press('Escape')
      await sleep(800)
      await p.locator('text=COG-1').first().click().catch(() => {})
      await sleep(4200)                                  // standard popup
      await p.keyboard.press('Escape')
      await sleep(800)
      await drift(p, 420, 2200)
      await sleep(2800)
    },
  },
  // Penny Studio performs a real task: ask → proposed change → Confirm.
  // Timestamps are written beside the capture so the build can cut the
  // variable LLM thinking-wait out of the final edit.
  v_penny: {
    school: SAMPLE,
    async run(p) {
      const t0 = Date.now()
      const at = () => (Date.now() - t0) / 1000
      const mark = {}
      await nav(p, '/penny')
      await sleep(2200)
      const ta = p.locator('textarea, input[placeholder*="Ask"], [contenteditable="true"]').first()
      // Ask 1 — a write: Penny proposes, we confirm, it applies.
      await ta.click({ timeout: 4000 }).catch(() => {})
      await p.keyboard.type('Create a task to review the boiler maintenance contract before it renews next Friday', { delay: 24 })
      await sleep(700)
      mark.enter = at()
      await p.keyboard.press('Enter')
      let found = false
      for (let i = 0; i < 40 && !found; i++) {
        await sleep(1000)
        found = (await p.locator('button:has-text("Confirm")').count()) > 0
      }
      mark.confirm = at()
      await sleep(4800)                                  // read the proposed-change card
      await p.locator('button:has-text("Confirm")').first().click({ timeout: 3000 }).catch(() => {})
      await sleep(6000)                                  // Applied + Undo state
      // Ask 2 — a read: the revenue-mix explanation with the inline chart.
      await ta.click({ timeout: 4000 }).catch(() => {})
      await p.keyboard.type('Explain our revenue mix and show me the chart', { delay: 24 })
      await sleep(600)
      mark.enter2 = at()
      await p.keyboard.press('Enter')
      let chart = false
      for (let i = 0; i < 30 && !chart; i++) {
        await sleep(1000)
        chart = (await p.locator('text=Revenue Mix').count()) > 0
      }
      mark.chart = at()
      await sleep(2000)
      await drift(p, 320, 1800)                          // bring the donut into frame
      await sleep(8000)                                  // let the chart breathe
      writeFileSync(`${CAP}/v_penny.json`, JSON.stringify(mark))
      await sleep(2500)
    },
  },
  v_breadth: {
    school: NMB,
    async run(p) {
      for (const path of ['/governance', '/facilities', '/advancement', '/strategy']) {
        await p.goto(BASE + path, { waitUntil: 'networkidle' })
        await stripBanners(p)
        await sleep(2400)
      }
    },
  },
  // The trust card — FERPA, end-to-end encryption, AWS.
  v_trust: {
    school: null,
    async run(p) {
      await p.goto('file://' + DIR + 'assets/trust.html')
      await sleep(20000)
    },
  },
  v_endcard: {
    school: null,
    async run(p) {
      await p.goto('file://' + DIR + 'assets/endcard.html')
      await sleep(9500)
    },
  },
}

const wanted = process.argv.slice(2)
const ids = wanted.length ? wanted : Object.keys(SCENES)
const browser = await chromium.launch()
for (const id of ids) {
  const scene = SCENES[id]
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
    }, [TOKEN, scene.school, scene.scope ?? null])
  }
  try {
    await scene.run(p)
    const video = p.video()
    await ctx.close() // finalizes the webm
    renameSync(await video.path(), `${CAP}/${id}.webm`)
    console.log('captured', id)
  } catch (e) {
    await ctx.close().catch(() => {})
    console.error('FAILED', id, e.message)
  }
}
await browser.close()
for (const f of readdirSync(CAP)) if (!f.startsWith('v_') && !f.startsWith('s')) console.log('stray:', f)
