// Deterministic frame-by-frame Playwright render of a scholar-v4 page → mp4
// (1920x1080, 30 fps, h264 crf 18, yuv420p, silent) — or, with --alpha, a
// ProRes 4444 .mov that keeps the transparency.
//
// Serves, read-only, over 127.0.0.1:
//   /core/…          the Scholar engine (default: the app's own core in this checkout,
//                    apps/web/src/components/penny/scholar/core; --core <dir> to point elsewhere)
//   /demo-video/…    this folder's pages, fonts, voice timings, assets
//   /apps/web/public/… the brand images (kyro-logo.png)
//
//   node scholar-v4/render.mjs --page scholar-v4/end.html --out end
//   node scholar-v4/render.mjs --page scholar-v4/card.html --q n=2 --out card2 [--alpha]
//   node scholar-v4/render.mjs --page scholar-v4/end.html --probe 0,60,300   (stills + __dbg, no video)
import { createRequire } from 'module'
import { mkdirSync, rmSync, existsSync, statSync, createReadStream, writeFileSync, readFileSync, readdirSync } from 'fs'
import { execFileSync } from 'child_process'
import { createHash } from 'crypto'
import http from 'http'
import path from 'path'

const require = createRequire('/home/dream/village-finder/package.json')
const { chromium } = require('playwright')

const arg = (k, d) => {
  const i = process.argv.indexOf(k)
  return i > -1 ? process.argv[i + 1] : d
}
const HERE = path.dirname(new URL(import.meta.url).pathname)
const DEMO = path.resolve(HERE, '..')
const REPO = path.resolve(DEMO, '..')
const CORE = path.resolve(arg('--core', path.join(REPO, 'apps/web/src/components/penny/scholar/core')))
const PAGE = arg('--page', 'scholar-v4/end.html')
const NAME = arg('--out', path.basename(PAGE, '.html'))
const EXTRA = arg('--q', '')
const TOTAL = arg('--total', null)
const ALPHA = process.argv.includes('--alpha')
const PROBES = process.argv.includes('--probe') ? arg('--probe').split(',').map((s) => parseInt(s, 10)) : null
const OUTDIR = path.join(HERE, 'out')
const FPS = 30
const FFMPEG = existsSync('/home/dream/bin/ffmpeg') ? '/home/dream/bin/ffmpeg' : 'ffmpeg'

const TYPES = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2', mp4: 'video/mp4' }
const ROOTS = [
  ['/core/', CORE + '/'],
  ['/demo-video/', DEMO + '/'],
  ['/apps/web/public/', path.join(REPO, 'apps/web/public') + '/'],
]
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0])
  const root = ROOTS.find(([p]) => url.startsWith(p))
  if (!root || url.includes('..')) {
    res.writeHead(404)
    res.end('nf')
    return
  }
  const p = root[1] + url.slice(root[0].length)
  let st
  try {
    st = statSync(p)
  } catch {
    res.writeHead(404)
    res.end('nf')
    return
  }
  res.writeHead(200, { 'Content-Type': TYPES[p.split('.').pop()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' })
  createReadStream(p).pipe(res)
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const PORT = server.address().port
const qs = [TOTAL ? `total=${TOTAL}` : '', ALPHA ? 'alpha=1' : '', EXTRA].filter(Boolean).join('&')
const url = `http://127.0.0.1:${PORT}/demo-video/${PAGE}${qs ? '?' + qs : ''}`

const browser = await chromium.launch({ args: ['--force-color-profile=srgb', '--font-render-hinting=none'] })
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
let failed = false
page.on('pageerror', (e) => {
  failed = true
  console.error('PAGEERROR', e.message)
})
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.error('CONSOLE', m.type(), m.text())
})
await page.goto(url)
await page.waitForFunction('window.__ready === true || window.__failed', { timeout: 120000 })
if (failed) process.exit(1)
const total = await page.evaluate(() => window.__total)
const meta = await page.evaluate(() => window.__meta)
const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
mkdirSync(OUTDIR, { recursive: true })

if (PROBES) {
  const dir = path.join(OUTDIR, 'probe')
  mkdirSync(dir, { recursive: true })
  for (const i of PROBES) {
    await page.evaluate((n) => window.__seek(n), i)
    await settle()
    const f = path.join(dir, `${NAME}-${String(i).padStart(4, '0')}.png`)
    await page.screenshot({ path: f, omitBackground: ALPHA })
    console.log('probe', i, f, JSON.stringify(await page.evaluate(() => window.__dbg)))
  }
  await browser.close()
  server.close()
  process.exit(0)
}

const frames = path.join(OUTDIR, `.frames-${NAME}${ALPHA ? '-alpha' : ''}`)
if (existsSync(frames)) rmSync(frames, { recursive: true, force: true })
mkdirSync(frames, { recursive: true })
const t0 = Date.now()
for (let i = 0; i < total; i++) {
  await page.evaluate((n) => window.__seek(n), i)
  await settle()
  await page.screenshot({ path: `${frames}/f${String(i).padStart(5, '0')}.png`, omitBackground: ALPHA })
  if (i % 100 === 0) console.log(NAME, 'frame', i, '/', total, ((Date.now() - t0) / 1000).toFixed(0) + 's')
}
await browser.close()
server.close()
if (failed) {
  console.error('page errors during render — not encoding')
  process.exit(1)
}

const out = path.join(OUTDIR, ALPHA ? `${NAME}-alpha.mov` : `${NAME}.mp4`)
const enc = ALPHA
  ? ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-vendor', 'apl0']
  : ['-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart']
execFileSync(FFMPEG, ['-y', '-v', 'error', '-framerate', String(FPS), '-i', `${frames}/f%05d.png`, '-frames:v', String(total), ...enc, out], { stdio: 'inherit' })
rmSync(frames, { recursive: true, force: true })

// Provenance: which engine drew this owl, and which voice timings placed the beats.
const coreHash = createHash('sha256')
for (const f of readdirSync(CORE).filter((f) => f.endsWith('.js')).sort()) coreHash.update(f).update(readFileSync(path.join(CORE, f)))
writeFileSync(
  path.join(OUTDIR, `${NAME}${ALPHA ? '-alpha' : ''}.json`),
  JSON.stringify({ ...meta, page: PAGE, query: qs, out: path.relative(DEMO, out), core: path.relative(REPO, CORE) || CORE, coreSha256: coreHash.digest('hex').slice(0, 16), renderedAt: new Date().toISOString() }, null, 1),
)
console.log('WROTE', out, `${total} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`)
