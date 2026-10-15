// ─────────────────────────────────────────────────────────────────────────────
// ReadinessDial — the projected-index gauge built for the DARK Aurora band
// (the Accreditation band's right column). Same facts as ReadinessHero's light
// arc, drawn as a half dome: the index scale from indexMin to indexMax, each
// status band a white segment that brightens with the tier, a white tick at
// every band floor (the lowest one labelled), and a dot at the projected index
// — rose when the index sits below every band, mint when it lands in one.
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

const W = 320
const H = 214
const CX = 160
const CY = 168
const R = 124

function pt(f, r = R) {
  const a = Math.PI * (1 - f)
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)]
}

function arc(f1, f2, r = R) {
  const [x1, y1] = pt(f1, r)
  const [x2, y2] = pt(f2, r)
  return `M${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`
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
  // The ONE labelled tick: the school's own target band when it has one (the
  // ladder it chose), else the lowest band. The rest carry a tooltip only.
  const targetMin = readiness.target?.index ?? floor?.min ?? null
  const labelled = bands.find((b) => b.min === targetMin) ?? floor
  const expected = readiness.inFlight?.expectedIndexIfDelivered ?? null
  const projFrac = expected != null ? f(expected) : null
  const [dx, dy] = pt(frac)
  const [sx] = pt(0)
  const [ex] = pt(1)
  // The accreditor's published reference point (e.g. Cognia's 296 network
  // average) — a FAINT dashed tick, display only: it never enters the sweep,
  // the dot or any readiness math. Its label lives in the tooltip.
  const indexRef = fw.indexReference ?? null
  const refFrac = indexRef && typeof indexRef.value === 'number' ? f(indexRef.value) : null
  const label = `Projected index ${idx} of ${fw.indexMax} — ${readiness.band ?? 'below accreditation threshold'}`

  return (
    <figure className="acc-dial" data-testid="band-readiness-dial">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {/* the dome's dark glass + the full scale */}
        <path d={`${arc(0, 1, R - 13)} Z`} fill="rgba(0,0,0,.24)" />
        <path d={arc(0, 1)} fill="none" stroke="rgba(255,255,255,.18)" strokeWidth={20} />
        {/* each status band, brighter with the tier */}
        {bands.map((b, i) => {
          const next = bands[i + 1]?.min ?? fw.indexMax
          const op = 0.42 + (0.5 * (i + 1)) / Math.max(bands.length, 1)
          return <path key={b.min} d={arc(f(b.min), f(next))} fill="none" stroke={`rgba(255,255,255,${op.toFixed(2)})`} strokeWidth={20} />
        })}
        {/* the reached distance */}
        <motion.path
          d={arc(0, 1)}
          fill="none"
          stroke="rgba(255,255,255,.95)"
          strokeWidth={5}
          strokeLinecap="round"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: frac }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 55, damping: 18 }}
        />
        {projFrac != null ? (
          <g data-testid="band-dial-projection">
            <title>PROJECTION — {expected} if the in-flight work is delivered. Not your current index.</title>
            <path d={arc(0, projFrac, R + 16)} fill="none" stroke="rgba(255,255,255,.6)" strokeWidth={2} strokeDasharray="4 6" />
          </g>
        ) : null}
        {refFrac != null ? (
          <g data-testid="index-reference-tick">
            {(() => {
              const [x1, y1] = pt(refFrac, R - 14)
              const [x2, y2] = pt(refFrac, R + 12)
              return (
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,.7)" strokeWidth={1.5} strokeDasharray="2 3" />
              )
            })()}
            <title>{indexRef.label ?? `Reference · ${indexRef.value}`}</title>
            <desc>{indexRef.value}</desc>
          </g>
        ) : null}
        {bands.map((b) => {
          const [x1, y1] = pt(f(b.min), R - 16)
          const [x2, y2] = pt(f(b.min), R + 16)
          const [tx, ty] = pt(f(b.min), R + 30)
          return (
            <g key={`t${b.min}`}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeWidth={2.5} />
              <title>
                {b.label} · {b.min}+
              </title>
              {labelled && b.min === labelled.min ? (
                <text x={tx} y={ty} textAnchor={f(b.min) > 0.62 ? 'end' : f(b.min) < 0.38 ? 'start' : 'middle'} fontSize={12} fontWeight={700} fill="#fff">
                  {b.label} · {b.min}
                </text>
              ) : null}
            </g>
          )
        })}
        <circle cx={dx} cy={dy} r={10} fill={below ? '#e11d48' : '#10b981'} stroke="#fff" strokeWidth={3} />
        <text x={CX} y={CY - 40} textAnchor="middle" fontSize={50} fontWeight={800} fill="#fff" className="acc-dial-num">
          {idx}
        </text>
        <text x={CX} y={CY - 16} textAnchor="middle" fontSize={12.5} fontWeight={600} fill="rgba(255,255,255,.85)">
          projected score
        </text>
        <text x={sx} y={CY + 26} textAnchor="middle" fontSize={12} fill="rgba(255,255,255,.75)">
          {fw.indexMin}
        </text>
        <text x={ex} y={CY + 26} textAnchor="middle" fontSize={12} fill="rgba(255,255,255,.75)">
          {fw.indexMax}
        </text>
      </svg>
      <figcaption className="sr-only">
        {label}
        {floor ? `. ${floor.label} starts at ${floor.min}.` : ''}
      </figcaption>
    </figure>
  )
}
