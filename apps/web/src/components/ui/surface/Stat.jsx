import { Link } from 'react-router-dom'
import CountUp from '../../CountUp.jsx'
import AnimatedMetricValue from '../../analytics/AnimatedMetricValue.jsx'
import Pill from './Pill.jsx'

const TONES = new Set(['good', 'watch', 'risk', 'neutral', 'hue'])

// Stat — label (11px caps) / value (Garamond 30, tabular, count-up) / a 2px
// status mark / optional delta Pill. No box: StatStrip draws the vertical rules.
//   value   number → counts up once on mount (CountUp, or AnimatedMetricValue
//           when `format` is given: 'percent' | 'currency' | 'days' | …);
//           string/node → rendered as-is (already formatted, or "—").
//   status  'good' | 'watch' | 'risk' | 'neutral' | 'hue' → colour of the mark.
//   delta   string | { text, tone } → a Pill in the foot; `note` is plain text.
//   to      makes the Stat a react-router Link (`.stat-link`): the whole stat
//           navigates (HomeVitalsStrip → the metric drawer). Same DOM otherwise.
//   children render under the foot — a sparkline, never a second value.
export default function Stat({ label, value, format, unit, status, delta, note, to, className = '', children, ...rest }) {
  const tone = TONES.has(status) ? status : null
  const numeric = typeof value === 'number' && Number.isFinite(value)
  let rendered
  if (!numeric) rendered = value == null || value === '' ? '—' : value
  else if (format) rendered = <AnimatedMetricValue value={value} format={format} />
  else rendered = <CountUp value={value} />

  const deltaObj = delta == null ? null : typeof delta === 'string' ? { text: delta } : delta
  const cls = ['stat', to ? 'stat-link' : null, className || null].filter(Boolean).join(' ')
  const Tag = to ? Link : 'div'
  const tagProps = to ? { to } : {}

  return (
    <Tag className={cls} {...tagProps} {...rest}>
      <p className="stat-label">{label}</p>
      <span className="stat-value num">
        {rendered}
        {unit ? <span className="stat-unit">{unit}</span> : null}
      </span>
      {tone ? <span className={`stat-mark tone-${tone}`} aria-hidden="true" /> : null}
      {deltaObj || note ? (
        <div className="stat-foot">
          {deltaObj ? (
            <Pill variant={deltaObj.tone ? 'status' : 'default'} tone={deltaObj.tone}>
              {deltaObj.text}
            </Pill>
          ) : null}
          {note ? <span>{note}</span> : null}
        </div>
      ) : null}
      {children}
    </Tag>
  )
}
