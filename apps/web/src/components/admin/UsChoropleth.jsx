// ─────────────────────────────────────────────────────────────────────────────
// UsChoropleth — a self-contained inline-SVG US state choropleth + city dots for
// the admin Geography view. NO chart library, NO external requests: it reuses the
// hand-coded US_STATE_PATHS art (keyed by 2-letter state code — the SAME code
// geoip returns and the SAME code the /admin/geo contract uses, so there is NO
// name↔abbr mapping anywhere) and the local Albers projection for the dots.
//
// Props (exactly the /admin/geo shape):
//   states: [{ region, count, cities:[{ city, count }] }]
//   cities: [{ city, region, lat, lon, count }]
//
// Colour: states shade light→dark blue by DISTINCT-user count (sqrt-scaled so a
// couple of dense states don't wash everyone else to white); no-data = slate.
// Dots: coral, radius ∝ √count. Hover anything → a cursor-following tooltip.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { US_STATE_PATHS, STATE_NAMES, MAP_VIEWBOX } from '../../data/usMapPaths.js'
import { projectCity } from './albersUsa.js'

// Choropleth ramp endpoints (raw hex — a continuous scale isn't a Tailwind token).
const RAMP_LO = [219, 234, 254] // #DBEAFE
const RAMP_HI = [30, 58, 138] //  #1E3A8A
const NO_DATA = 'rgb(226 232 240)' // slate-200

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t)
}
function rampColor(t) {
  const r = lerp(RAMP_LO[0], RAMP_HI[0], t)
  const g = lerp(RAMP_LO[1], RAMP_HI[1], t)
  const b = lerp(RAMP_LO[2], RAMP_HI[2], t)
  return `rgb(${r} ${g} ${b})`
}

export default function UsChoropleth({ states = [], cities = [] }) {
  const [tip, setTip] = useState(null) // { x, y, title, lines:[] }

  const byRegion = useMemo(() => new Map(states.map((s) => [s.region, s])), [states])
  const max = useMemo(() => Math.max(1, ...states.map((s) => s.count || 0)), [states])

  // Precompute dot geometry once per cities change (drop un-projectable rows).
  const dots = useMemo(
    () =>
      cities
        .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon))
        .map((c) => {
          const { x, y } = projectCity(c)
          return { ...c, x, y, r: 3 + Math.sqrt(Math.max(1, c.count)) * 1.5 }
        })
        .filter((d) => Number.isFinite(d.x) && Number.isFinite(d.y)),
    [cities],
  )

  function moveTip(e, title, lines) {
    setTip({ x: e.clientX, y: e.clientY, title, lines })
  }
  function clearTip() {
    setTip(null)
  }

  function stateTip(e, region) {
    const s = byRegion.get(region)
    const name = STATE_NAMES[region] || region
    if (!s) return moveTip(e, name, ['No sign-ins'])
    const top = (s.cities || [])
      .slice(0, 3)
      .map((c) => `${c.city} · ${c.count}`)
    moveTip(e, name, [`${s.count} user${s.count === 1 ? '' : 's'}`, ...top])
  }

  return (
    <div className="relative">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <svg
            viewBox={MAP_VIEWBOX}
            className="h-auto w-full"
            role="img"
            aria-label="US map of user sign-ins by state"
          >
            {/* State fills */}
            <g>
              {Object.entries(US_STATE_PATHS).map(([region, d]) => {
                const s = byRegion.get(region)
                const count = s?.count || 0
                const fill = count > 0 ? rampColor(Math.sqrt(count / max)) : NO_DATA
                return (
                  <path
                    key={region}
                    d={d}
                    fill={fill}
                    stroke="#fff"
                    strokeWidth={0.75}
                    className="cursor-default outline-none transition-[fill] duration-150 hover:opacity-90"
                    onMouseEnter={(e) => stateTip(e, region)}
                    onMouseMove={(e) => stateTip(e, region)}
                    onMouseLeave={clearTip}
                  >
                    <title>
                      {(STATE_NAMES[region] || region) + (count ? ` — ${count} users` : '')}
                    </title>
                  </path>
                )
              })}
            </g>
            {/* City dots */}
            <g>
              {dots.map((d, i) => (
                <circle
                  key={`${d.region}-${d.city}-${i}`}
                  cx={d.x}
                  cy={d.y}
                  r={d.r}
                  fill="#F97316"
                  fillOpacity={0.75}
                  stroke="#fff"
                  strokeWidth={0.75}
                  className="cursor-pointer"
                  onMouseEnter={(e) =>
                    moveTip(e, `${d.city}, ${d.region}`, [
                      `${d.count} user${d.count === 1 ? '' : 's'}`,
                    ])
                  }
                  onMouseMove={(e) =>
                    moveTip(e, `${d.city}, ${d.region}`, [
                      `${d.count} user${d.count === 1 ? '' : 's'}`,
                    ])
                  }
                  onMouseLeave={clearTip}
                >
                  <title>{`${d.city}, ${d.region} — ${d.count} users`}</title>
                </circle>
              ))}
            </g>
          </svg>
        </div>

        {/* Legend — vertical light→dark swatches + the coral-dot key. */}
        <div className="shrink-0 lg:w-40">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Users / state
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex flex-col overflow-hidden rounded-md border border-border">
              {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                <div key={t} className="h-4 w-8" style={{ background: rampColor(t) }} />
              ))}
            </div>
            <div className="flex h-20 flex-col justify-between text-[11px] tabular-nums text-muted">
              <span>{max}</span>
              <span>1</span>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="h-3 w-8 rounded-md" style={{ background: NO_DATA }} />
            <span className="text-[11px] text-muted">No data</span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-full border border-white"
              style={{ background: '#F97316', opacity: 0.75 }}
            />
            <span className="text-[11px] text-muted">City (size ∝ users)</span>
          </div>
        </div>
      </div>

      {/* Cursor-following tooltip (fixed so it clears the svg's overflow box). */}
      {tip && (
        <div
          className="pointer-events-none fixed z-50 max-w-[220px] rounded-lg bg-navy-deep px-3 py-2 text-xs text-white shadow-lift"
          style={{
            left: Math.min(tip.x + 14, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 232),
            top: Math.max(tip.y - 12, 8),
          }}
        >
          <div className="font-semibold">{tip.title}</div>
          {tip.lines.map((l, i) => (
            <div key={i} className="text-white/80">
              {l}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
