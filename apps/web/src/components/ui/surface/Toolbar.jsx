// Toolbar — a 40px row of filters / segmented controls / search sitting on the
// ground with a hairline below. Replaces the "chip wall inside a card".
export default function Toolbar({ children, aside, className = '', ...rest }) {
  return (
    <div className={`toolbar${className ? ` ${className}` : ''}`} role="toolbar" {...rest}>
      {children}
      {aside ? <div className="toolbar-aside">{aside}</div> : null}
    </div>
  )
}
