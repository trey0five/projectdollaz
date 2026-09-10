import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import KyroDove from './KyroDove.jsx'
import { framePosition } from './hooks/useSpriteFrame.js'
import {
  FALLBACK,
  FLY_SCALE,
  deriveGeometry,
  isWellFormedManifest,
  manifestMatchesSheet,
} from './kyroDoveManifest.js'

// ─────────────────────────────────────────────────────────────────────────────
// KyroDove — the sprite-sheet contract and the "no disc behind the owl" rule.
//
// THE BUG THIS DEFENDS AGAINST (2026-09-10, owner screenshot of the landing
// orbit): the flying owl rendered as two giant partial cells side by side.
// The fly layer picks its frame with PERCENTAGE background-size/position
// (cols×100% by rows×100%, column c at c/(cols−1)), which is only correct when
// the layer box is exactly one cell (scaled) of the sheet that actually
// decodes. A manifest from a previous mascot (7×6 cells, 2.76:1) had been
// served from the browser cache (`force-cache`) against the little owl's 6×6
// ~1:1 sheet. Each assertion below reddens under the one-line change named.
// ─────────────────────────────────────────────────────────────────────────────

afterEach(cleanup)

// The snowy-owl manifest that was live at the SAME URL earlier the same day.
const STALE_SNOWY = {
  fly: { file: 'fly.webp', frames: 42, cols: 7, rows: 6, cellW: 384, cellH: 139, sheetW: 2688, sheetH: 834, fps: 24, anchor: { x: 0.3342, y: 0.4001 } },
  perched: { file: 'perched.webp', w: 512, h: 512, anchor: { x: 0.5, y: 0.95 } },
  glide: { file: 'glide.webp', w: 384, h: 139, anchor: { x: 0.3342, y: 0.4001 } },
}

const calcFactor = (s) => {
  const m = /^calc\(var\(--kyro-h\) \* ([\d.]+)\)$/.exec(s)
  if (!m) throw new Error(`not a --kyro-h calc: ${s}`)
  return Number(m[1])
}

describe('fly layer geometry = exactly one sheet cell, scaled', () => {
  it('deriveGeometry sizes the fly layer to FLY_SCALE perched-heights at the cell aspect', () => {
    const g = deriveGeometry(FALLBACK)
    const u = g.perched.h // one unit = the perched still's rendered height (h: 1 in units)
    // Reddens if the layer height stops being FLY_SCALE units (e.g. a union-box rewrite).
    expect(g.fly.h).toBeCloseTo(FLY_SCALE * u, 6)
    // Reddens if the layer aspect drifts from the CELL aspect (percentage frame math breaks).
    expect(g.fly.w / g.fly.h).toBeCloseTo(FALLBACK.fly.cellW / FALLBACK.fly.cellH, 6)
    expect(g.glide.w / g.glide.h).toBeCloseTo(FALLBACK.glide.w / FALLBACK.glide.h, 6)
  })

  it('renders the fly layer as one cell with background-size cols×layerW by rows×layerH', () => {
    const { container } = render(<KyroDove size={128} state="flying" paused />)
    const fly = container.querySelector('[data-kyro-layer="fly"]')
    expect(fly).toBeTruthy()
    const { cols, rows, cellW, cellH } = FALLBACK.fly
    // cols×100% of the layer width by rows×100% of its height IS cols·layerW × rows·layerH.
    expect(fly.style.backgroundSize).toBe(`${cols * 100}% ${rows * 100}%`)
    const w = calcFactor(fly.style.width)
    const h = calcFactor(fly.style.height)
    const g = deriveGeometry(FALLBACK)
    expect(h).toBeCloseTo(FLY_SCALE * g.perched.h, 3) // one cell scaled to FLY_SCALE u
    expect(w / h).toBeCloseTo(cellW / cellH, 3) // ... at the cell's own aspect
    // The layer points at the sheet keyed to its declared size (belt 1).
    expect(fly.style.backgroundImage).toContain(`fly.webp?v=${FALLBACK.fly.sheetW}x${FALLBACK.fly.sheetH}`)
  })

  it('framePosition puts column c at c/(cols−1) and row r at r/(rows−1)', () => {
    expect(framePosition(0, 6, 6)).toBe('0% 0%')
    expect(framePosition(3, 6, 6)).toBe('60% 0%')
    expect(framePosition(6, 6, 6)).toBe('0% 20%')
    expect(framePosition(35, 6, 6)).toBe('100% 100%')
    expect(framePosition(5, 1, 1)).toBe('0% 0%')
  })
})

