// ─────────────────────────────────────────────────────────────────────────────
// BriefingBand — the slim HOME v2 band above the tile map. Renders entirely from
// the briefing payload HomeTiles already holds (zero new data paths):
//   greeting · "N things need a decision · M critical" · per-module chips that
//   scroll to their tile · ▶ Play (onOpenBrief('narrate') — opens the
//   BriefingModal popup, which dispatches 'penny:narrate' once the brief mounts)
//   · "Open the briefing" (onOpenBrief('open') — same popup, no narration).
// The brief is no longer mounted at the bottom of the page. Lens verb mirrors
// the v1 command center (LENS_VERB).
// Empty school (no saved period): the band carries the onboarding line + the
// "Go to the Data hub →" CTA instead of counts/chips (tiles still render).
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Sparkles, Play, ArrowRight, Database, Layers, School } from 'lucide-react'
import { HOME_TILES, tileLabel, LENS_VERB, greeting } from './tileRegistry.jsx'

// ── BriefingBackdrop — the living decorative layer behind the briefing hero. ──
// Gives the band a "design in the background" instead of a flat gradient: a faint
// dot-grid texture, a top hairline, drifting glow orbs and a slow light-sweep.
// Accents adapt to `hue` (the school's identity colour, frosted-glass path) or
// fall back to gold on single-school navy. Purely decorative (aria-hidden) and
// motion-safe: reduced motion drops the drift + sweep to static orbs.
function BriefingBackdrop({ hue = null }) {
  const reduce = useReducedMotion()
  const orbA = hue ? `color-mix(in srgb, ${hue} 55%, transparent)` : 'rgba(214,178,92,0.20)'
  const orbB = hue ? `color-mix(in srgb, ${hue} 34%, transparent)` : 'rgba(120,142,205,0.22)'
  const orbC = hue ? `color-mix(in srgb, ${hue} 24%, transparent)` : 'rgba(214,178,92,0.12)'
  const hair = hue ? hue : 'rgba(214,178,92,0.5)'

  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
      {/* Faint dot-grid texture — the quiet "design" behind the words. */}
      <span
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.9) 1px, transparent 0)',
          backgroundSize: '22px 22px',
          maskImage: 'radial-gradient(120% 120% at 80% 0%, #000 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(120% 120% at 80% 0%, #000 30%, transparent 75%)',
        }}
      />
      {/* Top hairline. */}
      <span
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${hair}, transparent)` }}
      />

      {reduce ? (
        <>
          <span className="absolute -right-16 -top-20 h-56 w-56 rounded-full blur-3xl" style={{ background: orbA }} />
          <span className="absolute -bottom-24 -left-12 h-52 w-52 rounded-full blur-3xl" style={{ background: orbB }} />
        </>
      ) : (
        <>
          <motion.span
            className="absolute -right-16 -top-20 h-56 w-56 rounded-full blur-3xl"
            style={{ background: orbA }}
            animate={{ x: [0, -26, 8, 0], y: [0, 20, -12, 0], scale: [1, 1.12, 0.95, 1], opacity: [0.7, 1, 0.75, 0.7] }}
            transition={{ duration: 17, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.span
            className="absolute -bottom-24 -left-12 h-52 w-52 rounded-full blur-3xl"
            style={{ background: orbB }}
            animate={{ x: [0, 30, -10, 0], y: [0, -16, 10, 0], scale: [1, 1.1, 0.96, 1], opacity: [0.6, 0.9, 0.65, 0.6] }}
            transition={{ duration: 21, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.span
            className="absolute left-1/2 top-1/3 h-40 w-40 rounded-full blur-3xl"
            style={{ background: orbC }}
            animate={{ x: [0, 54, -38, 0], y: [0, -26, 24, 0], opacity: [0.4, 0.7, 0.45, 0.4] }}
            transition={{ duration: 25, repeat: Infinity, ease: 'easeInOut' }}
          />
          {/* Slow diagonal light-sweep for a touch of motion. */}
          <motion.span
            className="absolute inset-y-[-30%] -left-1/3 w-1/3 -skew-x-12"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)' }}
            animate={{ x: ['0%', '440%'] }}
            transition={{ duration: 7, repeat: Infinity, repeatDelay: 5, ease: 'easeInOut' }}
          />
        </>
      )}
    </span>
  )
}

export default function BriefingBand({
  schoolName,
  summary,
  badges = {},
  lens,
  hasPeriod,
  onOpenBrief,
  // Org scope only: renders a third band action that opens the consolidated
  // organization-view popup (KPIs / schools / triage). Omitted on school scope.
  onOpenOrgView = null,
  // School scope (from a multi-school org): `hue` is that school's identity
  // colour (same as its org tile) and `schoolTitle` its name — the band renders
  // as a FROSTED-GLASS panel tinted in the school's colour with the name shown.
  hue = null,
  schoolTitle = null,
}) {
  const reduce = useReducedMotion()
  const total = summary?.total ?? 0
  const critical = summary?.critical ?? 0
  const verb = LENS_VERB[lens] ?? 'need attention'

  // Frosted-glass tint from the school hue: a translucent dark-navy glass carrying
  // the hue, so white text stays readable and the ground shows faintly through.
  // Mix the hue against a NEUTRAL dark (not navy) so warm hues stay warm — mixing
  // against a blue base cancels opponent colours and turns amber/coral muddy.
  const glass = hue
    ? (pct) => `color-mix(in srgb, ${hue} ${pct}%, rgba(15, 17, 24, 0.9))`
    : null
  const sectionStyle = glass
    ? { background: `linear-gradient(135deg, ${glass(55)} 0%, ${glass(28)} 55%, ${glass(15)} 100%)` }
    : undefined

  // Registry-ordered chips for every module tile with open attention items.
  const chips = HOME_TILES.filter((t) => (badges[t.key]?.count ?? 0) > 0).map((t) => ({
    key: t.key,
    navId: t.navId,
    hue: t.hue,
    label: tileLabel(t.key),
    ...badges[t.key],
  }))

  return (
    <motion.section
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      aria-label="Daily briefing summary"
      style={sectionStyle}
      className={`relative overflow-hidden rounded-2xl p-5 shadow-navy-glow sm:p-6 ${
        glass ? 'border border-white/15 backdrop-blur-xl' : 'bg-navy-gradient'
      }`}
    >
      {/* Living decorative layer: dot-grid texture + hairline + drifting orbs +
          slow sweep. Hue-tinted on the frosted-glass path, gold on navy. */}
      <BriefingBackdrop hue={glass ? hue : null} />

      <div className="relative flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 font-sans text-[12px] font-bold uppercase tracking-[0.18em] text-gold/80">
            <Sparkles size={13} className="text-gold" /> Daily briefing
          </span>
          {schoolTitle && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[12.5px] font-semibold text-white">
              <School size={13} className="text-white/70" />
              {schoolTitle}
            </span>
          )}
        </div>

        {hasPeriod ? (
          <>
            <div>
              <h1 className="font-serif text-2xl font-semibold leading-tight text-white sm:text-[28px]">
                {greeting()} —{' '}
                {total === 0 ? (
                  'you’re all caught up.'
                ) : (
                  <>
                    <span className="gold-text">
                      {total} thing{total === 1 ? '' : 's'}
                    </span>{' '}
                    {verb}.
                  </>
                )}
              </h1>
              <p className="mt-1 text-[15px] leading-relaxed text-white/70">
                {total === 0 ? (
                  schoolTitle ? (
                    <>Nothing needs a decision right now.</>
                  ) : (
                    <>Nothing needs a decision across {schoolName || 'your school'} right now.</>
                  )
                ) : (
                  <>
                    {!schoolTitle && <>Across {schoolName || 'your school'}</>}
                    {critical > 0 && (
                      <>
                        {schoolTitle ? '' : ' · '}
                        <span className="font-semibold text-red-300">{critical} critical</span>
                        {schoolTitle ? ' · ' : '. '}
                      </>
                    )}
                    {critical > 0 ? '' : schoolTitle ? '' : '. '}
                    The tiles below show where.
                  </>
                )}
              </p>
            </div>

            {chips.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {chips.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => onOpenBrief?.('open')}
                    aria-label={`${c.label}: ${c.count} need${c.count === 1 ? 's' : ''} attention — open the briefing`}
                    className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                      c.critical
                        ? 'border-red-400/40 bg-red-500/10 text-red-200 hover:border-red-400/70'
                        : 'border-white/15 bg-white/[0.06] text-white/85 hover:border-white/40 hover:text-white'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 rounded-full"
                      style={{ background: c.hue }}
                    />
                    {c.label}
                    <span
                      className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[12px] font-bold tabular-nums ${
                        c.critical ? 'bg-red-500/25 text-red-100' : 'bg-white/10 text-white/80'
                      }`}
                    >
                      {c.count}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              {/* Penny's own action (she narrates the brief) — penny tokens, so it stays
                  GOLD under ui.v2 ("gold = Penny only"); generic CTAs around it go blue. */}
              <button
                type="button"
                onClick={() => onOpenBrief?.('narrate')}
                className="inline-flex items-center gap-1.5 rounded-full bg-penny-gradient px-4 py-2 text-[13px] font-semibold text-navy shadow-penny-glow transition-transform hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-penny/60 motion-reduce:hover:translate-y-0"
              >
                <Play size={13} /> Play
              </button>
              <button
                type="button"
                onClick={() => onOpenBrief?.('open')}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/25 px-4 py-2 text-[13px] font-semibold text-white/80 transition-colors hover:border-gold/50 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
              >
                Open the briefing <ArrowRight size={13} />
              </button>
              {onOpenOrgView ? (
                <button
                  type="button"
                  onClick={onOpenOrgView}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/25 px-4 py-2 text-[13px] font-semibold text-white/80 transition-colors hover:border-gold/50 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
                >
                  <Layers size={13} /> Organization view <ArrowRight size={13} />
                </button>
              ) : null}
            </div>
          </>
        ) : (
          // ── Empty / onboarding: no saved period yet ─────────────────────────
          <>
            <div>
              <h1 className="font-serif text-2xl font-semibold leading-tight text-white sm:text-[28px]">
                {greeting()} — let&rsquo;s get your first numbers on the board.
              </h1>
              <p className="mt-1 max-w-xl text-[15px] leading-relaxed text-white/70">
                Add a trial balance in the Data hub and we&rsquo;ll turn it into your four
                financial statements — then every tile below lights up with live status.
              </p>
            </div>
            <div>
              <Link
                to="/data"
                className="inline-flex items-center gap-2 rounded-full bg-gold-gradient px-4 py-2 text-[13px] font-semibold text-navy shadow-glow transition-transform hover:-translate-y-px motion-reduce:hover:translate-y-0"
              >
                <Database size={14} /> Go to the Data hub <ArrowRight size={14} />
              </Link>
            </div>
          </>
        )}
      </div>
    </motion.section>
  )
}
