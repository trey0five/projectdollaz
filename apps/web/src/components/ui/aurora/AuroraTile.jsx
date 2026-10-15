// ─────────────────────────────────────────────────────────────────────────────
// AuroraTile — a colourful tile in the school-home tile language: icon well,
// soft tinted wash, short bold title + one short line, faint line-art of the
// icon in the corner, and (when it goes somewhere) a hover colour-flood + the
// round arrow. The WHOLE tile is the hit area via a stretched link on the
// title, so a tile may still carry its own real button in `foot`.
//
// Props
//   icon            lucide component (well + corner art)
//   title           short, bold ("Cash covers 43 days")
//   desc            ONE short line ("Plan for slow months.")
//                   Title and desc are clamped to two lines each; a clamped
//                   string keeps its full text in a `title` tooltip.
//   tip             tooltip for the desc when the desc shown is a cut of a
//                   longer text (the full "why" behind a first sentence)
//   kicker          tiny caps line above the title ("COG-1")
//   figure, unit    a big number instead of / above the desc ("+9.7" "pts")
//   verdict         good | watch | risk → pill in the foot (word + icon)
//   verdictLabel    override the pill word ("1 to fix", "FY 2026")
//   foot            extra controls in the foot (rendered above the hit area)
//   to | href | onClick   makes the tile live (flood + arrow)
//   tone            risk | watch | good | neutral → status-coloured tile
//   hue             hex override (default: the module hue)
//   row             well beside the words (warning lists)
//   arrow           show the round arrow (default: when live)
//   art             corner line-art (default true)
//   ariaLabel       accessible name for the hit link when the title is terse
// ─────────────────────────────────────────────────────────────────────────────
import { Link } from 'react-router-dom'
import { useReducedMotion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import VerdictPill from './VerdictPill.jsx'

export default function AuroraTile({
  icon: Icon = null,
  title,
  desc = null,
  kicker = null,
  figure = null,
  unit = null,
  verdict = null,
  verdictLabel = null,
  foot = null,
  to = null,
  href = null,
  onClick = null,
  tone = null,
  hue = null,
  row = false,
  arrow = undefined,
  art = true,
  ariaLabel = undefined,
  tip = undefined,
  headingLevel = 3,
  className = '',
  style,
  children,
  ...rest
}) {
  const reduce = useReducedMotion()
  const live = Boolean(to || href || onClick)
  const showArrow = arrow ?? live
  const cls = [
    'au-tile',
    live ? 'au-tile-live' : null,
    row ? 'au-tile-row' : null,
    tone ? `au-tile-${tone}` : null,
    reduce ? 'au-still' : null,
    className || null,
  ]
    .filter(Boolean)
    .join(' ')
  const H = `h${headingLevel}`

  let titleNode = title
  if (to) {
    titleNode = (
      <Link to={to} className="au-tile-hit" aria-label={ariaLabel}>
        {title}
      </Link>
    )
  } else if (href) {
    titleNode = (
      <a href={href} className="au-tile-hit" aria-label={ariaLabel}>
        {title}
      </a>
    )
  } else if (onClick) {
    titleNode = (
      <button type="button" className="au-tile-hit" onClick={onClick} aria-label={ariaLabel}>
        {title}
      </button>
    )
  }

  const hasFoot = verdict || verdictLabel || foot || showArrow
  const words = (
    <>
      {kicker ? <span className="au-tile-kick">{kicker}</span> : null}
      {title != null ? (
        <H className="au-tile-title" title={typeof title === 'string' ? title : undefined}>
          {titleNode}
        </H>
      ) : null}
      {figure != null ? (
        <p className="au-tile-fig">
          {figure}
          {unit ? <small>{unit}</small> : null}
        </p>
      ) : null}
      {desc ? (
        <p className="au-tile-desc" title={tip ?? (typeof desc === 'string' ? desc : undefined)}>
          {desc}
        </p>
      ) : null}
      {children ? <div className="au-tile-body">{children}</div> : null}
      {hasFoot ? (
        <div className="au-tile-foot">
          <VerdictPill verdict={verdict} label={verdictLabel} />
          {foot ? <div className="au-tile-lift">{foot}</div> : null}
          {showArrow ? (
            <span className="au-go" aria-hidden="true">
              <ArrowRight size={17} />
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  )

  return (
    <div className={cls} style={hue ? { '--th': hue, ...style } : style} {...rest}>
      {Icon ? (
        <span className="au-well" aria-hidden="true">
          <Icon size={row ? 22 : 24} />
        </span>
      ) : null}
      {row ? <div className="au-tile-main">{words}</div> : words}
      {Icon && art ? (
        <span className="au-art" aria-hidden="true">
          <Icon strokeWidth={1.4} />
        </span>
      ) : null}
    </div>
  )
}

/**
 * AuroraTileGrid — the tile grid. `cols` 2–6 is the count at full width
 * (1 col on phone, 2 on tablet, cols from 1280px; 5–6 step through 3).
 * `stack` forces one column (a narrow rail).
 */
export function AuroraTileGrid({ cols = 3, stack = false, className = '', children, ...rest }) {
  const c = Math.min(6, Math.max(2, cols))
  const cls = ['au-tiles', `au-t${c}`, stack ? 'au-tiles-stack' : null, className || null].filter(Boolean).join(' ')
  return (
    <div className={cls} {...rest}>
      {children}
    </div>
  )
}
