import { Link } from 'react-router-dom'
import VerdictPill from './VerdictPill.jsx'

/**
 * AuroraKpi — one frosted-glass KPI card on the band.
 *   icon        lucide component (drawn in the small glass well by the label)
 *   label       what it is, in plain words ("Days of cash")
 *   value       the figure, already formatted ("43", "4.0%", "−$4.57M") or a
 *               node; null/'' renders an em dash (never a fake zero)
 *   unit        small trailing unit ("days", "months")
 *   caption     ONE short line ("On Jun 30, 2026", "Same as last year")
 *   verdict     good | watch | risk (aliases ok) → Good / Watch / At risk pill;
 *               anything else → no pill unless `verdictLabel` is given
 *   verdictLabel override the pill word ("Ahead", "Behind")
 *   textValue   the value is words, not a figure → it may wrap (smaller size)
 *   to          makes the whole card a link
 */
export default function AuroraKpi({
  icon: Icon = null,
  label,
  value,
  unit = null,
  caption = null,
  verdict = null,
  verdictLabel = null,
  textValue = false,
  to = null,
  className = '',
  ...rest
}) {
  const shown = value == null || value === '' ? '—' : value
  const cls = `au-kpi${className ? ` ${className}` : ''}`
  const body = (
    <>
      <p className="au-kpi-lab">
        {Icon ? (
          <i className="au-kpi-ic" aria-hidden="true">
            <Icon size={15} />
          </i>
        ) : null}
        <span className="min-w-0">{label}</span>
      </p>
      <p className={`au-kpi-val${textValue ? ' au-kpi-val-text' : ''}`}>
        {shown}
        {unit && shown !== '—' ? <small className="au-kpi-unit">{unit}</small> : null}
      </p>
      {caption ? <p className="au-kpi-cap">{caption}</p> : null}
      <VerdictPill verdict={verdict} label={verdictLabel} reserve />
    </>
  )
  if (to) {
    return (
      <Link to={to} className={cls} {...rest}>
        {body}
      </Link>
    )
  }
  return (
    <div className={cls} {...rest}>
      {body}
    </div>
  )
}

/**
 * AuroraKpiGrid — the row of glass cards (2-up on phone/tablet, `cols`-up from
 * 1280px; default = number of cards, max 4). Pass AuroraKpi children.
 */
export function AuroraKpiGrid({ cols = null, className = '', children }) {
  const n = Array.isArray(children) ? children.filter(Boolean).length : 1
  const c = cols ?? Math.min(4, Math.max(1, n))
  return (
    <div className={`au-kpis${className ? ` ${className}` : ''}`} style={{ '--au-kpi-cols': String(c) }} role="list">
      {children}
    </div>
  )
}

/** The band shows at most this many glass cards; the rest become chips. */
export const KPI_CARD_MAX = 4

/**
 * AuroraKpiChips — the band's compact "more figures" row: one small glass chip
 * per extra KPI (label · value + unit · verdict pill when banded). Same props
 * as AuroraKpi (icon/caption are dropped; `to` makes the chip a link). Renders
 * nothing for an empty list.
 */
export function AuroraKpiChips({ items = [], className = '' }) {
  if (!items?.length) return null
  return (
    <ul className={`au-kchips${className ? ` ${className}` : ''}`} aria-label="More figures">
      {items.map(({ key, label, value, unit = null, verdict = null, verdictLabel = null, to = null }, i) => {
        const shown = value == null || value === '' ? '—' : value
        const body = (
          <>
            <span className="au-kchip-lab">{label}</span>
            <b className="au-kchip-val">
              {shown}
              {unit && shown !== '—' ? <small>{unit}</small> : null}
            </b>
            <VerdictPill verdict={verdict} label={verdictLabel} className="au-pill-sm" />
          </>
        )
        return (
          <li key={key ?? (typeof label === 'string' ? label : i)} className="au-kchip">
            {to ? (
              <Link to={to} className="au-kchip-in">
                {body}
              </Link>
            ) : (
              <span className="au-kchip-in">{body}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
