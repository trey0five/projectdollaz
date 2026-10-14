// Panel — the ONE raised surface: white, 1px hairline, --r-panel radius, the 1px
// contact shadow. Use it only for something you can act on (a form, a wizard
// step, an upload, a drawer). `tone="attention"` adds a 2px left mark.
export default function Panel({ tone, title, actions, footer, padded = true, as = 'div', className = '', children, ...rest }) {
  const Tag = as
  const cls = ['panel', tone === 'attention' ? 'panel-attention' : null, className || null].filter(Boolean).join(' ')
  return (
    <Tag className={cls} {...rest}>
      {title || actions ? (
        <div className="panel-head">
          {title ? <h3 className="panel-title">{title}</h3> : <span />}
          {actions ? <div className="pg-actions">{actions}</div> : null}
        </div>
      ) : null}
      {padded ? <div className="panel-body">{children}</div> : children}
      {footer ? <div className="panel-foot">{footer}</div> : null}
    </Tag>
  )
}
