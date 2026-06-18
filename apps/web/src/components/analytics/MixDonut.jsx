import { useReducedMotion } from 'framer-motion'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from 'recharts'
import { DONUT_RAMP, PALETTE } from '../../lib/metricMeta.js'

/**
 * Themed donut for a mix breakdown (revenue / expense). Reads a metric's
 * `components` ({ key, label, value, share }). Slices use the gold->navy ramp;
 * an animated sweep on mount (gated by reduced-motion). Tiny/negative shares are
 * filtered so the donut stays readable.
 */
export default function MixDonut({ metric }) {
  const reduce = useReducedMotion()

  if (!metric || !metric.available || !metric.components) {
    return (
      <div className="flex h-48 items-center justify-center text-[13px] italic text-muted">
        Not enough data to chart.
      </div>
    )
  }

  const data = metric.components
    .filter((c) => c.value > 0)
    .map((c) => ({ name: c.label, value: c.value, share: c.share }))

  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-[13px] italic text-muted">
        No positive categories to chart.
      </div>
    )
  }

  const total = data.reduce((s, d) => s + d.value, 0)
  const totalLabel = `$${total.toLocaleString('en-US', { maximumFractionDigits: 0 })}`

  return (
    <div>
      <div className="relative h-52 w-full">
        {/* Center total — premium donut treatment, sits behind the slices. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            Total
          </span>
          <span className="gold-text font-serif text-lg font-semibold leading-tight">
            {totalLabel}
          </span>
        </div>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={84}
              paddingAngle={1.5}
              stroke={PALETTE.navyDeep}
              strokeWidth={1}
              isAnimationActive={!reduce}
              animationDuration={900}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={DONUT_RAMP[i % DONUT_RAMP.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name, entry) => [
                `$${Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 })} · ${(entry.payload.share * 100).toFixed(1)}%`,
                name,
              ]}
              contentStyle={{
                borderRadius: 12,
                border: `1px solid ${PALETTE.gold}`,
                fontSize: 12,
                fontFamily: 'Jost, system-ui, sans-serif',
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2 text-[12px]">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: DONUT_RAMP[i % DONUT_RAMP.length] }}
            />
            <span className="truncate text-ink">{d.name}</span>
            <span className="ml-auto shrink-0 font-semibold text-navy">
              {(d.share * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
