import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

// Tile — the ONE card family that stays (Home modules, wizard choose): radius
// --r-panel, hairline, a 2px bottom rule in the module hue, and on hover the
// hue flood rises once (CSS transition) while the arrow slides.
//   to    → react-router Link · href → <a> · else <div>; `onClick` keeps the
//         tile a <div> (an h3/p inside a <button> is invalid flow content) and
//         covers it with a stretched `.tile-hit` <button> that takes the
//         aria-label / aria-haspopup.
//   hue   RGB channel triple ("37 99 235") OR a hex ("#2563EB", the form the
//         tile registry keeps) → sets --c-module on the tile.
//   locked → `.tile-locked` (dimmed ink, no flood; the hue stays in the rule).
//   A tile that must hold a real control in its foot passes NO `to` and renders
//   a stretched `<Link className="tile-hit">` as a child instead (see
//   home/ModuleTile.jsx); the foot control wears `.tile-lift`.
export const hueTriple = (hue) => {
  if (!hue) return undefined
  if (hue[0] !== '#') return hue
  const h = hue.slice(1)
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16)).join(' ')
}

export default function Tile({ to, href, onClick, icon, title, body, foot, hue, arrow = true, locked = false, className = '', children, ...rest }) {
  const triple = hueTriple(hue)
  const style = triple ? { '--c-module': triple, ...(rest.style || {}) } : rest.style
  const cls = ['tile', locked ? 'tile-locked' : null, className || null].filter(Boolean).join(' ')
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
  const { 'aria-label': ariaLabel, 'aria-haspopup': ariaHaspopup, ...others } = rest
  const props = { ...others, className: cls, style }
  if (to) return <Link to={to} aria-label={ariaLabel} {...props}>{inner}</Link>
  if (href) return <a href={href} aria-label={ariaLabel} {...props}>{inner}</a>
  if (onClick) {
    return (
      <div {...props}>
        {inner}
        <button type="button" className="tile-hit" onClick={onClick} aria-label={ariaLabel} aria-haspopup={ariaHaspopup} />
      </div>
    )
  }
  return <div aria-label={ariaLabel} {...props}>{inner}</div>
}
