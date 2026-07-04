// Reveal — the shared whileInView primitive for the landing page. Opacity 0,
// y 28 → 1, 0; fires once with a -80px viewport margin; transform/opacity only.
// Under reduced motion it renders statically (initial={false}, no whileInView).
import { motion, useReducedMotion } from 'framer-motion'

export const EASE = [0.2, 0.8, 0.2, 1]

export default function Reveal({ children, className, delay = 0, y = 28 }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  )
}
