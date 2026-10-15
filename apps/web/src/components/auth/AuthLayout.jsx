// Shared shell for the public auth pages — a DELIBERATE frosted-glass design over
// an aurora: the navy ground carries three colour fields that drift into place
// once (Premium UI §2.5) and echo the KYRO lotus (electric blue → gold → coral), and the card itself is a
// translucent blurred pane with a spectrum hairline across its top edge. The
// backdrop is exported so the onboarding wizard shares the exact same world.
import { motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import '../../styles/pending/c1-flows.css'

/** The navy aurora ground: three logo-coloured light fields + a ribbon. They
 *  drift INTO place once on arrival and rest (Premium UI §2.5: one-shot motion,
 *  never a loop); reduced motion renders them already at rest. */
export function AuroraBackdrop() {
  const reduce = useReducedMotion()
  const settle = (delay = 0) => ({ duration: 2.6, ease: [0.22, 1, 0.36, 1], delay })
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Electric-blue field — top left, the lotus's cool wing. */}
      <motion.div
        className="absolute -left-40 -top-44 h-[36rem] w-[36rem] rounded-full bg-[#2f6bff]/[0.17] blur-3xl"
        initial={reduce ? false : { x: -46, y: -28, opacity: 0 }}
        animate={{ x: 0, y: 0, opacity: 1 }}
        transition={settle(0)}
      />
      {/* Gold field — the brand's warm heart, low right. */}
      <motion.div
        className="absolute -bottom-48 -right-32 h-[34rem] w-[34rem] rounded-full bg-gold/[0.13] blur-3xl"
        initial={reduce ? false : { x: 38, y: 24, opacity: 0 }}
        animate={{ x: 0, y: 0, opacity: 1 }}
        transition={settle(0.2)}
      />
      {/* Coral ember — small, in the middle distance. */}
      <motion.div
        className="absolute right-[8%] top-[16%] h-72 w-72 rounded-full bg-[#ff8a5c]/[0.10] blur-3xl"
        initial={reduce ? false : { y: 36, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={settle(0.4)}
      />
      {/* A near-horizontal aurora ribbon behind the card — one slow pass into place. */}
      <motion.div
        className="absolute left-1/2 top-1/2 h-[30rem] w-[160vw] blur-2xl"
        style={{
          // Framer owns the transform: y/rotate ride along with the animated x.
          y: '-50%',
          rotate: -9,
          background:
            'linear-gradient(90deg, transparent 4%, rgba(47,107,255,0.10) 28%, rgba(214,178,92,0.10) 52%, rgba(255,138,92,0.07) 74%, transparent 96%)',
        }}
        initial={reduce ? { x: '-50%' } : { x: '-56%', opacity: 0 }}
        animate={{ x: '-50%', opacity: 0.9 }}
        transition={{ duration: 3.2, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  )
}

/** The KYRO lockup + tagline, glowing softly over the aurora. */
export function BrandLockup({ compact = false }) {
  return (
    <Link
      to="/"
      aria-label="KYRO — home"
      className="group relative flex flex-col items-center rounded-lg outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-gold/50"
    >
      <span
        aria-hidden
        className="absolute -inset-x-16 -top-6 bottom-0 -z-10 rounded-full opacity-60 blur-3xl"
        style={{
          background:
            'radial-gradient(50% 60% at 50% 40%, rgba(47,107,255,0.22), rgba(214,178,92,0.14) 55%, transparent 80%)',
        }}
      />
      <img
        src="/kyro-lockup.png"
        alt="KYRO"
        className={`${compact ? 'h-20 sm:h-24' : 'h-28 sm:h-36'} w-auto object-contain drop-shadow-[0_6px_28px_rgba(0,0,0,0.45)]`}
      />
      <span className="mt-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-gold-light/80 sm:text-[12px]">
        Knowledge Yielding Resource Optimizer
      </span>
    </Link>
  )
}

/** Frosted-glass pane: spectrum hairline + inner sheen + blurred translucency. */
export function GlassCard({ children, className = '' }) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-white/[0.14] bg-white/[0.07] shadow-[0_32px_90px_-30px_rgba(0,0,0,0.85)] backdrop-blur-2xl ${className}`}
    >
      {/* Logo-spectrum rule across the top edge (2px, the system's rule weight). */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{
          background:
            'linear-gradient(90deg, #2f6bff 0%, #7aa8ff 30%, #d6b25c 62%, #ff8a5c 100%)',
        }}
      />
      {/* Faint interior light falling from the top — the "glass" read. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 60% at 50% 0%, rgba(255,255,255,0.10), transparent 55%)',
        }}
      />
      <div className="relative">{children}</div>
    </div>
  )
}

export default function AuthLayout({ title, subtitle, children, footer, width = 460 }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-navy-deep bg-navy-radial px-4 py-6 sm:py-10">
      <AuroraBackdrop />

      <div className="relative mb-7">
        <BrandLockup />
      </div>

      <div className="relative w-full" style={{ maxWidth: width }}>
        {/* Ambient halo hugging the pane — blue into gold, static (no breathing loop). */}
        <div
          aria-hidden
          className="absolute -inset-4 rounded-2xl opacity-30 blur-2xl"
          style={{
            background:
              'linear-gradient(120deg, rgba(47,107,255,0.35), rgba(214,178,92,0.30) 55%, rgba(255,138,92,0.25))',
          }}
        />
        <motion.div
          initial={{ opacity: 0, y: 26, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        >
          <GlassCard className="w-full px-6 py-10 sm:px-14 sm:py-12">
            <h1 className="mb-2 font-serif text-[26px] font-semibold leading-[1.1] text-white sm:text-[30px]">
              {title}
            </h1>
            {subtitle && (
              <p className="mb-8 text-[16px] leading-relaxed text-white/60">{subtitle}</p>
            )}
            {!subtitle && <div className="mb-6" />}
            {children}
            {footer && <div className="mt-6 text-center text-[15px] text-white/60">{footer}</div>}
          </GlassCard>
        </motion.div>
      </div>
    </div>
  )
}
