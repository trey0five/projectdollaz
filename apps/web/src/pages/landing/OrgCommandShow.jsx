// ─────────────────────────────────────────────────────────────────────────────
// OrgCommandShow — the "Networks" set-piece (#networks): six school tiles
// stream their signals into one superintendent console — rolled-up figures
// that count up, the consolidated morning brief cycling one line at a time,
// and a school-vs-school compare strip. The motion tells the pitch in one
// glance: many schools in, ONE screen out, every number still traceable to a
// school. The look is the pre-Premium-UI one (74caaba): glass school chips, a
// gold confluence beam, a rounded console. What the console depicts is TODAY's
// app: the org home's Aurora band, each school's coloured monogram, the app's
// Good / Watch pills, and KYRO (the Scholar) reading the brief.
//
// Light band on the page's blue ground (the cash cinema above it is dark —
// the alternation is deliberate). All copy/data from ORG_COMMAND in
// landingContent.js — a fictional network. The brief cycles while the console
// is on screen and holds while the pointer / focus is on it; reduced motion
// shows every line at once, statically.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import { Landmark } from 'lucide-react'
import CountUp from '../../components/CountUp.jsx'
import PennyAvatar from '../../components/penny/PennyAvatar.jsx'
import VerdictPill from '../../components/ui/aurora/VerdictPill.jsx'
import VerdictEm from '../../components/ui/aurora/VerdictEm.jsx'
import { initialsOf } from '../../components/ui/aurora/AuroraHero.jsx'
import { auroraVarsFromHue } from '../../components/module/moduleAnatomy.js'
import { ORG_COMMAND } from './landingContent.js'
import Reveal, { EASE } from './Reveal.jsx'
import '../../styles/landing-restore-middle.css'

// School tone → the app's verdict.
const VERDICT = { good: 'good', amber: 'watch' }
// The app gives every school a coloured monogram; these are its tile hues.
const MONO = ['#ea580c', '#db2777', '#2563eb', '#7c3aed', '#059669', '#0891b2']
// The org home's band: deep indigo.
const ORG_BAND = auroraVarsFromHue('#4338ca')
const BRIEF_MS = 3400

const needCount = ORG_COMMAND.schools.filter((s) => s.tone === 'amber').length

