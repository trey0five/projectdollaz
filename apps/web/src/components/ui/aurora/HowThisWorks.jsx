import { ChevronRight, Info } from 'lucide-react'

/**
 * HowThisWorks — where explanations, methodology and disclaimers go so the
 * page itself stays short. A native <details> (keyboard + screen-reader ready,
 * closed by default). `inline` drops the top rule (inside a card/section).
 */
export default function HowThisWorks({ title = 'How this works', defaultOpen = false, inline = false, className = '', children, ...rest }) {
  return (
    <details className={`au-how${inline ? ' au-how-inline' : ''}${className ? ` ${className}` : ''}`} open={defaultOpen || undefined} {...rest}>
      <summary>
        <Info size={15} aria-hidden="true" />
        {title}
        <ChevronRight size={15} className="au-how-chev" aria-hidden="true" />
      </summary>
      <div className="au-how-body">{children}</div>
    </details>
  )
}
