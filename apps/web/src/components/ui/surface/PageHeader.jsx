import { motion, useReducedMotion } from 'framer-motion'
import { PAGE_EASE } from './Page.jsx'

// PageHeader — eyebrow / title (EB Garamond 30/36) / meta / actions on a
// hairline, with a 2px top rule in the module hue that DRAWS once (scaleX 0→1,
// 480ms). `hue` is an RGB channel triple ("37 99 235") and sets --c-module on
// the header only; omit it inside a ModuleAccent, which already provides one.
export default function PageHeader({ eyebrow, title, meta, actions, hue, className = '', children }) {
  const reduce = useReducedMotion()
  const style = hue ? { '--c-module': hue } : undefined
  return (
    <header className={`pg-head${className ? ` ${className}` : ''}`} style={style}>
      {reduce ? (
        <span className="pg-head-rule" aria-hidden="true" />
      ) : (
        <motion.span
          className="pg-head-rule"
          aria-hidden="true"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.48, ease: PAGE_EASE }}
        />
      )}
      <div className="pg-head-main">
        {eyebrow ? <p className="pg-eyebrow">{eyebrow}</p> : null}
        <h1 className="pg-title">{title}</h1>
        {meta ? <p className="pg-meta">{meta}</p> : null}
        {children}
      </div>
      {actions ? <div className="pg-actions">{actions}</div> : null}
    </header>
  )
}
