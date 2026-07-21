// ─────────────────────────────────────────────────────────────────────────────
// BentoWall — "the platform, today": a live bento grid under the Orbit where
// every cell runs a real micro-demo on loop. Content states CURRENT platform
// truths (QBO diocesan split, SIS connectors, NBOA packet, self-measuring
// strategy, org console…) — no vaporware. Cells cascade in with a 3-D tilt
// spring (whileInView, once); the loops are CSS keyframes (landing-orbit.css)
// behind prefers-reduced-motion. Decorative visuals are aria-hidden; each
// cell's meaning is carried by its text.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  Sparkles,
  BarChart3,
  RefreshCw,
  Bot,
  ListChecks,
  GraduationCap,
  FileBarChart2,
  Target,
  Building2,
  Library,
} from 'lucide-react'
import '../../styles/landing-orbit.css'

const BRIEF_LINES = [
  { hue: '#FF6B5C', text: 'Cash days slipped below 90 — see June actuals' },
  { hue: '#d4b47a', text: 'Accreditation Std 4 evidence due in 12 days' },
  { hue: '#2563EB', text: 'Boiler service contract renews Friday — task created' },
]

const CELL = 'relative overflow-hidden rounded-2xl border border-white/12 bg-white/[0.05] p-5'
const HEAD = 'mb-3 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-penny-light'

function Cell({ i, span, children }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 46, rotateX: 9 }}
      whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.7, delay: reduce ? 0 : (i % 3) * 0.09, ease: [0.16, 1.2, 0.3, 1] }}
      style={{ transformPerspective: 900 }}
      className={`${CELL} ${span}`}
    >
      {children}
    </motion.div>
  )
}

