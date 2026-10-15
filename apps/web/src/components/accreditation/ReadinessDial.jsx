// ─────────────────────────────────────────────────────────────────────────────
// ReadinessDial — the projected-index gauge built for the DARK Aurora band
// (the Accreditation band's right column). Same facts as ReadinessHero's light
// arc, drawn as a half dome: a dim track over the index scale, a THICK fill
// from indexMin up to the projected index (rose below every band, mint inside
// one) and a dot at its end. The status bands are a THIN outer ring that
// brightens with the tier — never the same weight as the fill, so an index at
// the bottom never reads as a full meter. Each band floor gets a short tick and
// its number outside the arc; the school's target is named in a caption UNDER
// the dial, so no label ever sits on the big number.
//
// HONESTY (pinned for the light arc in improvement-honesty.spec): the big
// number is `projectedIndex` and nothing else. The advisory in-flight
// projection is a thin dashed ghost with the literal word PROJECTION in its
// tooltip — never the headline, never the dot.
//
// Frameworks with no index scale (MSA / NSBECS) render nothing: there is no
// dome to draw, and the band's KPI cards carry the readiness figures instead.
// Screen only (the band is screen only). Reduced motion → no sweep.
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from 'framer-motion'

// The drawing sits inside a padded viewBox so tier numbers outside the arc are
// never clipped: x from -PAD to W + PAD.
const W = 320
const PAD = 34
const CX = 160
const CY = 178
const R = 116 // centre line of the track
const TRACK = 18 // track + fill thickness
const RING = R + TRACK / 2 + 7 // thin tier ring, just outside the track
const PROJ = RING + 8 // advisory in-flight projection, outside the ring
const NUM = PROJ + 15 // tier numbers
const H = CY + 30

function pt(f, r = R) {
  const a = Math.PI * (1 - f)
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)]
}

function arc(f1, f2, r = R) {
  const [x1, y1] = pt(f1, r)
  const [x2, y2] = pt(f2, r)
  const large = Math.abs(f2 - f1) > 1 ? 1 : 0
  return `M${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`
}

const clamp01 = (v) => Math.min(Math.max(v, 0), 1)

