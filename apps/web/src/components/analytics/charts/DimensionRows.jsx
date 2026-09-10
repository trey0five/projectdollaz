import { CHROME } from './palette.js'
import { ensureChartStyles } from './styles.js'
import ColumnChart from './ColumnChart.jsx'
import Legend from './Legend.jsx'

// ─────────────────────────────────────────────────────────────────────────────
// DimensionRows — five SMALL-MULTIPLE COLUMN PANELS, one per health dimension:
// the dataviz-preferred replacement for a comparison radar. Every panel draws
// one column per school on the SAME 0–100 band (an explicit shared domain, so
// a tall column means the same thing in every panel), school order is roster
// order and constant across panels, and colour follows the entity. The cap
// label is the HEALTH SCORE the column height actually encodes (a raw "87.1%"
// over a 0–100 column misled); the raw figure rides the tooltip, and one
// caption states the rule. One legend (identity key) sits at the card top. Every column is a tooltip +
// keyboard focus target with an aria-label; reduced-motion renders static.
//
// (The name is kept so the call site and its anchor are unchanged; the rows
// became columns when the owner asked for every horizontal bar to stand up.)
//
// props: dims=[{key,short,cells:[{id,name,color,raw,formatted,score}]}]  (score 0–100)
// ─────────────────────────────────────────────────────────────────────────────
export default function DimensionRows({ dims = [] }) {
  ensureChartStyles()
  const roster = dims[0]?.cells ?? []

  return (
    <div>
      <Legend items={roster.map((c) => ({ id: c.id, label: c.name, color: c.color }))} />
      <p style={{ margin: '0 0 8px', fontSize: 11.5, color: CHROME.dimText }}>
        Column height and cap label = health score, 0–100 against the metric&rsquo;s healthy range; the actual figure is in
        the tooltip.
      </p>
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        {dims.map((dim) => {
          const rows = dim.cells.map((c) => ({
            id: c.id,
            label: c.name,
            color: c.color,
            value: c.score == null ? null : Math.max(0, Math.min(100, c.score)),
            formatted: c.score == null ? '—' : `${Math.round(c.score)}`,
            meta: [{ label: dim.short, value: c.formatted ?? '—' }],
          }))
          return (
            <section key={dim.key} aria-label={dim.short} className="min-w-0">
              <h5
                style={{
                  margin: '0 0 2px',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: CHROME.axis,
                }}
              >
                {dim.short}
              </h5>
              <ColumnChart
                rows={rows}
                domain={{ lo: 0, hi: 100 }}
                tickFormatter={(v) => `${Math.round(v)}`}
                formatter={(v) => (v == null ? '—' : `${Math.round(v)} / 100`)}
                showValues="all"
                height={120}
                minBand={40}
                legend={false}
                ariaLabel={`${dim.short}: health score by school, 0 to 100`}
              />
            </section>
          )
        })}
      </div>
    </div>
  )
}
