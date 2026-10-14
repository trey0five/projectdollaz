import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

// Tile — the ONE card family that stays (Home modules, wizard choose): radius
// --r-panel, hairline, a 2px bottom rule in the module hue, and on hover the
// hue flood rises once (CSS transition) while the arrow slides.
//   to    → react-router Link · href → <a> · onClick → <button> · else <div>
//   hue   RGB channel triple ("37 99 235") → sets --c-module on the tile.
export default function Tile({ to, href, onClick, icon, title, body, foot, hue, arrow = true, className = '', children, ...rest }) {
  const style = hue ? { '--c-module': hue, ...(rest.style || {}) } : rest.style
  const cls = `tile${className ? ` ${className}` : ''}`
  const inner = (
    <>
      {icon || title ? (
        <div className="tile-head">
          <div className="flex min-w-0 items-center gap-3">
            {icon ? <span className="tile-icon">{icon}</span> : null}
            {title ? <h3 className="tile-title">{title}</h3> : null}
          </div>
        </div>
      ) : null}
      {body ? <p className="tile-body">{body}</p> : null}
      {children}
      {foot || arrow ? (
        <div className="tile-foot">
          <div className="min-w-0">{foot}</div>
          {arrow ? (
            <span className="tile-arrow" aria-hidden="true">
              <ArrowRight size={16} strokeWidth={2} />
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  )
  const props = { ...rest, className: cls, style }
  if (to) return <Link to={to} {...props}>{inner}</Link>
  if (href) return <a href={href} {...props}>{inner}</a>
  if (onClick) return <button type="button" onClick={onClick} {...props}>{inner}</button>
  return <div {...props}>{inner}</div>
}
