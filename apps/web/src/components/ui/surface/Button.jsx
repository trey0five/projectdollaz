import { Link } from 'react-router-dom'

// Button — 36px, radius 6, 13px/600, flat. No bevel, no sheen, no uppercase.
//   variant 'primary' (#2563EB with a 1px darker ring) | 'secondary' | 'quiet'
//   size    'md' (36px) | 'sm' (28px)
//   to → react-router Link · href → <a> · else <button type="button">
const VARIANTS = { primary: 'btn-primary', secondary: 'btn-secondary', quiet: 'btn-quiet' }

export default function Button({ variant = 'secondary', size = 'md', to, href, type = 'button', icon, className = '', children, ...rest }) {
  const cls = ['btn', VARIANTS[variant] ?? VARIANTS.secondary, size === 'sm' ? 'btn-sm' : null, className || null].filter(Boolean).join(' ')
  const inner = (
    <>
      {icon ? <span className="inline-flex" aria-hidden="true">{icon}</span> : null}
      {children}
    </>
  )
  if (to) return <Link to={to} className={cls} {...rest}>{inner}</Link>
  if (href) return <a href={href} className={cls} {...rest}>{inner}</a>
  return (
    <button type={type} className={cls} {...rest}>
      {inner}
    </button>
  )
}
