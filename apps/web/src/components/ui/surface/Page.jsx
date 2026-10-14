import { Children, isValidElement } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

// Page — the document shell (Premium UI §2.4): `max-w-page mx-auto px-8` via
// `.pg`, and the ONE page-in motion: direct children rise 8px→0 over 320ms,
// 40ms apart, once. Under prefers-reduced-motion the page renders static
// (no wrappers animate; the DOM is identical).
export const PAGE_EASE = [0.22, 1, 0.36, 1]

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } },
}
const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: PAGE_EASE } },
}

export default function Page({ children, className = '', stagger = true, as = 'main', ...rest }) {
  const reduce = useReducedMotion()
  const cls = `pg${className ? ` ${className}` : ''}`
  const Tag = as

  if (reduce || !stagger) {
    return (
      <Tag className={cls} data-motion="static" {...rest}>
        {children}
      </Tag>
    )
  }

  const MotionTag = motion[as] ?? motion.main
  return (
    <MotionTag className={cls} data-motion="stagger" initial="hidden" animate="show" variants={container} {...rest}>
      {Children.map(children, (child, i) =>
        child == null || child === false ? null : (
          <motion.div key={isValidElement(child) && child.key != null ? child.key : i} variants={item} className="pg-item">
            {child}
          </motion.div>
        ),
      )}
    </MotionTag>
  )
}