export default function ReadinessDial({ readiness, reduce = false }) {
  const fw = readiness?.framework ?? null
  if (!fw || fw.indexMin == null || fw.indexMax == null || readiness?.projectedIndex == null) return null
  const span = fw.indexMax - fw.indexMin || 1
  const f = (v) => clamp01((v - fw.indexMin) / span)
  const bands = [...(fw.statusBands ?? [])].sort((a, b) => a.min - b.min)
  const idx = readiness.projectedIndex
  const frac = f(idx)
  const below = readiness.belowThreshold === true
  const floor = bands[0] ?? null
  // The school's target band when it has one (the ladder it chose), else the
  // lowest band — named under the dial, never on it.
  const targetMin = readiness.target?.index ?? floor?.min ?? null
  const targetBand = bands.find((b) => b.min === targetMin) ?? floor
  const expected = readiness.inFlight?.expectedIndexIfDelivered ?? null
  const projFrac = expected != null ? f(expected) : null
  const [dx, dy] = pt(frac)
  const [sx] = pt(0)
  const [ex] = pt(1)
  const fillColor = below ? '#fb7185' : '#34d399'
  // The accreditor's published reference point (e.g. Cognia's 296 network
  // average) — a FAINT dashed tick, display only: it never enters the fill,
  // the dot or any readiness math. Its label lives in the tooltip.
  const indexRef = fw.indexReference ?? null
  const refFrac = indexRef && typeof indexRef.value === 'number' ? f(indexRef.value) : null
  const label = `Projected index ${idx} of ${fw.indexMax} — ${readiness.band ?? 'below accreditation threshold'}`
  const toGo = targetBand && idx < targetBand.min ? targetBand.min - idx : null

  return (
    <figure className="acc-dial" data-testid="band-readiness-dial">
      <svg viewBox={`${-PAD} 0 ${W + PAD * 2} ${H}`} role="img" aria-label={label}>
        {/* the dome's dark glass + the dim full-scale track */}
        <path d={`${arc(0, 1, R - TRACK / 2 - 2)} Z`} fill="rgba(0,0,0,.22)" />
        <path d={arc(0, 1)} fill="none" stroke="rgba(255,255,255,.16)" strokeWidth={TRACK} strokeLinecap="round" />
        {/* the thin tier ring: each status band, brighter with the tier */}
        {bands.map((b, i) => {
          const next = bands[i + 1]?.min ?? fw.indexMax
          const op = 0.35 + (0.55 * (i + 1)) / Math.max(bands.length, 1)
          const isTarget = targetBand && b.min === targetBand.min
          return (
            <path
              key={b.min}
              d={arc(f(b.min), f(next), RING)}
              fill="none"
              stroke={isTarget ? '#fde68a' : `rgba(255,255,255,${op.toFixed(2)})`}
              strokeWidth={isTarget ? 5 : 4}
            >
              <title>
                {b.label} · {b.min}+
              </title>
            </path>
          )
        })}
        {/* the reached distance: a thick fill from the bottom of the scale */}
        {frac > 0 ? (
          <motion.path
            d={arc(0, frac)}
            fill="none"
            stroke={fillColor}
            strokeWidth={TRACK}
            strokeLinecap="round"
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 55, damping: 18 }}
          />
        ) : null}
        {projFrac != null ? (
          <g data-testid="band-dial-projection">
            <title>PROJECTION — {expected} if the in-flight work is delivered. Not your current index.</title>
            <path d={arc(0, projFrac, PROJ)} fill="none" stroke="rgba(255,255,255,.6)" strokeWidth={2} strokeDasharray="4 6" />
          </g>
        ) : null}
        {refFrac != null ? (
          <g data-testid="index-reference-tick">
            {(() => {
              const [x1, y1] = pt(refFrac, R - TRACK / 2)
              const [x2, y2] = pt(refFrac, RING + 4)
              return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,.7)" strokeWidth={1.5} strokeDasharray="2 3" />
            })()}
            <title>{indexRef.label ?? `Reference · ${indexRef.value}`}</title>
            <desc>{indexRef.value}</desc>
          </g>
        ) : null}
        {/* a short tick at every band floor, its number outside the arc */}
        {bands.map((b) => {
          const fb = f(b.min)
          const [x1, y1] = pt(fb, R - TRACK / 2)
          const [x2, y2] = pt(fb, RING + 3)
          const [tx, ty] = pt(fb, NUM)
          const anchor = fb > 0.6 ? 'start' : fb < 0.4 ? 'end' : 'middle'
          return (
            <g key={`t${b.min}`}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeWidth={2} />
              <text x={tx} y={ty + 4} textAnchor={anchor} fontSize={12} fontWeight={700} fill="rgba(255,255,255,.9)">
                {b.min}
              </text>
            </g>
          )
        })}
        <circle cx={dx} cy={dy} r={10} fill={below ? '#e11d48' : '#10b981'} stroke="#fff" strokeWidth={3} />
        <text x={CX} y={CY - 34} textAnchor="middle" fontSize={50} fontWeight={800} fill="#fff" className="acc-dial-num">
          {idx}
        </text>
        <text x={CX} y={CY - 10} textAnchor="middle" fontSize={12.5} fontWeight={600} fill="rgba(255,255,255,.85)">
          projected score
        </text>
        <text x={sx} y={CY + 26} textAnchor="middle" fontSize={12} fill="rgba(255,255,255,.75)">
          {fw.indexMin}
        </text>
        <text x={ex} y={CY + 26} textAnchor="middle" fontSize={12} fill="rgba(255,255,255,.75)">
          {fw.indexMax}
        </text>
      </svg>
      {targetBand ? (
        <figcaption className="acc-dial-cap">
          <span className="acc-dial-key" aria-hidden="true" />
          Target: <b>{targetBand.label}</b> · {targetBand.min}
          {toGo != null ? <span className="acc-dial-togo"> · {toGo} to go</span> : null}
          <span className="sr-only">. {label}.</span>
        </figcaption>
      ) : (
        <figcaption className="sr-only">{label}</figcaption>
      )}
    </figure>
  )
}
