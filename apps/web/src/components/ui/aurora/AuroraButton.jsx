import { Link } from 'react-router-dom'
import { auroraVarsFromHue } from '../../module/moduleAnatomy.js'

// Shared link/button switch for the Aurora buttons (to → Link, href → <a>,
// else a real <button type="button">).
function Clickable({ to, href, className, children, ...rest }) {
  if (to) {
    return (
      <Link to={to} className={className} {...rest}>
        {children}
      </Link>
    )
  }
  if (href) {
    return (
      <a href={href} className={className} {...rest}>
        {children}
      </a>
    )
  }
  return (
    <button type="button" className={className} {...rest}>
      {children}
    </button>
  )
}

/**
 * AuroraButton — a button ON THE BAND. `primary` = the white button (one per
 * band: the page's main job); `ghost` = the glass outline buttons beside it.
 * (Existing surface <Button>s placed in AuroraHero's `actions` slot are restyled
 * to match automatically — primary → white, secondary/quiet → glass.)
 */
export function AuroraButton({ variant = 'ghost', icon = null, className = '', children, ...rest }) {
  const cls = ['au-btn', variant === 'primary' ? 'au-btn-primary' : null, className || null].filter(Boolean).join(' ')
  return (
    <Clickable className={cls} {...rest}>
      {icon}
      {children}
    </Clickable>
  )
}

/**
 * The custom properties a `hue` override puts on a light button: the hue, and
 * its readable deep fill (the same --au-deep the module band derives, so white
 * on the fill — and the fill as words on white — clears 4.5:1 for any hue).
 */
export function lightButtonHueVars(hue) {
  if (!hue) return null
  return { '--th': hue, '--lb-deep': auroraVarsFromHue(hue)['--au-deep'] }
}

/**
 * AuroraLightButton — a button on a LIGHT surface (section, card, tile foot).
 * `solid` = filled in the hue (deepened until white text clears 4.5:1);
 * `ghost` = white with a hue outline. `hue` (hex) overrides the inherited
 * module hue; `size="sm"` for tight feet.
 */
export function AuroraLightButton({ variant = 'solid', size = 'md', hue = null, icon = null, className = '', style, children, ...rest }) {
  const cls = [
    'au-lbtn',
    variant === 'ghost' ? 'au-lbtn-ghost' : null,
    size === 'sm' ? 'au-lbtn-sm' : null,
    className || null,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <Clickable className={cls} style={hue ? { ...lightButtonHueVars(hue), ...style } : style} {...rest}>
      {icon}
      {children}
    </Clickable>
  )
}

export default AuroraButton
