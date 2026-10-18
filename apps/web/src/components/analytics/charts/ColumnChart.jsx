import { useId, useMemo, useState } from 'react'
import { CHROME } from './palette.js'
import { ensureChartStyles } from './styles.js'
import { useReducedMotion } from './useReducedMotion.js'
import { useMeasuredWidth } from './useMeasuredWidth.js'
import { useTooltip } from './Tooltip.jsx'
import { stripFiller } from './labelText.js'
import '../../../styles/pending/b2-finance.css'

// ─────────────────────────────────────────────────────────────────────────────
// ColumnChart — the ONE vertical bar (column) primitive for every analytics
// surface. SVG, so rounded caps, reference rules and rotated labels are exact.
//
// PROP SURFACE (typed in prose; every field optional unless marked *):
//
//   rows*      [{ id, label*, value | vals:number[], color?, emphasis?,
//                 forthcoming?, suppressed?, formatted?: string|string[],
//                 meta?: [{label,value}], capLabel?: {text,color,bg} }]
//              value  — single-series datum (null = no data)
//              vals   — one datum per `series` entry (grouped / paired)
//              color  — overrides the fill for THIS row (identity colour;
//                       follows the entity, never the rank)
//              emphasis — "this school": gradient + glow, bold labels
//              forthcoming — hatched grey stub + "forthcoming" in the tooltip
//              suppressed  — amber hatched stub + "<5" (or `stubLabel`, e.g.
//                            "withheld" for a complementary cell) (the enrollment
//                            min-cell convention; NEVER a zero-height column)
//              formatted — pre-formatted value text (tooltip + cap label)
//              meta      — extra tooltip rows (rank, score, share…)
//              capLabel  — a small pill drawn over the group (gap chips)
//   series     [{ id, label, color, style?: 'solid'|'dashed' }]
//              ≥2 entries → grouped columns, 2px sibling gap, a legend above.
//              'dashed' = intention, not observation (plan vs actual).
//   color      single-series fill when no row/series colour is given
//   peerColor  fill for non-emphasis rows when ANY row carries emphasis
//   domain     { lo, hi } — explicit y range (wins over `fit`)
//   fit        { range?:{min,max}, pad?:0.16, includeZero?:true }
//              fitted to the values present, padded, clamped to `range`.
//              includeZero=false ONLY for percentile/scale scores — counts
//              and money always keep a zero baseline.
//   diverging  true → baseline at 0 mid-plot, columns grow up (positive) and
//              down (negative); pass `negativeColor` for the down arm
//   negativeColor  fill for negative values when `diverging`
//   refs       [{ value, label, color }] — horizontal dashed rules with a
//              pill. Refs take part in `fit` (a national line must not fall
//              off a zoomed axis); with an explicit `domain`, refs outside
//              lo..hi are dropped silently
//   refLabelSide 'auto' | 'left' | 'right' — 'auto' puts the pills on the
//              end whose column is shorter (the ranked-desc case → right)
//   formatter  (v) => string, for cap labels + tooltip (default: locale)
//   tickFormatter (v) => string, for y ticks (default: locale integers)
//   unit       { label, decimals, span, gap, points } — renders the unit
//              label above the plot and the zoomed-axis disclosure below it
//   showValues 'selective' (emphasis + max + min) | 'all' | 'none'
//              a row carrying `capLabel` never gets a value label (the pill
//              takes the cap), in either mode — its value is in the tooltip
//   labelMode  'auto' | 'plain' | 'wrap' | 'rotate'   ('two-line' = 'wrap')
//              auto: plain when the longest label fits the band; wrap
//              (filler stripped, split on words, up to THREE lines, the axis
//              band sized to the lines used) when band ≥ 56px OR every label
//              wraps into ≤2 clean lines at ≥40px; rotated −32° single line
//              below that. The FULL label is always in the
//              tooltip, the aria-label and a <title>.
//   minBand    px per row before the chart scrolls sideways (48) — applied in
//              rotate mode only; plain/wrap labels fit the card as it is
//   rotateChars  characters kept on a rotated label before the ellipsis (15);
//              the axis band grows with it
//   height     plot height in px (240) — the axis band is added on top
//   width      px override for the measured container width (tests/SSR)
//   surface    'light' | 'navy' — text/grid tokens for the card ground
//   legend     false to suppress the built-in legend (caller draws its own)
//   spotlightId  a series id (grouped) or row id (single series): every other
//              column dims to 25% so a legend hover can spotlight one identity
//   ariaLabel  the <svg> aria-label
//   empty      node rendered when there are no rows
//
// MARKS: columns ≤24px, 4px rounded data-end, SQUARE at the baseline (a path,
// not rx on a rect), grown from the baseline (CSS scaleY; static under
// reduced-motion). Solid hairline grid (4 lines), recessive. Direct labels are
// selective by default; y ticks carry the rest. Text wears text tokens only.
// Every column is a keyboard-focusable tooltip target whose hit area is the
// whole band, not the painted pixels.
// ─────────────────────────────────────────────────────────────────────────────