export default function OrgCommandShow() {
  const reduce = useReducedMotion()
  const consoleRef = useRef(null)
  const consoleInView = useInView(consoleRef, { margin: '-100px', once: true })
  const consoleOnScreen = useInView(consoleRef, { margin: '-60px' })
  const [briefLine, setBriefLine] = useState(0)
  const [paused, setPaused] = useState(false)

  // The brief reads one line at a time, like the product's narrator.
  useEffect(() => {
    if (reduce || paused || !consoleOnScreen) return undefined
    const t = setTimeout(() => setBriefLine((i) => (i + 1) % ORG_COMMAND.brief.length), BRIEF_MS)
    return () => clearTimeout(t)
  }, [reduce, paused, consoleOnScreen, briefLine])

  return (
    <section id="networks" aria-labelledby="orgcmd-h2" className="scroll-mt-20 bg-[#e9f0fb] py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="text-center">
          <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-[#7a5e00]">{ORG_COMMAND.kicker}</p>
          <h2 id="orgcmd-h2" className="mt-3 font-sans text-[32px] font-semibold leading-tight text-navy sm:text-[42px]">
            {ORG_COMMAND.h2}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[16px] leading-relaxed text-muted">{ORG_COMMAND.sub}</p>
        </div>

        <div className="mt-12 grid items-center gap-6 lg:grid-cols-[minmax(270px,330px)_44px_minmax(0,1fr)]">
          {/* ── The schools, streaming in ── */}
          <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1" aria-label="Schools in the network">
            {ORG_COMMAND.schools.map((s, i) => (
              <motion.li
                key={s.name}
                initial={reduce ? false : { opacity: 0, x: -22 }}
                whileInView={reduce ? undefined : { opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.45, ease: EASE, delay: reduce ? 0 : i * 0.09 }}
                className="flex min-w-0 items-center gap-2.5 rounded-[12px] border border-navy/10 bg-white/80 px-3 py-2.5 backdrop-blur-sm"
                style={{ boxShadow: '0 10px 26px -18px rgba(16,28,61,0.35)' }}
              >
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 flex-none items-center justify-center rounded-[8px] text-[11px] font-bold text-white"
                  style={{ background: MONO[i % MONO.length], boxShadow: `0 6px 14px -6px ${MONO[i % MONO.length]}` }}
                >
                  {initialsOf(s.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <b className="block truncate text-[12.5px] font-semibold text-navy">{s.name}</b>
                  <span className="block truncate text-[11px] text-muted">{s.stat}</span>
                </div>
                <VerdictPill verdict={VERDICT[s.tone]} className="au-pill-sm flex-none" />
              </motion.li>
            ))}
          </ul>

          {/* ── The confluence beam (lg only) ── */}
          <div aria-hidden="true" className="relative hidden h-full min-h-[280px] lg:block">
            <div
              className="absolute inset-y-8 left-1/2 w-px -translate-x-1/2"
              style={{ background: 'linear-gradient(180deg, transparent, rgba(122,94,0,0.35) 20%, rgba(122,94,0,0.35) 80%, transparent)' }}
            />
            <motion.div
              className="absolute left-1/2 top-1/2 -ml-[5px] h-2.5 w-2.5 rounded-full bg-gold-gradient"
              style={{ boxShadow: '0 0 0 1px rgba(125,211,252,0.6), 0 0 16px rgba(59,130,246,0.8)' }}
              animate={reduce ? undefined : { y: [-56, 48, -56] }}
              transition={{ duration: 4.4, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>

          {/* ── The console: the app's org home ── */}
          <Reveal className="min-w-0">
            <div
              ref={consoleRef}
              onPointerEnter={() => setPaused(true)}
              onPointerLeave={() => setPaused(false)}
              className="overflow-hidden rounded-[24px] border border-navy/10 bg-white/90"
              style={{ boxShadow: '0 28px 70px -30px rgba(16,28,61,0.45)' }}
            >
              {/* The Aurora band the org home opens with. */}
              {/* clip-path, not just overflow: the band's blurred blobs otherwise
                  bleed past the rounded corner while the card is transformed. */}
              <div className="lrm-band px-5 py-4 sm:px-6" style={{ ...ORG_BAND, clipPath: 'inset(0 round 24px 24px 0 0)' }}>
                <div className="au-fx" aria-hidden="true">
                  <span className="au-blob au-blob-1" />
                  <span className="au-blob au-blob-2" />
                  <span className="au-blob au-blob-3" />
                  <span className="au-veil" />
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] border border-white/25 bg-white/15 text-white">
                      <Landmark size={16} aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/85">
                        {ORG_COMMAND.consoleKicker}
                      </span>
                      <b className="block truncate font-serif text-[20px] font-medium leading-6 text-white">{ORG_COMMAND.consoleTitle}</b>
                    </span>
                  </span>
                  <span className="hidden flex-none items-center gap-1.5 rounded-full border border-white/25 bg-black/20 px-2.5 py-1 text-[11px] font-semibold text-white sm:inline-flex">
                    <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                      {!reduce && <span className="lrm-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-70" />}
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-300" />
                    </span>
                    Live roll-up
                  </span>
                </div>
                <p className="mt-3 text-[14.5px] font-medium leading-snug text-white">
                  Six schools reporting · <VerdictEm tone="watch">{needCount} need a decision today.</VerdictEm>
                </p>
              </div>

              {/* KPI band — counts run when the console scrolls into view. */}
              <div className="grid grid-cols-2 gap-px bg-navy/[0.06] sm:grid-cols-4">
                {ORG_COMMAND.kpis.map((k) => (
                  <div key={k.label} className="flex flex-col items-center bg-white/90 px-3 py-3.5 text-center">
                    <b className={`block font-sans text-[26px] font-bold leading-none tracking-[-0.01em] tabular-nums ${k.tone === 'amber' ? 'text-amber-600' : 'text-navy'}`}>
                      {consoleInView ? <CountUp value={k.value} /> : 0}
                      {k.suffix ?? ''}
                    </b>
                    <span className="mt-1 block text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted">{k.label}</span>
                  </div>
                ))}
              </div>

              <div className="grid gap-5 px-5 py-5 md:grid-cols-2">
                {/* Consolidated brief — one line at a time, read by KYRO. */}
                <div
                  className="min-w-0"
                  onFocus={() => setPaused(true)}
                  onBlur={() => setPaused(false)}
                >
                  <div className="flex items-center gap-2">
                    <span className="flex-none" aria-hidden="true">
                      <PennyAvatar size={30} speaking={!reduce && consoleOnScreen && !paused} />
                    </span>
                    <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-[#7a5e00]">This morning&rsquo;s brief</p>
                  </div>
                  {reduce ? (
                    <ul className="mt-2.5 space-y-2.5">
                      {ORG_COMMAND.brief.map((b) => (
                        <li key={b.text}>
                          <VerdictPill verdict={VERDICT[b.tone]} className="au-pill-sm" />
                          <p className="mt-1 text-[13.5px] leading-relaxed text-navy/85">{b.text}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <>
                      <ul className="relative mt-2.5 min-h-[104px]">
                        {ORG_COMMAND.brief.map((b, i) => (
                          <motion.li
                            key={b.text}
                            initial={false}
                            animate={{ opacity: i === briefLine ? 1 : 0, y: i === briefLine ? 0 : 8 }}
                            transition={{ duration: 0.45, ease: EASE }}
                            className="absolute inset-x-0 top-0"
                            aria-hidden={i === briefLine ? undefined : true}
                          >
                            <VerdictPill verdict={VERDICT[b.tone]} className="au-pill-sm" />
                            <p className="mt-1.5 text-[13.5px] leading-relaxed text-navy/85">{b.text}</p>
                          </motion.li>
                        ))}
                      </ul>
                      <div className="mt-2 flex gap-1.5" aria-hidden="true">
                        {ORG_COMMAND.brief.map((b, i) => (
                          <span
                            key={b.text}
                            className={`h-1 rounded-full transition-all duration-300 ${i === briefLine ? 'w-5 bg-[#b8962e]' : 'w-2.5 bg-navy/15'}`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Compare strip — the drill-down promise made visible. */}
                <div className="min-w-0">
                  <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-[#7a5e00]">Collections pace by school</p>
                  <ul className="mt-2.5 space-y-1.5">
                    {ORG_COMMAND.schools.map((s, i) => (
                      <li key={s.name} className="flex items-center gap-2">
                        <span className="w-24 flex-none truncate text-right text-[10.5px] text-muted">{s.short}</span>
                        <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-navy/[0.07]" aria-hidden="true">
                          <motion.div
                            initial={reduce ? false : { width: 0 }}
                            whileInView={reduce ? undefined : { width: `${s.pace}%` }}
                            viewport={{ once: true, margin: '-60px' }}
                            transition={{ duration: 0.8, ease: EASE, delay: reduce ? 0 : 0.15 + i * 0.07 }}
                            className="h-full rounded-full"
                            style={{
                              width: reduce ? `${s.pace}%` : undefined,
                              background: s.tone === 'amber' ? '#d97706' : 'linear-gradient(90deg,#1f3d72,#d4b47a)',
                            }}
                          />
                        </div>
                        <span className="w-8 flex-none text-[10.5px] font-semibold tabular-nums text-navy/80">{s.pace}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.15}>
          <p className="mt-10 text-center font-sans text-[19px] font-medium italic text-navy/75">{ORG_COMMAND.closing}</p>
        </Reveal>
      </div>
    </section>
  )
}