export default function BentoWall() {
  const reduce = useReducedMotion()
  // Briefing cell: lines reveal one by one, then reset — a living inbox.
  const [shown, setShown] = useState(1)
  useEffect(() => {
    if (reduce) { setShown(BRIEF_LINES.length); return undefined }
    const t = setInterval(() => setShown((s) => (s >= BRIEF_LINES.length ? 1 : s + 1)), 1900)
    return () => clearInterval(t)
  }, [reduce])

  return (
    <section aria-labelledby="bento-h2" className="bg-gradient-to-b from-[#070d1d] via-[#101f42] to-[#0e1832] py-24">
      <div className="mx-auto max-w-5xl px-5 sm:px-8">
        <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-penny-light">The platform, today</p>
        <h2 id="bento-h2" className="mt-3 font-serif text-[32px] font-semibold leading-tight text-white sm:text-[42px]">
          Everything on board — live.
        </h2>

        <div className="mt-11 grid grid-cols-2 gap-3.5 sm:grid-cols-6">
          {/* 1 · Daily briefing */}
          <Cell i={0} span="col-span-2 sm:col-span-3">
            <h5 className={HEAD}><Sparkles size={13} /> Daily briefing</h5>
            {BRIEF_LINES.map((l, i) => (
              <div
                key={l.text}
                className="flex items-center gap-2.5 border-t border-white/10 py-2 text-[13px] text-white/85 transition-all duration-500"
                style={{ opacity: i < shown ? 1 : 0, transform: i < shown ? 'none' : 'translateY(8px)' }}
              >
                <span aria-hidden="true" className="h-2 w-2 flex-none rounded-full" style={{ background: l.hue }} />
                {l.text}
              </div>
            ))}
            <p className="mt-2 text-[12px] text-white/50">Prioritized across all eight domains — shaped to your role.</p>
          </Cell>

          {/* 2 · Analytics + peers */}
          <Cell i={1} span="col-span-2 sm:col-span-3">
            <h5 className={HEAD}><BarChart3 size={13} /> Analytics · peer benchmarked</h5>
            <svg className="w-full" height="64" viewBox="0 0 300 64" preserveAspectRatio="none" aria-hidden="true">
              <path d="M6 54 L56 47 L106 50 L156 34 L206 38 L256 18 L294 10" fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="2" />
              <path className="bw-spark" d="M6 54 L56 47 L106 50 L156 34 L206 38 L256 18 L294 10" fill="none" stroke="#d4b47a" strokeWidth="2.6" strokeLinecap="round" />
            </svg>
            <p className="mt-2 text-[12px] text-white/50">Compare with similar schools — size band, county, type and grade span.</p>
          </Cell>

          {/* 3 · QuickBooks */}
          <Cell i={0} span="col-span-1 sm:col-span-2">
            <h5 className={HEAD}><RefreshCw size={13} /> QuickBooks sync</h5>
            <div aria-hidden="true" className="bw-pulse relative mx-auto my-2 flex h-14 w-14 items-center justify-center rounded-full">
              <RefreshCw size={22} className="text-white/85" />
            </div>
            <p className="text-center text-[12px] text-white/50">Live sync — one diocesan file splits into per-school books.</p>
          </Cell>

          {/* 4 · Ask Penny */}
          <Cell i={1} span="col-span-1 sm:col-span-2">
            <h5 className={HEAD}><Bot size={13} /> Ask Penny</h5>
            <div aria-hidden="true" className="bw-type flex gap-1.5 py-2.5">
              <i className="h-2 w-2 rounded-full bg-penny" /><i className="h-2 w-2 rounded-full bg-penny" /><i className="h-2 w-2 rounded-full bg-penny" />
            </div>
            <p className="text-[12px] text-white/50">Voice in, files in — records out. Every action reversible.</p>
          </Cell>

          {/* 5 · Tasks */}
          <Cell i={2} span="col-span-2 sm:col-span-2">
            <h5 className={HEAD}><ListChecks size={13} /> Tasks</h5>
            <div className="flex items-center gap-2.5 py-1.5" aria-hidden="true">
              <span className="bw-tickbox relative h-5 w-5 flex-none rounded-md border-2 border-penny after:absolute after:inset-[3px] after:scale-0 after:rounded-sm after:bg-penny after:content-['']" />
              <s className="bw-strike text-[13.5px] text-white/85 [text-decoration-color:transparent]">Chase June invoices</s>
            </div>
            <p className="text-[12px] text-white/50">Creates itself from the briefing — every attention item can become work assigned.</p>
          </Cell>

          {/* 6 · Enrollment */}
          <Cell i={0} span="col-span-1 sm:col-span-2">
            <h5 className={HEAD}><GraduationCap size={13} /> Enrollment intelligence</h5>
            <b className="font-serif text-[34px] leading-none text-white">412</b>
            <p className="mt-1.5 text-[12px] text-white/50">SIS rosters via OneRoster CSV or Blackbaud SKY — matched to your students by name.</p>
          </Cell>

          {/* 7 · Board packet */}
          <Cell i={1} span="col-span-1 sm:col-span-2">
            <h5 className={HEAD}><FileBarChart2 size={13} /> Board reports</h5>
            <b className="font-serif text-[34px] leading-none text-white">4<span className="text-[16px] text-white/60"> statements</span></b>
            <p className="mt-1.5 text-[12px] text-white/50">NBOA-style finance-committee packet — one click from a trial balance.</p>
          </Cell>

          {/* 8 · Strategy */}
          <Cell i={2} span="col-span-2 sm:col-span-2">
            <h5 className={HEAD}><Target size={13} /> Strategic planning</h5>
            <div aria-hidden="true" className="my-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <span className="bw-goal block h-full rounded-full bg-gradient-to-r from-penny to-penny-pale" style={{ width: '8%' }} />
            </div>
            <p className="text-[12px] text-white/50">Metric-bound goals graded by the live actuals — the plan measures itself.</p>
          </Cell>

          {/* 9 · Diocese network */}
          <Cell i={0} span="col-span-2 sm:col-span-4">
            <h5 className={HEAD}><Building2 size={13} /> Diocese &amp; networks</h5>
            <div aria-hidden="true" className="flex items-center justify-center gap-3.5 py-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <i key={i} className="bw-dot h-3.5 w-3.5 rounded-full bg-white/20" style={{ '--bw-delay': `${i * 0.3}s` }} />
              ))}
            </div>
            <p className="text-center text-[12px] text-white/50">
              Every school synced, compared and consolidated — one console, org-wide statements, member access without swapping accounts.
            </p>
          </Cell>

          {/* 10 · Knowledge */}
          <Cell i={1} span="col-span-2 sm:col-span-2">
            <h5 className={HEAD}><Library size={13} /> Knowledge</h5>
            <b className="font-serif text-[34px] leading-none text-white">∞<span className="text-[16px] text-white/60"> memory</span></b>
            <p className="mt-1.5 text-[12px] text-white/50">Drop any document — Penny files it to the right module and it's searchable forever.</p>
          </Cell>
        </div>
      </div>
    </section>
  )
}
