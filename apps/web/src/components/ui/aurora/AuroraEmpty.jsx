/**
 * AuroraEmpty — the designed empty state: one line (+ optional short sub) and
 * ONE button. Use it wherever a section has nothing to show yet, so an empty
 * screen still looks intentional.
 */
export default function AuroraEmpty({ icon: Icon = null, text, sub = null, action = null, hue = null, className = '', ...rest }) {
  return (
    <div className={`au-empty${className ? ` ${className}` : ''}`} style={hue ? { '--th': hue } : undefined} {...rest}>
      {Icon ? (
        <span className="au-well" aria-hidden="true" style={hue ? { '--th': hue } : undefined}>
          <Icon size={22} />
        </span>
      ) : null}
      <p className="au-empty-text">
        {text}
        {sub ? <span className="au-empty-sub">{sub}</span> : null}
      </p>
      {action}
    </div>
  )
}
