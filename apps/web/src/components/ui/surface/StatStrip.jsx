import { Children } from 'react'

// StatStrip — a grid of Stats separated by vertical rules (no boxes). `cols`
// defaults to the number of children (4–6 is the intended range).
export default function StatStrip({ children, cols, className = '', ...rest }) {
  const count = cols ?? Children.toArray(children).filter(Boolean).length ?? 4
  return (
    <div className={`stats${className ? ` ${className}` : ''}`} style={{ '--stats-cols': String(count || 1) }} role="list" {...rest}>
      {children}
    </div>
  )
}
