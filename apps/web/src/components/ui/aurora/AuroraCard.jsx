import VerdictPill from './VerdictPill.jsx'

/**
 * AuroraCard — the white rounded card a CHART or TABLE sits in inside a
 * section (a 5px hue rule on top). Never put a card inside a card; never put
 * a list of links in one (that is a tile grid).
 *   title, subtitle   the card's own heading (short)
 *   verdict + verdictLabel   a pill top-right ("Ahead", "Behind")
 *   aside             extra node top-right
 *   big + bigTone     a one-line answer above the chart ("+$430,000 left over")
 *   tone              risk | watch | good → status-coloured top rule
 *   hue               hex override for the rule
 *   flush             no body padding (a DataTable edge to edge)
 *   flat              no top rule
 *   footer            buttons under the body
 */
export default function AuroraCard({
  title = null,
  subtitle = null,
  verdict = null,
  verdictLabel = null,
  aside = null,
  big = null,
  bigTone = null,
  tone = null,
  hue = null,
  flush = false,
  flat = false,
  footer = null,
  className = '',
  style,
  children,
  ...rest
}) {
  const cls = [
    'au-card',
    tone ? `au-card-${tone}` : null,
    flush ? 'au-card-flush' : null,
    flat ? 'au-card-flat' : null,
    className || null,
  ]
    .filter(Boolean)
    .join(' ')
  const head = title || subtitle || verdict || verdictLabel || aside
  return (
    <div className={cls} style={hue ? { '--th': hue, '--th2': hue, ...style } : style} {...rest}>
      {head ? (
        <div className="au-card-head">
          <div>
            {title ? <h3 className="au-card-title">{title}</h3> : null}
            {subtitle ? <p className="au-card-sub">{subtitle}</p> : null}
          </div>
          <VerdictPill verdict={verdict} label={verdictLabel} />
          {aside}
        </div>
      ) : null}
      {big != null ? <p className={`au-big${bigTone ? ` au-big-${bigTone}` : ''}`}>{big}</p> : null}
      {children}
      {footer ? <div className="au-card-foot">{footer}</div> : null}
    </div>
  )
}

/** Two cards side by side from 1100px (one column below). */
export function AuroraCols({ className = '', children }) {
  return <div className={`au-cols2${className ? ` ${className}` : ''}`}>{children}</div>
}
