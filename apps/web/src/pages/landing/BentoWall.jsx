// ─────────────────────────────────────────────────────────────────────────────
// BentoWall — "the platform, today" (#platform). Premium UI P5: the old bento
// of frosted cells, each running a looping micro-mock, is now the product
// itself: REAL screenshots of the current app (Plate) — Home as the lead plate,
// then Finance, Analytics and Accreditation cropped to their content with a
// margin-note caption — followed by a ruled index of the
// rest of the platform (hairlines, no boxes). Every claim is a CURRENT platform
// truth (QBO diocesan split, SIS connectors, NBOA packet, self-measuring
// strategy, org console…) — no vaporware. Motion: one-shot reveals only.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { BarChart3, RefreshCw, Bot, ListChecks, GraduationCap, FileBarChart2, Target, Building2, Library } from 'lucide-react'
import SectionHead from './SectionHead.jsx'
import Plate from './Plate.jsx'
import { EASE } from './Reveal.jsx'
import '../../styles/pending/p5-landing.css'

const PLATES = [
  {
    name: 'finance',
    height: 884,
    title: 'Finance',
    caption: 'Statements, analytics, budget and cash on one ruled page.',
    alt: 'The KYRO Finance overview: revenue, expense and change in net assets beside operating margin, days cash and reserve',
  },
  {
    name: 'scorecard',
    height: 932,
    title: 'Analytics',
    caption: 'Every metric against its target, attention first.',
    alt: 'The KYRO Analytics scorecard: each metric with its target, value, change and status',
  },
  {
    name: 'accreditation',
    height: 790,
    title: 'Accreditation',
    caption: 'Readiness against your accreditor, with the fastest path to the next tier.',
    alt: 'The KYRO Accreditation overview: documented and defensible coverage, projected index and the fastest path of standards',
  },
]

const INDEX = [
  { Icon: BarChart3, label: 'Peer benchmarks', body: 'Compare with similar schools by size band, county, type and grade span.' },
  { Icon: RefreshCw, label: 'QuickBooks sync', body: 'Live sync. One diocesan company file splits into per-school books.' },
  { Icon: Bot, label: 'Ask KYRO', body: 'Voice in, files in, records out. Every action is confirmed first and reversible.' },
  { Icon: ListChecks, label: 'Tasks', body: 'Any briefing item can become assigned work, with recurring tasks that come due.' },
  { Icon: GraduationCap, label: 'Enrollment intelligence', body: 'SIS rosters via OneRoster CSV or Blackbaud SKY, matched to your students by name.' },
  { Icon: FileBarChart2, label: 'Board reports', body: 'An NBOA-style finance-committee packet, one click from a trial balance.' },
  { Icon: Target, label: 'Strategic planning', body: 'Goals bound to live metrics and graded by the actuals. The plan measures itself.' },
  { Icon: Building2, label: 'Dioceses & networks', body: 'Every school synced, compared and consolidated in one console, with org-wide statements.' },
  { Icon: Library, label: 'Knowledge', body: 'Drop any document. KYRO files it to the right module and it stays searchable.' },
]

export default function BentoWall() {
  const reduce = useReducedMotion()
  return (
    <section id="platform" aria-labelledby="bento-h2" className="scroll-mt-20 py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHead
          id="bento-h2"
          kicker="The platform, today"
          title="Everything on board, live."
          sub="These are the screens a school sees today, shown with sample data. Every module reads from the same numbers."
        />

        {/* Lead plate: Home — the daily briefing and every module. */}
        <Plate
          className="mt-12"
          name="home"
          title="Home"
          caption="The daily briefing and every module, prioritized across all eight domains and shaped to your role."
          alt="The KYRO Home screen: the daily briefing with operating margin, tuition discount and student-teacher ratio above a grid of module tiles"
          sizes="(min-width: 1152px) 1088px, calc(100vw - 40px)"
        />

        {/* The rest of the lead modules: each shot is cropped to its content
            (no app chrome) and shown at ~3/4 of the column with its caption as
            a margin note, so the product's own type stays readable. */}
        <div className="mt-16 space-y-14 md:space-y-16">
          {PLATES.map((p) => (
            <Plate key={p.name} {...p} layout="aside" sizes="(min-width: 1152px) 788px, (min-width: 768px) 72vw, calc(100vw - 40px)" />
          ))}
        </div>

        {/* The rest of the platform — a ruled index, no cells. */}
        <div className="sec mt-16">
          <div className="sec-head">
            <h3 className="sec-label">Also in the platform</h3>
            <span className="sec-rule" aria-hidden="true" />
          </div>
          <ul className="ruled-index">
            {INDEX.map((item, i) => (
              <motion.li
                key={item.label}
                initial={reduce ? false : { opacity: 0, y: 10 }}
                whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.45, ease: EASE, delay: reduce ? 0 : (i % 3) * 0.06 }}
              >
                <p className="flex items-center gap-2 text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-ink2">
                  <item.Icon size={14} strokeWidth={1.75} aria-hidden="true" /> {item.label}
                </p>
                <p className="mt-2 text-[15px] leading-[22px] text-ink">{item.body}</p>
              </motion.li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
