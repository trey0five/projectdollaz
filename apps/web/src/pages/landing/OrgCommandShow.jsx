// ─────────────────────────────────────────────────────────────────────────────
// OrgCommandShow — the "Networks" set-piece (#networks): six school tiles
// stream their signals into one superintendent console — rolled-up KPIs, the
// consolidated morning brief cycling one line at a time, and a school-vs-
// school compare strip. The motion tells the pitch in one glance: many
// schools in, ONE screen out, and every number still traceable to a school.
//
// Light band on the page's blue ground (the cash cinema above it is dark —
// the alternation is deliberate). All copy/data from ORG_COMMAND in
// landingContent.js.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import { Building2, Landmark } from 'lucide-react'
import CountUp from '../../components/CountUp.jsx'
import { ORG_COMMAND } from './landingContent.js'
import Reveal, { EASE } from './Reveal.jsx'

const TONE_DOT = { good: '#059669', amber: '#d97706' }

// Compare strip: collections pace per school, matching the tiles' tones.
const COMPARE = [86, 97, 94, 88, 99, 95]

export default function OrgCommandShow() {
  const reduce = useReducedMotion()
  const consoleRef = useRef(null)
  const consoleInView = useInView(consoleRef, { margin: '-100px', once: true })
  const [briefLine, setBriefLine] = useState(0)

  useEffect(() => {
    if (reduce) return undefined
    const t = setInterval(() => setBriefLine((i) => (i + 1) % ORG_COMMAND.brief.length), 3400)
    return () => clearInterval(t)
  }, [reduce])

  return (
    <section id="networks" aria-labelledby="orgcmd-h2" className="scroll-mt-20 bg-transparent py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="text-center">
          <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-[#7a5e00]">{ORG_COMMAND.kicker}</p>
          <h2 id="orgcmd-h2" className="mt-3 font-serif text-[32px] font-semibold leading-tight text-navy sm:text-[42px]">
            {ORG_COMMAND.h2}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[16px] leading-relaxed text-muted">{ORG_COMMAND.sub}</p>
        </div>

        <div className="mt-12 grid items-center gap-6 lg:grid-cols-[minmax(240px,300px)_44px_1fr]">
          {/* ── The schools, streaming in ── */}
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1">
            {ORG_COMMAND.schools.map((s, i) => (
              <motion.div
                key={s.name}
                initial={reduce ? false : { opacity: 0, x: -22 }}
                whileInView={reduce ? undefined : { opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.45, ease: EASE, delay: reduce ? 0 : i * 0.09 }}
                className="flex items-center gap-2.5 rounded-xl border border-navy/10 bg-white/80 px-3.5 py-2.5 shadow-[0_10px_26px_-18px_rgba(16,28,61,0.35)] backdrop-blur-sm"
              >
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-navy/[0.06] text-navy/70">
                  <Building2 size={15} />
                </span>
                <div className="min-w-0">
                  <b className="block truncate text-[12.5px] font-semibold text-navy">{s.name}</b>
                  <span className="flex items-center gap-1.5 text-[11px] text-muted">
                    <span aria-hidden="true" className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: TONE_DOT[s.tone] }} />
                    {s.stat}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>

          {/* ── The confluence beam (lg only) ── */}
          <div aria-hidden="true" className="relative hidden h-full min-h-[280px] lg:block">
            <div
              className="absolute inset-y-8 left-1/2 w-px -translate-x-1/2"
              style={{ background: 'linear-gradient(180deg, transparent, rgba(122,94,0,0.35) 20%, rgba(122,94,0,0.35) 80%, transparent)' }}
            />
            <motion.div
              className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-gold-gradient shadow-glow"
              animate={reduce ? undefined : { y: [-56, 48, -56] }}
              transition={{ duration: 4.4, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>

          {/* ── The console ── */}
          <Reveal>
            <div
              ref={consoleRef}
              className="overflow-hidden rounded-3xl border border-navy/10 bg-white/85 shadow-[0_28px_70px_-30px_rgba(16,28,61,0.45)] backdrop-blur-sm"
            >
              <div className="flex items-center justify-between gap-3 bg-navy-gradient px-5 py-3.5">
                <span className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-gold-light">
                    <Landmark size={15} />
                  </span>
                  <span>
                    <span className="block font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-gold-light/90">
                      {ORG_COMMAND.consoleKicker}
                    </span>
                    <b className="block text-[13.5px] font-semibold text-white">{ORG_COMMAND.consoleTitle}</b>
                  </span>
                </span>
                <span className="hidden rounded-full border border-white/15 bg-white/10 px-2.5 py-1 font-mono text-[9.5px] font-bold uppercase tracking-wide text-white/75 sm:block">
                  Live roll-up
                </span>
              </div>

              {/* KPI band — counts run when the console scrolls into view. */}
              <div className="grid grid-cols-2 gap-px bg-navy/[0.06] sm:grid-cols-4">
                {ORG_COMMAND.kpis.map((k) => (
                  <div key={k.label} className="bg-white/90 px-4 py-3.5 text-center">
                    <b className={`block font-serif text-[26px] font-semibold leading-none ${k.tone === 'amber' ? 'text-amber-600' : 'text-navy'}`}>
                      {consoleInView ? <CountUp value={k.value} /> : 0}
                      {k.suffix ?? ''}
                    </b>
                    <span className="mt-1 block text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted">{k.label}</span>
                  </div>
                ))}
              </div>

              <div className="grid gap-5 px-5 py-5 md:grid-cols-2">
                {/* Consolidated brief — one line at a time, like the product. */}
                <div>
                  <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-[#7a5e00]">This morning's brief</p>
                  <div className="relative mt-2.5 min-h-[76px]">
                    {ORG_COMMAND.brief.map((b, i) => (
                      <motion.p
                        key={b}
                        initial={false}
                        animate={{ opacity: reduce || i === briefLine ? (reduce ? (i === 0 ? 1 : 0) : 1) : 0, y: reduce ? 0 : i === briefLine ? 0 : 8 }}
                        transition={{ duration: 0.45, ease: EASE }}
                        className={`text-[13.5px] leading-relaxed text-navy/85 ${reduce ? '' : 'absolute inset-x-0 top-0'}`}
                        style={reduce && i !== 0 ? { display: 'none' } : undefined}
                      >
                        {b}
                      </motion.p>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-1.5" aria-hidden="true">
                    {ORG_COMMAND.brief.map((b, i) => (
                      <span
                        key={b}
                        className={`h-1 rounded-full transition-all duration-300 ${i === briefLine ? 'w-5 bg-[#b8962e]' : 'w-2.5 bg-navy/15'}`}
                      />
                    ))}
                  </div>
                </div>

                {/* Compare strip — the drill-down promise made visible. */}
                <div>
                  <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-[#7a5e00]">Collections pace by school</p>
                  <div className="mt-2.5 space-y-1.5">
                    {ORG_COMMAND.schools.map((s, i) => (
                      <div key={s.name} className="flex items-center gap-2">
                        <span className="w-24 truncate text-right text-[10.5px] text-muted">{s.name.replace(/ (Academy|Prep|High)$/, '')}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-navy/[0.07]">
                          <motion.div
                            initial={reduce ? { width: `${COMPARE[i]}%` } : { width: 0 }}
                            whileInView={reduce ? undefined : { width: `${COMPARE[i]}%` }}
                            viewport={{ once: true, margin: '-60px' }}
                            transition={{ duration: 0.8, ease: EASE, delay: reduce ? 0 : 0.15 + i * 0.07 }}
                            className="h-full rounded-full"
                            style={{ background: s.tone === 'amber' ? '#d97706' : 'linear-gradient(90deg,#1f3d72,#d4b47a)' }}
                          />
                        </div>
                        <span className="w-8 text-[10.5px] font-semibold tabular-nums text-navy/80">{COMPARE[i]}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.15}>
          <p className="mt-10 text-center font-serif text-[19px] font-medium italic text-navy/75">{ORG_COMMAND.closing}</p>
        </Reveal>
      </div>
    </section>
  )
}