describe('manifest ↔ sheet guard (the stale-cache root cause)', () => {
  it('rejects a manifest that does not describe the decoded sheet', () => {
    expect(manifestMatchesSheet(FALLBACK, FALLBACK.fly.sheetW, FALLBACK.fly.sheetH)).toBe(true)
    expect(manifestMatchesSheet(STALE_SNOWY, FALLBACK.fly.sheetW, FALLBACK.fly.sheetH)).toBe(false)
  })

  it('requires cols·cellW = sheetW and rows·cellH = sheetH', () => {
    expect(isWellFormedManifest(FALLBACK)).toBe(true)
    expect(isWellFormedManifest({ ...FALLBACK, fly: { ...FALLBACK.fly, cols: 7 } })).toBe(false)
    expect(isWellFormedManifest({ ...FALLBACK, fly: { ...FALLBACK.fly, frames: 37 } })).toBe(false)
    expect(isWellFormedManifest(null)).toBe(false)
  })

  it('asset URLs are versioned by the dimensions the manifest declares', () => {
    const fresh = deriveGeometry(FALLBACK)
    const stale = deriveGeometry(STALE_SNOWY)
    expect(fresh.fly.file).not.toBe(stale.fly.file)
    expect(stale.fly.file).toBe('/kyro-owl/fly.webp?v=2688x834')
    expect(fresh.perched.file256).toBe('/kyro-owl/perched@256.webp?v=256x252')
  })

  describe('loadManifest', () => {
    let images
    beforeEach(() => {
      vi.resetModules()
      images = []
    })

    const stubImage = (natural) => {
      class FakeImage {
        constructor() {
          images.push(this)
          this.naturalWidth = natural.w
          this.naturalHeight = natural.h
        }
        set src(v) {
          this._src = v
          queueMicrotask(() => this.onload && this.onload())
        }
        get src() {
          return this._src
        }
        decode() {
          return Promise.resolve()
        }
      }
      vi.stubGlobal('Image', FakeImage)
    }

    it('revalidates (never force-cache) and keeps the bundled manifest when the served one mismatches the sheet', async () => {
      stubImage({ w: FALLBACK.fly.sheetW, h: FALLBACK.fly.sheetH })
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => STALE_SNOWY })
      vi.stubGlobal('fetch', fetchMock)
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const mod = await import('./kyroDoveManifest.js')
      const m = await mod.loadManifest()
      expect(fetchMock).toHaveBeenCalledWith('/kyro-owl/manifest.json', { cache: 'no-cache' })
      expect(m).toBe(mod.FALLBACK)
      expect(mod.getManifest()).toBe(mod.FALLBACK)
      // The measurement asked for the sheet the STALE manifest describes.
      expect(images[0].src).toBe('/kyro-owl/fly.webp?v=2688x834')
    })

    it('adopts a served manifest whose sheet decodes at the declared size', async () => {
      const served = JSON.parse(JSON.stringify(FALLBACK))
      served.fly.anchor = { x: 0.5, y: 0.5 } // a legitimate tweak, same sheet
      stubImage({ w: served.fly.sheetW, h: served.fly.sheetH })
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => served }))
      const mod = await import('./kyroDoveManifest.js')
      const m = await mod.loadManifest()
      expect(m).toBe(served)
    })
  })
})

describe('nothing circular behind the owl', () => {
  const circles = (container) =>
    [...container.querySelectorAll('span')].filter((el) => el.style.borderRadius === '50%')

  it('active / speaking / listening render no ring or disc (only the celebrate badge may be round)', () => {
    for (const props of [{ active: true }, { speaking: true }, { listening: true }, { active: true, speaking: true }]) {
      const { container, unmount } = render(<KyroDove size={56} {...props} />)
      expect(circles(container)).toHaveLength(0)
      unmount()
    }
    const { container } = render(<KyroDove size={56} celebrate />)
    expect(circles(container)).toHaveLength(1) // the check badge, bottom-right — not behind the bird
  })

  it('speaking/listening pulse the whole bird about its feet; active alone adds no motion class', () => {
    const root = (props) => render(<KyroDove size={56} {...props} />).container.firstChild
    expect(root({ speaking: true }).className).toContain('kyro-pulse')
    expect(root({ listening: true }).className).toContain('kyro-pulse')
    expect(root({ active: true }).className).not.toContain('kyro-pulse')
    expect(root({ active: true }).className).not.toContain('kyro-ring')
    const g = deriveGeometry(FALLBACK)
    expect(root({ speaking: true }).style.transformOrigin).toBe(
      `calc(var(--kyro-h) * ${g.feet.x.toFixed(4)}) calc(var(--kyro-h) * ${g.feet.y.toFixed(4)})`,
    )
  })
})
