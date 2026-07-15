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
import { Sparkles, Play, ArrowRight, Database, Layers } from 'lucide-react'
import { HOME_TILES, tileLabel, LENS_VERB, greeting } from './tileRegistry.jsx'

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
}) {
  const reduce = useReducedMotion()
  const total = summary?.total ?? 0
  const critical = summary?.critical ?? 0
  const verb = LENS_VERB[lens] ?? 'need attention'

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
      className="relative overflow-hidden rounded-2xl bg-navy-gradient p-5 shadow-navy-glow sm:p-6"
    >
      {/* Quiet decorative glow — static, cheap, reduced-motion safe. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gold/10 blur-3xl"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(214,178,92,0.5), transparent)' }}
      />

      <div className="relative flex flex-col gap-4">
        <span className="inline-flex items-center gap-1.5 font-sans text-[12px] font-bold uppercase tracking-[0.18em] text-gold/80">
          <Sparkles size={13} className="text-gold" /> Daily briefing
        </span>

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
                  <>Nothing needs a decision across {schoolName || 'your school'} right now.</>
                ) : (
                  <>
                    Across {schoolName || 'your school'}
                    {critical > 0 && (
                      <>
                        {' '}
                        · <span className="font-semibold text-red-300">{critical} critical</span>
                      </>
                    )}
                    . The tiles below show where.
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
