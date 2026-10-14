// Pill — 20px, radius --r-ctl, ink text, hairline border. ONE shape for every
// meaning; colour lives only in the 2px mark of the `status` variant.
//   variant 'default' | 'status' (mark + text) | 'count' (tabular)
//   tone    'good' | 'watch' | 'risk' | 'neutral' | 'hue' (status only)
export default function Pill({ variant = 'default', tone = 'neutral', as = 'span', className = '', children, ...rest }) {
  const Tag = as
  const cls = ['pill', variant === 'status' ? `pill-status tone-${tone}` : null, variant === 'count' ? 'pill-count' : null, className || null]
    .filter(Boolean)
    .join(' ')
  return (
    <Tag className={cls} {...rest}>
      {variant === 'status' ? <i className="pill-mark" aria-hidden="true" /> : null}
      {children}
    </Tag>
  )
}