const COL_MAX = 24
const COL_GAP = 2
const CAP_R = 4
const DEFAULT_PEER = 'rgba(148,163,184,0.62)'
const AMBER = '#B45309'
const EMPH_LIGHT = '#2DD4BF'

const finite = (v) => v !== null && v !== undefined && Number.isFinite(Number(v))

/** Nice tick values inside [lo, hi] (1/2/5 steps). */
export function niceTicks(lo, hi, count = 4) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return []
  const raw = (hi - lo) / Math.max(1, count - 1)
  const mag = 10 ** Math.floor(Math.log10(raw))
  const build = (step) => {
    const out = []
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(6)))
    return out
  }
  // A zoomed domain (42–80) or a padded count axis (0–161) can leave a "nice"
  // step with one interior tick; walk the 1/2/2.5/5/10 ladder and keep the
  // step whose tick count is closest to `count`, never fewer than three.
  let best = null
  for (const m of [1, 2, 2.5, 5, 10, 20, 25, 50]) {
    const t = build(m * mag)
    if (t.length < 3 || t.length > 8) continue
    if (!best || Math.abs(t.length - count) < Math.abs(best.length - count)) best = t
  }
  if (best) return best
  const fallback = build((raw / mag <= 1 ? 1 : raw / mag <= 2 ? 2 : raw / mag <= 5 ? 5 : 10) * mag)
  return fallback.length >= 2 ? fallback : [lo, hi]
}

/**
 * A scale fitted to the values, padded, clamped to the family's own range.
 * (Same rule as academics/chartKit.fitScale; ported so the chart library
 * never imports a domain module.)
 */
export function fitDomain(values, { range, pad = 0.16, includeZero = true } = {}) {
  const nums = values.filter(finite).map(Number)
  if (nums.length === 0) return { lo: range?.min ?? 0, hi: range?.max ?? 100 }
  let lo = Math.min(...nums)
  let hi = Math.max(...nums)
  if (includeZero) {
    lo = Math.min(lo, 0)
    hi = Math.max(hi, 0)
  }
  const span = hi - lo || Math.max(1, Math.abs(hi) * 0.1)
  lo -= includeZero && lo === 0 ? 0 : span * pad
  hi += span * pad
  if (range) {
    lo = Math.max(range.min, lo)
    hi = Math.min(range.max, hi)
  }
  return { lo, hi: hi > lo ? hi : lo + 1 }
}

