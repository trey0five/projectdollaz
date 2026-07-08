// SparkChart — a purpose-built static inline-SVG spark-area card for Act III.
// Navy line over a gold area fill; the line draws in via pathLength once the card
// enters view. Deliberately NOT recharts/ChartRenderer — keeps the landing bundle
// clean. Reduced motion: fully drawn from first paint.
//
// Reliability: the trigger is a REF-BASED useInView (once, amount 0.3) rather than
// per-element whileInView + a negative viewport margin, which intermittently failed to
// fire on mobile (fast scroll / mobile-Safari IntersectionObserver races) and left the
// line stuck at pathLength 0 — i.e. an invisible graph. Driving every element off ONE
// boolean guarantees the line always draws once the card is on screen.
import { useRef } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import { SPARK_CAPTION } from './landingContent.js'

const LINE =
  'M4,74 C28,68 44,60 68,62 C92,64 108,46 132,48 C156,50 172,32 198,36 C224,40 240,22 254,18'
const AREA = `${LINE} L254,96 L4,96 Z`

export default function SparkChart() {
  const reduce = useReducedMotion()
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, amount: 0.3 })
  const show = reduce || inView
  return (
    <div ref={ref} className="card-vital p-6">
      <div className="relative z-[1]">
        <svg
          viewBox="0 0 260 100"
          className="h-auto w-full"
          role="img"
          aria-label="Line chart: cash on hand trending up versus last year"
        >
          <defs>
            <linearGradient id="landing-spark-gold" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#b89650" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#b89650" stopOpacity="0.03" />
            </linearGradient>
          </defs>
          <motion.path
            d={AREA}
            fill="url(#landing-spark-gold)"
            initial={false}
            animate={{ opacity: show ? 1 : 0 }}
            transition={{ duration: 0.6, delay: 0.55 }}
          />
          <motion.path
            d={LINE}
            fill="none"
            stroke="#1f3d72"
            strokeWidth="2.5"
            strokeLinecap="round"
            initial={false}
            animate={{ pathLength: show ? 1 : 0 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
          />
          <motion.circle
            cx="254"
            cy="18"
            r="3.5"
            fill="#b89650"
            initial={false}
            animate={{ opacity: show ? 1 : 0 }}
            transition={{ duration: 0.3, delay: 0.85 }}
          />
        </svg>
        <p className="mt-3 text-[13px] font-semibold text-muted">{SPARK_CAPTION}</p>
      </div>
    </div>
  )
}
