// Shared shell for the public auth pages, redesigned as FROSTED GLASS over a
// living aurora: the navy ground carries three slow-drifting color fields that
// echo the KYRO lotus (electric blue → gold → coral), and the card itself is a
// translucent blurred pane with a spectrum hairline across its top edge. The
// backdrop is exported so the onboarding wizard shares the exact same world.
import { motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'

/** The navy aurora ground: three drifting logo-colored fields + a slow ribbon. */
export function AuroraBackdrop() {
  const reduce = useReducedMotion()
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Electric-blue field — top left, the lotus's cool wing. */}
      <motion.div
        className="absolute -left-40 -top-44 h-[36rem] w-[36rem] rounded-full bg-[#2f6bff]/[0.17] blur-3xl"
        animate={reduce ? undefined : { x: [0, 46, 0], y: [0, 28, 0], scale: [1, 1.12, 1] }}
        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* Gold field — the brand's warm heart, low right. */}
      <motion.div
        className="absolute -bottom-48 -right-32 h-[34rem] w-[34rem] rounded-full bg-gold/[0.13] blur-3xl"
        animate={reduce ? undefined : { x: [0, -38, 0], y: [0, -24, 0], scale: [1, 1.16, 1] }}
        transition={{ duration: 19, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
      />
      {/* Coral ember — small, drifting through the middle distance. */}
      <motion.div
        className="absolute right-[8%] top-[16%] h-72 w-72 rounded-full bg-[#ff8a5c]/[0.10] blur-3xl"
        animate={reduce ? undefined : { x: [0, -30, 0], y: [0, 36, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
      />
      {/* A near-horizontal aurora ribbon sweeping behind the card. */}
      <motion.div
        className="absolute left-1/2 top-1/2 h-[30rem] w-[160vw] -translate-x-1/2 -translate-y-1/2 -rotate-[9deg] blur-2xl"
        style={{
          background:
            'linear-gradient(90deg, transparent 4%, rgba(47,107,255,0.10) 28%, rgba(214,178,92,0.10) 52%, rgba(255,138,92,0.07) 74%, transparent 96%)',
        }}
        animate={reduce ? undefined : { x: ['-56%', '-44%', '-56%'], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
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
      className={`relative overflow-hidden rounded-[26px] border border-white/[0.14] bg-white/[0.07] shadow-[0_32px_90px_-30px_rgba(0,0,0,0.85)] backdrop-blur-2xl ${className}`}
    >
      {/* Logo-spectrum hairline across the top edge. */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px]"
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
        {/* Ambient halo hugging the pane — blue into gold, breathing slowly. */}
        <motion.div
          aria-hidden
          className="absolute -inset-4 rounded-[34px] opacity-30 blur-2xl"
          style={{
            background:
              'linear-gradient(120deg, rgba(47,107,255,0.35), rgba(214,178,92,0.30) 55%, rgba(255,138,92,0.25))',
          }}
          animate={{ opacity: [0.22, 0.38, 0.22] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
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