/** Strip the filler a school name carries, then cap the length. */
export function shortLabel(name, max = 14) {
  const s = stripFiller(name)
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

/**
 * Up to `maxLines` lines of at most `max` characters, split on word
 * boundaries (a hyphenated or slashed token breaks after its delimiter), the
 * last line tail-ellipsised when the name still does not fit. A word standing
 * alone on a line may run one character over — the width estimate is
 * conservative and an ellipsis costs more than a glyph of overhang.
 */
export function wrapLabel(name, max = 12, maxLines = 3) {
  const words = stripFiller(name)
    .split(' ')
    .filter(Boolean)
    .flatMap((w) => (w.length > max + 1 ? w.split(/(?<=[-/])/) : [w]))
  const src = words.length ? words : [String(name ?? '')]
  const pack = (slack) => {
    const out = []
    let cur = ''
    for (const w of src) {
      if (!cur) cur = w
      else if ((cur + ' ' + w).length <= max + slack) cur += ' ' + w
      else {
        out.push(cur)
        cur = w
      }
    }
    if (cur) out.push(cur)
    return out
  }
  // Pack to the cap first; spend the one-character slack only when it is
  // what keeps the name inside `maxLines` (a lone glyph of overhang beats an
  // ellipsis, but neighbours must not touch when there is no need).
  let lines = pack(0)
  if (lines.length > maxLines) lines = pack(1)
  if (lines.length > maxLines) {
    const head = lines.slice(0, maxLines - 1)
    head.push(lines.slice(maxLines - 1).join(' '))
    return head.map((l, i) => (l.length > max + (i < head.length - 1 ? 1 : 0) ? `${l.slice(0, max - 1).trimEnd()}…` : l))
  }
  return lines.map((l) => (l.length > max + 1 ? `${l.slice(0, max - 1).trimEnd()}…` : l))
}

/** The two-line variant of `wrapLabel` (kept for the published contract). */
export const twoLineLabel = (name, max = 12) => wrapLabel(name, max, 2)

function columnPath(x, w, yTop, yBase) {
  const h = Math.abs(yBase - yTop)
  const r = Math.min(CAP_R, w / 2, h)
  if (h < 0.5) return ''
  if (yTop <= yBase) {
    return `M${x},${yBase} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + w - r} Q${x + w},${yTop} ${x + w},${yTop + r} V${yBase} Z`
  }
  return `M${x},${yBase} V${yTop - r} Q${x},${yTop} ${x + r},${yTop} H${x + w - r} Q${x + w},${yTop} ${x + w},${yTop - r} V${yBase} Z`
}

const defaultFormatter = (v) =>
  v === null || v === undefined || !Number.isFinite(Number(v))
    ? '—'
    : Number(v).toLocaleString('en-US', { maximumFractionDigits: 1 })

const tickFmt = (v, step) => {
  const d = step < 1 ? 1 : 0
  return Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

export default function ColumnChart({
  rows = [],
  series,
  color = '#2563EB',
  peerColor = DEFAULT_PEER,
  domain,
  fit,
  diverging = false,
  negativeColor = '#E11D48',
  refs = [],
  refLabelSide = 'auto',
  formatter = defaultFormatter,
  tickFormatter,
  unit,
  showValues = 'selective',
  labelMode = 'auto',
  minBand = 48,
  height = 240,
  width,
  surface = 'light',
  legend = true,
  rotateChars = 15,
  spotlightId = null,
  ariaLabel,
  empty = null,
}) {
  ensureChartStyles()
  const reduce = useReducedMotion()
  const tip = useTooltip()
  const uid = `col${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const [ref, measured] = useMeasuredWidth(560)
  const [hot, setHot] = useState(null)
  const [focused, setFocused] = useState(null)
  const [atEnd, setAtEnd] = useState(false)

  const navy = surface === 'navy'
  const T = navy
    ? {
        ink: 'rgba(255,255,255,0.9)',
        inkSoft: 'rgba(255,255,255,0.72)',
        dim: 'rgba(255,255,255,0.48)',
        axis: 'rgba(255,255,255,0.55)',
        grid: 'rgba(255,255,255,0.09)',
        base: 'rgba(255,255,255,0.3)',
        bg: '#16284f',
        band: 'rgba(255,255,255,0.05)',
      }
    : {
        ink: CHROME.ink,
        inkSoft: CHROME.inkSoft,
        dim: CHROME.dimText,
        axis: CHROME.axis,
        grid: CHROME.grid,
        base: 'rgba(16,28,61,0.2)',
        bg: '#FFFFFF',
        band: 'rgba(16,28,61,0.035)',
      }

  const S = useMemo(
    () => (series && series.length ? series : [{ id: 'value', label: unit?.label ?? 'Value', color }]),
    [series, color, unit],
  )
  const grouped = S.length > 1
  const valsOf = (r) => (Array.isArray(r.vals) ? r.vals : [r.value])

  // ── Domain ────────────────────────────────────────────────────────────────
  const { lo, hi } = useMemo(() => {
    if (domain && finite(domain.lo) && finite(domain.hi) && domain.hi > domain.lo) return domain
    const all = [...rows.flatMap(valsOf), ...refs.map((x) => x.value)]
    if (diverging) {
      const m = Math.max(1, ...all.filter(finite).map((v) => Math.abs(Number(v))))
      return { lo: -m * 1.18, hi: m * 1.18 }
    }
    return fitDomain(all, { range: fit?.range, pad: fit?.pad ?? 0.16, includeZero: fit?.includeZero ?? true })
  }, [domain, rows, refs, fit, diverging])

  const n = rows.length
  const ticks = useMemo(() => niceTicks(lo, hi, 4), [lo, hi])
  const step = ticks.length > 1 ? ticks[1] - ticks[0] : 1
  const fmtTick = tickFormatter ?? ((v) => tickFmt(v, step))

  // ── Label mode + geometry ─────────────────────────────────────────────────
  const groupW = S.length * COL_MAX + (S.length - 1) * COL_GAP
  const bandMin = Math.max(minBand, groupW + 14)
  const tickW = Math.max(...ticks.map((t) => fmtTick(t).length), 2) * 6 + 12
  const PAD_R = 12
  const PAD_T = 24
  const hostW = width ?? measured
  const PAD_L0 = Math.max(30, tickW)
  // The band the card offers before any minimum is imposed. Short labels
  // ("Grade 12") wrap cleanly at ~45px and must not be pushed into a rotated,
  // scrolling axis just because long school names would need one.
  const bandFree = n ? Math.max(groupW + 6, (hostW - PAD_L0 - PAD_R) / n) : 0
  const longest = Math.max(0, ...rows.map((r) => String(r.label ?? '').length))
  const plainFits = longest * 6.2 + 8 <= bandFree
  const wrapMaxAt = (b) => Math.max(6, Math.min(24, Math.floor((b - 4) / 5.7)))
  const wrapsClean =
    bandFree >= 40 &&
    rows.every((r) => {
      const w = wrapLabel(String(r.label ?? ''), wrapMaxAt(bandFree))
      return w.length <= 2 && !w.some((l) => l.endsWith('…'))
    })
  const requested = labelMode === 'two-line' ? 'wrap' : labelMode
  const mode = requested !== 'auto' ? requested : plainFits ? 'plain' : bandFree >= 56 || wrapsClean ? 'wrap' : 'rotate'
  // `minBand` is the rotate-mode floor; plain/wrap labels fit the card as is.
  const bandFloor = mode === 'rotate' ? bandMin : groupW + 6
  const band0 = n ? (Math.max(hostW, PAD_L0 + PAD_R + n * bandFloor) - PAD_L0 - PAD_R) / n : 0
  // A −32° label hangs LEFT of its column, so the first one runs under the
  // tick gutter and, past it, would be clipped by the scroll container. The
  // gutter is free below the plot, so only the overhang beyond it is reserved:
  // from free card width when the chart fits, or as extra scroll width when
  // it scrolls anyway. When neither is available the label shortens instead.
  const ROT_MAX = Math.max(8, Math.round(rotateChars))
  const COS32 = Math.cos((32 * Math.PI) / 180)
  const SIN32 = Math.sin((32 * Math.PI) / 180)
  const fitsAnyway = hostW >= PAD_L0 + PAD_R + n * bandFloor
  const free = Math.max(0, hostW - (PAD_L0 + PAD_R + n * bandFloor))
  // The rotated text BOX overhangs by its height's sine too, not only its
  // length's cosine — without that term the first glyph clipped by ~6px.
  const needed = Math.max(0, Math.round(COS32 * ROT_MAX * 5.4 + SIN32 * 11 - band0 / 2 - PAD_L0 + 6))
  const rotExtent = mode !== 'rotate' ? 0 : fitsAnyway ? Math.min(needed, free) : needed
  const PAD_L = PAD_L0 + rotExtent
  const W = Math.max(hostW, PAD_L + PAD_R + n * bandFloor)
  const plotW = W - PAD_L - PAD_R
  const band = n ? plotW / n : plotW
  const ROT_CHARS = mode === 'rotate' ? Math.max(8, Math.min(ROT_MAX, Math.floor((PAD_L + band / 2 - 4) / (COS32 * 5.4)))) : ROT_MAX
  // Characters per line scale with the band (≈5.7px per glyph at 9px), so a
  // wide band prints the whole name and a narrow one wraps it.
  const wrapMax = wrapMaxAt(band)
  const wrapped = mode === 'wrap' ? rows.map((r) => wrapLabel(String(r.label ?? ''), wrapMax)) : null
  const wrapLines = wrapped ? Math.max(1, ...wrapped.map((w) => w.length)) : 0
  const PAD_B = mode === 'plain' ? 26 : mode === 'wrap' ? 18 + wrapLines * 11 : Math.round(26 + SIN32 * ROT_MAX * 5.4 + 8)
  const plotH = height
  const H = PAD_T + plotH + PAD_B
  const floor = PAD_T + plotH
  const y = (v) => PAD_T + (1 - (Number(v) - lo) / (hi - lo || 1)) * plotH
  const baseV = diverging ? 0 : Math.min(Math.max(0, lo), hi)
  const yBase = y(baseV)
  const colW = Math.max(4, Math.min(COL_MAX, (band - 12 - (S.length - 1) * COL_GAP) / S.length))
  const groupPx = S.length * colW + (S.length - 1) * COL_GAP

  // The axis-break glyph: a baseline that is not the scale's own floor is a
  // decision the reader must be able to SEE, not just read in a caption.
  const rangeMin = fit?.range?.min ?? 0
  const broken = !diverging && lo > rangeMin + 1e-9
  const zoomed = fit?.range ? lo > fit.range.min + 1e-9 || hi < fit.range.max - 1e-9 : broken

  // ── Direct labels: selective by default ──────────────────────────────────
  const labelled = useMemo(() => {
    const set = new Set()
    if (showValues === 'none') return set
    rows.forEach((r, i) => {
      if (r.capLabel) return
      const vals = valsOf(r)
      if (showValues === 'all' || r.emphasis) vals.forEach((v, s) => finite(v) && set.add(`${i}:${s}`))
    })
    if (showValues === 'selective') {
      const firsts = rows.map((r, i) => ({ i, v: valsOf(r)[0], cap: !!r.capLabel })).filter((x) => finite(x.v) && !x.cap)
      if (firsts.length) {
        const max = firsts.reduce((a, b) => (Number(b.v) > Number(a.v) ? b : a))
        const min = firsts.reduce((a, b) => (Number(b.v) < Number(a.v) ? b : a))
        set.add(`${max.i}:0`)
        set.add(`${min.i}:0`)
      }
    }
    return set
  }, [rows, showValues])

  const anyEmphasis = rows.some((r) => r.emphasis)
  // The fill a column is DRAWN with (and the swatch the tooltip shows for it):
  // an explicit row colour always wins; then the diverging arm; then the
  // emphasis gradient / peer grey; then the series or chart hue.
  const fillFor = (r, sr, v) => {
    const neg = diverging && finite(v) && Number(v) < 0
    const base = sr.color ?? color
    if (r.color) return { fill: r.color, swatch: r.color }
    if (neg) return { fill: negativeColor, swatch: negativeColor }
    if (r.emphasis && !grouped) return { fill: `url(#${uid}-emph)`, swatch: base }
    if (anyEmphasis && !r.emphasis && !grouped) return { fill: peerColor, swatch: peerColor }
    return { fill: base, swatch: base }
  }
  const dec = unit?.decimals
  const fmtVal = (v) => (dec !== undefined && finite(v) ? Number(v).toFixed(dec).replace(/\.0$/, '') : formatter(v))
  const valueText = (r, s) => {
    const v = valsOf(r)[s]
    const f = Array.isArray(r.formatted) ? r.formatted[s] : s === 0 ? r.formatted : undefined
    if (f !== undefined && f !== null) return f
    if (r.suppressed) return '<5'
    if (!finite(v)) return r.forthcoming ? 'forthcoming' : 'no data'
    return fmtVal(v)
  }

  const tipContent = (r) => ({
    title: r.label,
    rows: [
      ...S.map((sr, s) => ({ color: fillFor(r, sr, valsOf(r)[s]).swatch, label: sr.label, value: valueText(r, s) })),
      ...(r.meta ?? []).map((m) => ({ color: CHROME.dim, label: m.label, value: m.value })),
    ],
  })
  const aria = (r) =>
    `${r.label}: ${S.map((sr, s) => `${grouped ? `${sr.label} ` : ''}${valueText(r, s)}`).join(', ')}${
      r.meta?.length ? `; ${r.meta.map((m) => `${m.label} ${m.value}`).join(', ')}` : ''
    }`

  // ── Reference rules: pills placed where they collide with the least ─────
  // A pill over a column body is legible (it carries a surface backing); a
  // pill over a cap LABEL is not. Each candidate (side × vertical slot) is
  // scored against the columns it would cover — labels weigh three times a
  // body — and the quietest slot wins; ties fall to the plan's default of the
  // end whose column is shorter.
  const visibleRefs = (() => {
    const inRange = refs.filter((x) => finite(x.value) && x.value >= lo && x.value <= hi)
    const first = rows.length ? valsOf(rows[0])[0] : null
    const last = rows.length ? valsOf(rows[rows.length - 1])[0] : null
    const preferred =
      finite(first) && finite(last) && Number(last) <= Number(first) ? 'right' : 'left'
    const sides = refLabelSide !== 'auto' ? [refLabelSide] : preferred === 'right' ? ['right', 'left'] : ['left', 'right']
    const slots = [-16, 3, -30, 17]
    const obstacles = rows.flatMap((r, i) =>
      valsOf(r).flatMap((v, s) => {
        if (!finite(v)) return []
        const x = PAD_L + band * i + band / 2 - groupPx / 2 + s * (colW + COL_GAP)
        const top = Math.min(y(v), yBase)
        const bottom = Math.max(y(v), yBase)
        // Boxes carry a 4px margin so a pill that merely grazes a label still
        // counts as a collision — adjacent reads as touching.
        const list = [{ x0: x - 2, x1: x + colW + 2, y0: top - 2, y1: bottom, w: 1 }]
        if (labelled.has(`${i}:${s}`) || r.capLabel) list.push({ x0: x - 10, x1: x + colW + 10, y0: top - 21, y1: top + 2, w: 3 })
        return list
      }),
    )
    const taken = []
    const sorted = [...inRange].sort((a, b) => y(a.value) - y(b.value))
    // A scrolling chart opens at scrollLeft 0, so "right" means the right
    // edge of what is VISIBLE, never the far end of the scroll width.
    const visW = Math.min(W, hostW)
    return sorted.map((x) => {
      const ry = y(x.value)
      const pw = x.label.length * 5.4 + 12
      let best = null
      for (const side of sides) {
        const px = side === 'right' ? visW - PAD_R - pw - 2 : PAD_L + 4
        for (const dy of slots) {
          const py = ry + dy
          let score = 0
          for (const o of obstacles) {
            if (o.x1 < px || o.x0 > px + pw || o.y1 < py || o.y0 > py + 14) continue
            score += o.w
          }
          for (const t of taken) {
            if (t.x1 < px || t.x0 > px + pw || t.y1 < py || t.y0 > py + 14) continue
            score += 10
          }
          if (!best || score < best.score) best = { side, px, py, score }
          if (score === 0) break
        }
        if (best && best.score === 0) break
      }
      taken.push({ x0: best.px, x1: best.px + pw, y0: best.py, y1: best.py + 14 })
      return { ...x, side: best.side, px: best.px, py: best.py, pw }
    })
  })()

  if (!n) return empty

  const legendItems = grouped && legend !== false ? S : null
  const stubH = 10

  return (
    <div className="fr-col" data-label-mode={mode}>
      {legendItems || unit?.label ? (
        <div className="fr-col-head">
          {legendItems ? (
            <div className="fr-col-legend" style={{ color: T.ink }}>
              {legendItems.map((sr) => (
                <span key={sr.id ?? sr.label} className="fr-col-legend-item">
                  <i
                    aria-hidden="true"
                    style={
                      sr.style === 'dashed'
                        ? { border: `1.5px dashed ${sr.color}`, background: `${sr.color}14` }
                        : { background: sr.color }
                    }
                  />
                  {sr.label}
                </span>
              ))}
            </div>
          ) : (
            <span />
          )}
          {unit?.label ? (
            <span className="fr-col-unit" style={{ color: T.dim }}>
              {unit.label}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* A chart wider than its card (rotate mode, many schools) scrolls INSIDE
          this wrapper — never the page — and says so with the same right-edge
          fade a DataTable uses; the fade lifts once the reader reaches the end. */}
      <div className="b2-hscroll-fade" data-overflow={!navy && W > hostW + 1 ? 'x' : undefined} data-at-end={String(atEnd || W <= hostW + 1)}>
      <div
        ref={ref}
        className="fr-col-scroll"
        onScroll={(e) => {
          const el = e.currentTarget
          setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1)
        }}
      >
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          style={{ display: 'block', minWidth: W, overflow: 'visible' }}
          role="group"
          aria-label={ariaLabel ?? 'Column chart'}
        >
          <defs>
            <linearGradient id={`${uid}-emph`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={EMPH_LIGHT} stopOpacity="1" />
              <stop offset="100%" stopColor={rows.find((r) => r.emphasis)?.color ?? color} stopOpacity="1" />
            </linearGradient>
            <filter id={`${uid}-glow`} x="-60%" y="-30%" width="220%" height="160%">
              <feGaussianBlur stdDeviation="3.2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <pattern id={`${uid}-hatch-amber`} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="rgba(180,83,9,0.08)" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(180,83,9,0.55)" strokeWidth="1.5" />
            </pattern>
            <pattern id={`${uid}-hatch-grey`} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="rgba(148,163,184,0.1)" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(148,163,184,0.6)" strokeWidth="1.5" />
            </pattern>
          </defs>

          {/* Recessive grid + y ticks */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)} stroke={T.grid} strokeWidth="1" />
              <text
                x={PAD_L - 6}
                y={y(t) + 3}
                fontSize="9.5"
                textAnchor="end"
                fill={T.axis}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {fmtTick(t)}
              </text>
            </g>
          ))}

          {/* Hover band behind the active group */}
          {hot !== null ? (
            <rect x={PAD_L + band * hot} y={PAD_T - 6} width={band} height={plotH + 6} rx="6" fill={T.band} />
          ) : null}

          {/* Columns */}
          {rows.map((r, i) => {
            const vals = valsOf(r)
            const cx = PAD_L + band * i + band / 2
            const x0 = cx - groupPx / 2
            const isHot = hot === i
            const isFocus = focused === i
            const emph = !!r.emphasis
            const labelFill = emph ? T.ink : T.dim
            const groupTop = Math.min(
              yBase,
              ...vals.filter(finite).map((v) => y(v)),
            )
            const label = String(r.label ?? '')
            return (
              <g
                key={r.id ?? label ?? i}
                className="fr-col-hit"
                role="img"
                tabIndex={0}
                aria-label={aria(r)}
                onMouseEnter={() => setHot(i)}
                onMouseMove={(ev) => tip.show(tipContent(r), ev.clientX, ev.clientY)}
                onMouseLeave={() => {
                  setHot(null)
                  tip.hide()
                }}
                onFocus={(ev) => {
                  setFocused(i)
                  const rc = ev.currentTarget.getBoundingClientRect()
                  tip.show(tipContent(r), rc.left + rc.width / 2, rc.top + Math.min(rc.height, 40))
                }}
                onBlur={() => {
                  setFocused(null)
                  tip.hide()
                }}
              >
                <title>{aria(r)}</title>
                {/* Hit target = the whole band, plot + axis label */}
                <rect x={PAD_L + band * i} y={PAD_T - 6} width={band} height={plotH + PAD_B + 6} fill="transparent" />

                {vals.map((v, s) => {
                  const sr = S[s]
                  const x = x0 + s * (colW + COL_GAP)
                  const hollow = sr.style === 'dashed'
                  const stub = r.suppressed || (!finite(v) && r.forthcoming)
                  if (stub) {
                    return (
                      <g key={s}>
                        <path
                          d={columnPath(x, colW, yBase - stubH, yBase)}
                          fill={`url(#${uid}-hatch-${r.suppressed ? 'amber' : 'grey'})`}
                        />
                        {s === 0 ? (
                          <text
                            x={x + groupPx / 2}
                            y={yBase - stubH - 5}
                            fontSize="9.5"
                            fontWeight="700"
                            textAnchor="middle"
                            fill={r.suppressed ? AMBER : T.dim}
                          >
                            {r.suppressed ? (r.stubLabel ?? '<5') : 'due'}
                          </text>
                        ) : null}
                      </g>
                    )
                  }
                  if (!finite(v)) return null
                  const neg = diverging && Number(v) < 0
                  const fillBase = r.color ?? sr.color ?? color
                  const { fill } = fillFor(r, sr, v)
                  const d = columnPath(x, colW, y(v), yBase)
                  const show = labelled.has(`${i}:${s}`)
                  const dimmed = spotlightId !== null && spotlightId !== undefined && (grouped ? sr.id !== spotlightId : r.id !== spotlightId)
                  const ty = neg ? y(v) + 12 : y(v) - 5
                  return (
                    <g key={s}>
                      <path
                        d={d}
                        className={reduce ? undefined : neg ? 'fr-col-grow-down' : 'fr-col-grow'}
                        fill={hollow ? `${fillBase}14` : fill}
                        stroke={hollow ? fillBase : 'none'}
                        strokeWidth={hollow ? 1.5 : 0}
                        strokeDasharray={hollow ? '4 3' : undefined}
                        filter={emph ? `url(#${uid}-glow)` : undefined}
                        opacity={dimmed ? 0.25 : isHot || hot === null ? 1 : 0.85}
                        style={reduce ? { transition: 'opacity .2s' } : { animationDelay: `${0.05 + i * 0.045 + s * 0.08}s`, transition: 'opacity .2s' }}
                      />
                      {show ? (
                        <text
                          x={x + colW / 2}
                          y={ty}
                          fontSize={emph ? 12 : 10.5}
                          fontWeight="700"
                          textAnchor="middle"
                          fill={emph ? T.ink : T.inkSoft}
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          {valueText(r, s)}
                        </text>
                      ) : null}
                    </g>
                  )
                })}

                {/* Focus ring — drawn, not outlined (SVG <g> has no outline box) */}
                {isFocus ? (
                  <rect
                    x={x0 - 4}
                    y={groupTop - 4}
                    width={groupPx + 8}
                    height={Math.max(8, yBase - groupTop + 8)}
                    rx="5"
                    fill="none"
                    stroke="#2563EB"
                    strokeWidth="2"
                  />
                ) : null}

                {/* Cap pill (gap chip etc.) */}
                {r.capLabel ? (
                  <g transform={`translate(${cx}, ${groupTop - 9})`}>
                    <rect
                      x={-(r.capLabel.text.length * 5.6 + 10) / 2}
                      y={-8}
                      width={r.capLabel.text.length * 5.6 + 10}
                      height="15"
                      rx="7.5"
                      fill={r.capLabel.bg ?? T.band}
                    />
                    <text
                      y="3.5"
                      fontSize="9.5"
                      fontWeight="700"
                      textAnchor="middle"
                      fill={r.capLabel.color ?? T.inkSoft}
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {r.capLabel.text}
                    </text>
                  </g>
                ) : null}

                {/* X label */}
                {mode === 'plain' ? (
                  <text x={cx} y={floor + 16} fontSize="10.5" textAnchor="middle" fill={labelFill} fontWeight={emph ? 700 : 500}>
                    {label}
                  </text>
                ) : mode === 'wrap' ? (
                  <text x={cx} y={floor + 14} fontSize="9" textAnchor="middle" fill={labelFill} fontWeight={emph ? 700 : 500}>
                    {wrapped[i].map((line, li) => (
                      <tspan key={li} x={cx} dy={li === 0 ? 0 : 11}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                ) : (
                  <text
                    x={cx}
                    y={floor + 12}
                    fontSize="9.5"
                    textAnchor="end"
                    fill={labelFill}
                    fontWeight={emph ? 700 : 500}
                    transform={`rotate(-32 ${cx} ${floor + 12})`}
                  >
                    {shortLabel(label, ROT_CHARS)}
                  </text>
                )}
              </g>
            )
          })}

          {/* Baseline (solid, one step darker than the grid) */}
          <line x1={PAD_L} x2={W - PAD_R} y1={yBase} y2={yBase} stroke={T.base} strokeWidth={diverging ? 1.5 : 1} />

          {/* Axis break: the baseline is NOT the scale's floor */}
          {broken ? (
            <g data-axis-break="true" stroke={T.axis} strokeWidth="1.2" fill="none">
              <title>{`The axis starts at ${fmtVal(lo)}, not ${fmtVal(rangeMin)}`}</title>
              <path d={`M${PAD_L - 5},${floor + 3} l10,-5 M${PAD_L - 5},${floor + 7} l10,-5`} />
            </g>
          ) : null}

          {/* Reference rules + pills */}
          {visibleRefs.map((rf) => {
            const ry = y(rf.value)
            const text = rf.label
            const { pw, px, py } = rf
            return (
              <g key={`${rf.label}-${rf.value}`} data-ref={rf.label}>
                <line x1={PAD_L} x2={W - PAD_R} y1={ry} y2={ry} stroke={rf.color} strokeWidth="1.5" strokeDasharray="6 4" opacity="0.9" />
                <rect x={px} y={py} width={pw} height="14" rx="7" fill={T.bg} opacity="0.92" />
                <rect x={px} y={py} width={pw} height="14" rx="7" fill={rf.color} opacity="0.14" />
                <text
                  x={px + pw / 2}
                  y={py + 10}
                  fontSize="8.5"
                  fontWeight="700"
                  textAnchor="middle"
                  fill={rf.color}
                  style={{ letterSpacing: '0.04em', textTransform: 'uppercase' }}
                >
                  {text}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      </div>

      {unit ? (
        <p className="fr-col-note" data-zoomed={zoomed ? 'true' : 'false'} style={{ color: T.dim }}>
          {zoomed
            ? `The axis is zoomed to the range in play (${fmtVal(lo)}–${fmtVal(hi)}), not the full ${unit.span ?? 'scale'}, so small gaps stay visible.`
            : `The axis spans the full ${unit.span ?? 'scale'}.`}
          {unit.gap ? ` A difference under ${unit.gap} ${unit.points} is not a difference — read column heights with that in mind.` : ''}
        </p>
      ) : null}
    </div>
  )
}
