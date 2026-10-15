// ─────────────────────────────────────────────────────────────────────────────
// OrgCommandShow — the "Networks" set-piece (#networks): six schools roll up
// into one superintendent view — the network's figures as a StatStrip that
// counts up once, the consolidated morning brief as a ruled list with 2px
// status marks, every school as a row you could drill into, and a collections
// compare. Premium UI P5: on the ground, ruled, no console box, no frosted
// tiles, no looping beam or cycling brief — the motion is one-shot (row
// stagger, count-ups, bars drawing once). All copy/data from ORG_COMMAND.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import { StatStrip, Stat } from '../../components/ui/surface/index.js'
import { ORG_COMMAND } from './landingContent.js'
import SectionHead from './SectionHead.jsx'
import Reveal, { EASE } from './Reveal.jsx'
import '../../styles/pending/p5-landing.css'

// School tone → semantic mark (good / watch). Colour lives only in the mark.
const TONE = { good: 'tone-good', amber: 'tone-watch' }
const STATUS = { good: 'good', amber: 'watch' }

// Collections pace per school, matching the schools' tones.
const COMPARE = [86, 97, 94, 88, 99, 95]

// The brief's lines carry the same tones as the schools they name.
const BRIEF_TONE = ['amber', 'amber', 'amber', 'good']

const CAPS = 'text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-ink2'

export default function OrgCommandShow() {
  const reduce = useReducedMotion()
  const stripRef = useRef(null)
  // The figures count up the first time the strip is on screen (Stat counts on
  // mount, so it mounts its number only then; "0" holds the box until).
  const stripInView = useInView(stripRef, { margin: '-80px', once: true })

  const row = (i) => ({
    initial: reduce ? false : { opacity: 0, y: 8 },
    whileInView: reduce ? undefined : { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-60px' },
    transition: { duration: 0.4, ease: EASE, delay: reduce ? 0 : i * 0.06 },
  })

  return (
    <section id="networks" aria-labelledby="orgcmd-h2" className="scroll-mt-20 py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHead id="orgcmd-h2" kicker={ORG_COMMAND.kicker} title={ORG_COMMAND.h2} sub={ORG_COMMAND.sub} />

        {/* The superintendent view's own header line, then its figures. */}
        <Reveal className="mt-12">
          <p className={CAPS}>{ORG_COMMAND.consoleKicker}</p>
          <p className="mt-1 font-serif text-[22px] font-medium leading-7 text-ink">{ORG_COMMAND.consoleTitle}</p>
        </Reveal>
        <div ref={stripRef} className="mt-4 border-t border-hair">
          <StatStrip>
            {ORG_COMMAND.kpis.map((k) => (
              <Stat
                key={k.label}
                label={k.label}
                value={stripInView ? k.value : '0'}
                unit={k.suffix}
                status={k.tone === 'amber' ? 'watch' : undefined}
              />
            ))}
          </StatStrip>
        </div>

        <div className="mt-12 grid gap-x-12 gap-y-12 lg:grid-cols-2">
          {/* ── This morning's brief: one ruled list, read in one glance ── */}
          <div className="min-w-0">
            <div className="sec-head">
              <h3 className="sec-label">This morning&rsquo;s brief</h3>
              <span className="sec-rule" aria-hidden="true" />
            </div>
            <ul className="border-b border-hair">
              {ORG_COMMAND.brief.map((b, i) => (
                <motion.li key={b} {...row(i)} className={`flex gap-3 border-t border-hair py-3 ${TONE[BRIEF_TONE[i]]}`}>
                  <span aria-hidden="true" className="w-[2px] shrink-0 self-stretch bg-current" />
                  <span className="text-[15px] leading-[22px] text-ink">{b}</span>
                </motion.li>
              ))}
            </ul>
          </div>

          {/* ── The schools: every row is a school you could drill into ── */}
          <div className="min-w-0">
            <div className="sec-head">
              <h3 className="sec-label">Schools · collections pace</h3>
              <span className="sec-rule" aria-hidden="true" />
            </div>
            <div className="dt-wrap">
              <table className="dt">
                <thead>
                  <tr>
                    <th scope="col" className="dt-mark" aria-label="Status" />
                    <th scope="col">School</th>
                    <th scope="col" className="hidden sm:table-cell">Signal</th>
                    <th scope="col" className="dt-num">Collections</th>
                  </tr>
                </thead>
                <tbody>
                  {ORG_COMMAND.schools.map((s, i) => (
                    <motion.tr key={s.name} {...row(i)}>
                      <td className={`dt-mark ${TONE[s.tone]}`}>
                        <i />
                        <span className="sr-only">{STATUS[s.tone] === 'watch' ? 'Needs attention' : 'On track'}</span>
                      </td>
                      <td className="whitespace-nowrap font-semibold">{s.name}</td>
                      <td className="hidden text-ink2 sm:table-cell">{s.stat}</td>
                      <td className="dt-num">
                        <span className="inline-flex items-center justify-end gap-2.5">
                          <span aria-hidden="true" className="hidden h-1.5 w-20 overflow-hidden rounded-sm bg-ink/[.07] md:block">
                            <motion.span
                              className="block h-full bg-ink/60"
                              initial={reduce ? false : { width: 0 }}
                              whileInView={{ width: `${COMPARE[i]}%` }}
                              viewport={{ once: true, margin: '-60px' }}
                              transition={{ duration: 0.8, ease: EASE, delay: reduce ? 0 : 0.15 + i * 0.07 }}
                              style={reduce ? { width: `${COMPARE[i]}%` } : undefined}
                            />
                          </span>
                          {COMPARE[i]}%
                        </span>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <Reveal delay={0.1}>
          <p className="mt-12 font-serif text-[22px] font-medium italic leading-7 text-ink">{ORG_COMMAND.closing}</p>
        </Reveal>
      </div>
    </section>
  )
}
