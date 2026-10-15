// ─────────────────────────────────────────────────────────────────────────────
// Aurora band contrast — white text must stay readable over EVERY module band.
//
// The band's blobs drift, so any word on the band (title, verdict, a glass
// button's label) can end up over any blob. Review 2026-10-15 measured the old
// fixed +28° companion turning Accreditation's amber chartreuse: the white
// "Frameworks" label sat on rgb(173,178,7) at 2.3:1, and Facilities' orange
// went mustard at 3.4–4.2:1. This spec pins the two guards in
// auroraVarsFromHue (moduleAnatomy.js) for every registry hue:
//   • white over each glow blob (70% over the lightest band stop) ≥ 4.5:1
//   • the band stops and --au-deep (the white button's label) clear it too
//   • a warm hue's companions never walk into yellow-green.
// ─────────────────────────────────────────────────────────────────────────────
/* global process */
import { describe, it, expect } from 'vitest'
import { HOME_TILES } from '../home/tileRegistry.jsx'
import { IMPROVEMENT_HUE } from '../improvement/improvementMeta.js'
import { auroraVarsFromHue, hexToRgb, overBand, whiteContrast, luminance } from './moduleAnatomy.js'

const HUES = [
  ...HOME_TILES.map((t) => [t.key, t.hue]),
  ['improvement', IMPROVEMENT_HUE],
  ['default', '#2563EB'],
]

const hueOf = (hex) => {
  const [r, g, b] = hexToRgb(hex).map((c) => c / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === min) return 0
  const d = max - min
  let h
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return h * 60
}

describe('auroraVarsFromHue — white text stays ≥4.5:1 on every band', () => {
  it.each(HUES)('%s (%s): every glow blob, the band stops and the white button label', (_key, hex) => {
    const v = auroraVarsFromHue(hex)
    const d0 = hexToRgb(v['--au-d0'])
    for (const g of ['--au-g1', '--au-g2', '--au-g3']) {
      expect(whiteContrast(overBand(hexToRgb(v[g]), d0)), `${g} ${v[g]}`).toBeGreaterThanOrEqual(4.5)
    }
    for (const d of ['--au-d0', '--au-d1', '--au-d2']) {
      expect(whiteContrast(hexToRgb(v[d])), d).toBeGreaterThanOrEqual(4.5)
    }
    // The white primary button's label (--au-deep on #fff).
    expect(1.05 / (luminance(hexToRgb(v['--au-deep'])) + 0.05)).toBeGreaterThanOrEqual(4.5)
  })

  it('a warm hue (amber, orange) turns its companions toward red, never yellow-green', () => {
    for (const hex of ['#F59E0B', '#EA580C']) {
      const v = auroraVarsFromHue(hex)
      for (const c of ['--au-h2', '--au-h3', '--au-g2', '--au-g3']) {
        const h = hueOf(v[c])
        // yellow-green lives roughly 55°–150°; the companions must sit in red/orange
        expect(h < 50 || h > 330, `${hex} ${c} ${v[c]} hue ${h.toFixed(0)}°`).toBe(true)
      }
    }
  })

  it('a cool hue keeps the mockup pairings (blue → violet + cyan family)', () => {
    const v = auroraVarsFromHue('#2563EB')
    expect(hueOf(v['--au-h2'])).toBeGreaterThan(240)
    expect(hueOf(v['--au-h3'])).toBeLessThan(205)
    // blue already clears the floor, so its band is unchanged by the guard
    expect(v['--au-g1']).toBe(v['--au-b1'])
  })
})

// ── Light buttons (.au-lbtn) — the "+ New" / section buttons on white ─────────
// Verifier 2026-10-15: Enrollment Records' "+ New" (sky, 78% hue + black)
// measured ~4.35:1 behind white text; amber was ~3.5:1. The fill is now
// --au-deep — the hue darkened just until white clears 4.6:1 — and the same
// colour is the outline button's words and the white-on-hover tile button's
// words. This pins the numbers for every registry hue and for the `hue` prop
// overrides callers pass (AuroraLightButton → lightButtonHueVars).
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const mix = (rgb, target, t) => rgb.map((c, i) => Math.round(c + (target[i] - c) * t))

describe('.au-lbtn — white words on the fill, fill-coloured words on white, ≥4.5:1', () => {
  const OVERRIDES = [
    ['amber prop', '#b45309'],
    ['good prop', '#059669'],
    ['risk prop', '#e11d48'],
  ]
  it.each([...HUES, ...OVERRIDES])('%s (%s)', (_key, hex) => {
    const fill = hexToRgb(auroraVarsFromHue(hex)['--au-deep'])
    const white = [255, 255, 255]
    // solid: white on the fill, and on the (deeper) hover fill
    expect(contrast(white, fill), 'solid').toBeGreaterThanOrEqual(4.5)
    expect(contrast(white, mix(fill, [0, 0, 0], 0.14)), 'solid hover').toBeGreaterThanOrEqual(4.5)
    // ghost: fill-coloured words on white; on the 6% hue-tinted hover the words
    // go the hover shade deeper (aurora.css .au-lbtn-ghost:hover)
    expect(contrast(fill, white), 'ghost').toBeGreaterThanOrEqual(4.5)
    expect(contrast(mix(fill, [0, 0, 0], 0.14), mix(hexToRgb(hex), white, 0.94)), 'ghost hover').toBeGreaterThanOrEqual(4.5)
  })

  it('aurora.css paints the light button from the deep fill, never a fixed 78% mix', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const css = readFileSync(resolve(process.cwd(), 'src/styles/aurora.css'), 'utf8')
    const rule = css.match(/\n\.au-lbtn \{[^}]*\}/)[0]
    expect(rule).toMatch(/--lb-fill: var\(--lb-deep, var\(--au-deep/)
    expect(rule).toMatch(/background: var\(--lb-fill\)/)
    expect(css).not.toMatch(/color-mix\(in srgb, var\(--th\) 78%, #000\)/)
  })

  it('a hue override carries its own deep fill', async () => {
    const { lightButtonHueVars } = await import('../ui/aurora/AuroraButton.jsx')
    expect(lightButtonHueVars(null)).toBeNull()
    const v = lightButtonHueVars('#0EA5E9')
    expect(v['--th']).toBe('#0EA5E9')
    expect(v['--lb-deep']).toBe(auroraVarsFromHue('#0EA5E9')['--au-deep'])
  })
})
