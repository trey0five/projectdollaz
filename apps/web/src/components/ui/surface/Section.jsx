// Section — a label row (11px caps + hairline + aside) with 32px above; no
// border, no background. Content sits directly on the ground beneath it.
export default function Section({ label, aside, children, className = '', as = 'section', id, ...rest }) {
  const Tag = as
  return (
    <Tag className={`sec${className ? ` ${className}` : ''}`} id={id} {...rest}>
      {label || aside ? (
        <div className="sec-head">
          {label ? <h2 className="sec-label">{label}</h2> : null}
          <span className="sec-rule" aria-hidden="true" />
          {aside ? <div className="sec-aside">{aside}</div> : null}
        </div>
      ) : null}
      {children}
    </Tag>
  )
}
