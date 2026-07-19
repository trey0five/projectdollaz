// Shared shell for the public auth pages: the navy ambient-orb background + the
// gold-haloed cream card, matching the original PIN-gate aesthetic.
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'

export default function AuthLayout({ title, subtitle, children, footer, width = 460 }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-navy-deep bg-navy-radial px-4 py-6 sm:py-10">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-gold/10 blur-3xl"
        animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full bg-gold-light/10 blur-3xl"
        animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
      />

      {/* Big centered brand lockup above the card — on navy the light wordmark reads. */}
      <Link
        to="/"
        aria-label="KYRO — home"
        className="relative mb-7 flex flex-col items-center rounded-lg outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-gold/50"
      >
        <img src="/kyro-lockup.png" alt="KYRO" className="h-28 w-auto object-contain drop-shadow-[0_6px_24px_rgba(0,0,0,0.35)] sm:h-36" />
        <span className="mt-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-gold-light/80 sm:text-[12px]">
          Knowledge Yielding Resource Optimizer
        </span>
      </Link>

      <div className="relative w-full" style={{ maxWidth: width }}>
        <motion.div
          aria-hidden
          className="absolute -inset-3 rounded-[28px] bg-gold-gradient opacity-25 blur-2xl"
          animate={{ opacity: [0.18, 0.32, 0.18] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full rounded-2xl border-t-4 border-gold bg-cream px-6 py-10 shadow-login sm:px-14 sm:py-12"
        >
          <h1 className="mb-2 font-serif text-[26px] font-semibold leading-[1.1] text-navy sm:text-[30px]">
            {title}
          </h1>
          {subtitle && <p className="mb-8 text-[16px] leading-relaxed text-muted">{subtitle}</p>}
          {!subtitle && <div className="mb-6" />}
          {children}
          {footer && <div className="mt-6 text-center text-[15px] text-muted">{footer}</div>}
        </motion.div>
      </div>
    </div>
  )
}
