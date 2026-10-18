// ─────────────────────────────────────────────────────────────────────────────
// OrbitScrolly — THE landing set-piece: a pinned, scroll-scrubbed 3-D orbital
// system with KYRO (the Scholar owl) at the center and the nine domains as
// planets.
//
// Choreography over the 560vh track (progress 0→1):
//   0.00–0.10  FORMATION — planets erupt from the core (overshoot) onto a
//              tilted ellipse; the backdrop photograph + giant type fade in.
//   0.10–0.90  NINE STOPS — the planets sit 40° apart (360° ÷ 9) and the system
//              rotates 320° (8 × 40°); each domain docks at the FRONT (bottom,
//              scaled up, hue-lit), fires a shockwave, connects a packet-flow
//              beam into KYRO, crossfades its photograph in behind the whole
//              stage, and deals in its live payload card (counting stat + its
//              own self-drawing chart).
//   0.90–1.00  COLLAPSE — the system spirals into the core, which re-emerges as
//              the briefing card: "Good morning — 3 things need a decision."
//
// KYRO PERFORMS the scroll (orbitOwl.js — pure functions of scroll progress):
// it flies in on an arc as the track scrolls up into view and lands on the
// core as the stage pins, waves while the planets erupt, then per dock listens
// (the planet hands its numbers over), talks (its briefing line) and thinks
// (in transit), and tosses its cap once every domain is in. Scrubbing back up
// plays it backwards — it takes off and flies out the way it came.
//
// The LOOK is the pre-Premium-UI orbit (74caaba), restored at the owner's
// request: full-bleed domain photograph under a milky veil with a hue nebula,
// the hue→navy gradient watermark, hue-filled glowing docked tile, glowing
// beam with a dashed packet flow, frosted-glass flanking panels, the frosted
// payload card with a gold count-up and hue charts, and the navy aurora
// finale. Two things are deliberately new: the Scholar (and its choreography)
// in place of the realistic owl, and Academics as the ninth domain.
//
// Type note: at 74caaba `font-serif` resolved to Montserrat under ui.v2 (with
// -0.02em tracking) and the v2 body was 17px/1.65; it is EB Garamond and
// 15px/1.5 now, so this file names `font-sans` + `tracking-[-0.02em]` where the
// old look was the display face, and the section re-sets 17px/1.65 so the text
// sizes that inherit line-height read as they did. Radii are literal
// (`rounded-[16px]`) because ui.v2 clamps rounded-lg…3xl to 8px; shadows are
// arbitrary/inline for the same reason.
//
// Implementation notes: ONE useMotionValueEvent handler does the trig and
// writes planet/beam/core/photo styles imperatively via refs (zero re-renders
// while scrubbing); React state changes ONLY on dock (active index), driving
// the payload card, photo, flanks, type and shockwave.
// Reduced motion: a static settled frame (no pin theatrics, no loops).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import {
  motion,
  AnimatePresence,
  animate,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
} from 'framer-motion'
import {
  CircleDollarSign,
  GraduationCap,
  Landmark,
  BadgeCheck,
  BookOpenCheck,
  Wrench,
  HeartHandshake,
  Target,
  Users,
  Sparkles,
  Play,
  Clock,
} from 'lucide-react'
import PennyAvatar from '../../components/penny/PennyAvatar.jsx'
import ClassicAuroraFlow from '../../components/home/classic/ClassicAuroraFlow.jsx'
import useMediaQuery from './useMediaQuery.js'
import {
  DOCKS,
  FLIGHT_IDLE_MS,
  beatOwl,
  flightPhase,
  flightPoint,
  flightProgress,
  orbitBeat,
  settleDuration,
  settleTarget,
  travelDir,
} from './orbitOwl.js'
import '../../styles/landing-orbit.css'

// The nine domains — hue, proof line, the payload stat, and a PHOTOGRAPH.
// Real platform truths (statements from a TB; SIS name-matching…).
//
// The photos live in /public/landing/orbit-*.jpg (Unsplash — free commercial
// license, no attribution required — except Academics, generated to match them:
// 1000×520 progressive JPEG) and each was chosen for the domain it rides
// with, not for generic office ambience: a classroom full of students for
// Enrollment, a teacher going over a results sheet with two students for
// Academics, an empty board table for Governance, thrown graduation caps for
// Accreditation, the campus building itself for Facilities, cupped hands giving
// for Advancement, a sticky-note planning wall for Strategy, a staff training
// session for HR, and two people working the numbers for Finance. The photo is
// the whole stage's backdrop and crossfades on every dock.
// Each domain also carries its EXPLANATION (three concrete, platform-true
// points — what the module actually does, no adjectives doing the work) and a
// SAMPLE BRIEFING ITEM (severity + sentence, styled like the real app's
// attention rail) for the flanking panels beside the orbit.
const DOMAINS = [
  { key: 'finance', label: 'Finance', hue: '#2563EB', Icon: CircleDollarSign, line: 'Trial balance in — four board-ready statements out.', stat: 4, unit: 'statements', img: '/landing/orbit-finance.jpg', imgAlt: 'Two people working through financial statements together' , points: ['Upload a trial balance or connect QuickBooks \u2014 four board-ready statements build themselves.', 'Analytics, budget vs actual and the board packet read from the same numbers.', 'A cash forecast dates the summer trough before it arrives.'], brief: { sev: 'critical', text: 'Days cash on hand fell below 60 \u2014 first shortfall projected July 18.' } },
  { key: 'enrollment', label: 'Enrollment', hue: '#0891b2', Icon: GraduationCap, line: 'SIS rosters reconcile by name; projections flow into tuition and cash.', stat: 412, unit: 'students synced', img: '/landing/orbit-enrollment.jpg', imgAlt: 'A classroom full of students' , points: ['SIS rosters sync and reconcile by name \u2014 Blackbaud SKY, or a OneRoster roster file.', 'Enrollment flows into tuition, aid and cash projections automatically.', 'Demographics and retention read from the same roster.'], brief: { sev: 'watch', text: 'Enrollment is 12 under plan \u2014 projected tuition impact \u2212$146K.' } },
  { key: 'academics', label: 'Academics', hue: '#0D9488', Icon: BookOpenCheck, line: 'ACT, SAT and TerraNova in one place \u2014 measured against peer schools.', stat: 24, unit: 'average ACT', img: '/landing/orbit-academics.jpg', imgAlt: 'A teacher going over a results sheet with two high-school students', points: ['ACT, SAT and TerraNova results in one place \u2014 upload the score report as it arrives.', 'See where you stand against peer schools, grade by grade.', 'Follow progress over time and the same class year to year; groups too small to show stay hidden.'], brief: { sev: 'watch', text: 'Grade 5 math fell 14 national percentile points on TerraNova \u2014 reading held steady.' } },
  { key: 'governance', label: 'Governance', hue: '#7c3aed', Icon: Landmark, line: 'Policies, meetings, minutes — reviewed on schedule, never lost.', stat: 36, unit: 'policies tracked', img: '/landing/orbit-governance.jpg', imgAlt: 'An empty boardroom table before a meeting' , points: ['Policies with owners and review dates that actually come due.', 'Meetings, minutes and committees in one register.', 'Review lapses surface in the briefing before an auditor finds them.'], brief: { sev: 'watch', text: '4 policies are past their scheduled review \u2014 the oldest by 210 days.' } },
  { key: 'accreditation', label: 'Accreditation', hue: '#d97706', Icon: BadgeCheck, line: 'Standards and evidence tracked; gaps surface in the briefing.', stat: 87, unit: '% evidence ready', img: '/landing/orbit-accreditation.jpg', imgAlt: 'Graduates throwing their caps' , points: ['Adopt your accreditor\u2019s framework \u2014 Cognia, FCIS, ACSI, WASC, SAIS.', 'Score standards on the rubric; attach evidence where it lives.', 'A mock visit shows what a visiting team would find today.'], brief: { sev: 'critical', text: 'An assurance gate is unmet \u2014 one attached artifact settles it.' } },
  { key: 'facilities', label: 'Facilities', hue: '#ea580c', Icon: Wrench, line: 'Maintenance with real costs — variance you can defend.', stat: 23, unit: 'work orders', img: '/landing/orbit-facilities.jpg', imgAlt: 'A school campus building and grounds' , points: ['Work orders with real costs, not estimates that never close.', 'Recurring maintenance on a calendar, with inspection records.', 'Variance against the facilities budget you can defend to a board.'], brief: { sev: 'watch', text: 'Maintenance backlog reached 23 work orders \u2014 $41K over budget.' } },
  { key: 'advancement', label: 'Advancement', hue: '#e11d48', Icon: HeartHandshake, line: 'Campaigns, gifts, pledges — pacing vs goal at a glance.', stat: 72, unit: '% to goal', img: '/landing/orbit-advancement.jpg', imgAlt: 'Cupped hands holding a donation' , points: ['Campaigns, gifts and pledges in one register.', 'Pledge pacing versus goal, visible at a glance.', 'Giving flows into the finance picture automatically.'], brief: { sev: 'info', text: 'Annual fund reached 72% of goal \u2014 $84K ahead of last year\u2019s pace.' } },
  { key: 'strategy', label: 'Strategy', hue: '#8b5cf6', Icon: Target, line: 'A strategic plan that measures itself against the live numbers.', stat: 9, unit: 'goals on pace', img: '/landing/orbit-strategy.jpg', imgAlt: 'A team planning with sticky notes on a wall' , points: ['Goals bound to live metrics \u2014 progress computes itself.', 'Direction-aware pacing: ahead or behind, with no manual updates.', 'Strategy-linked tasks land with the people who own them.'], brief: { sev: 'info', text: '9 of 12 goals on pace \u2014 two need attention before the board meets.' } },
  { key: 'hr', label: 'HR', hue: '#059669', Icon: Users, line: 'Staffing feeds student-teacher ratio straight into analytics.', stat: 14, unit: 'students per teacher', img: '/landing/orbit-hr.jpg', imgAlt: 'Staff in a professional development session' , points: ['A staff roster with credentials, clearances and evaluations.', 'Student-teacher ratio feeds analytics straight from staffing.', 'Professional development tracked with dates that come due.'], brief: { sev: 'watch', text: 'Student-teacher ratio hit 27.9:1 \u2014 above the board\u2019s threshold.' } },
]
// Orbit geometry from the domain count: planets sit STEP° apart and the system
// turns one STEP per dock — STOPS hand-offs, SPIN° in all (9 → 40°, 8, 320°).
const STEP = 360 / DOMAINS.length
const STOPS = DOMAINS.length - 1
const SPIN = STOPS * STEP
// The Scholar's beats (orbitOwl.js) are scheduled for DOCKS docks; a domain
// added here without bumping DOCKS would put its listen/talk out of step.
if (import.meta.env?.DEV && DOMAINS.length !== DOCKS) {
  console.error(`OrbitScrolly: ${DOMAINS.length} domains but orbitOwl DOCKS = ${DOCKS}`)
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1)
const backOut = (t) => { const c = 1.70158; return 1 + (--t) * t * ((c + 1) * t + c) }
const smooth = (t) => t * t * (3 - 2 * t)
// The heading wraps as it always did (greedy), not under the global v2
// `text-wrap: balance` on h1–h3 — inline, since that rule outranks a utility.
const NO_BALANCE = { textWrap: 'wrap' }

// ── Per-domain payload visualizations — each dock deals in its OWN chart type
// (area, bars, gauge, stacked status, thermometer, milestones, pictogram, peer
// strip), hue-colored and replayed on every dock (the card re-mounts per
// domain key). ───────────────────────────────────────────────────────────────
function VizArea({ hue }) {
  const line = 'M4 44 L64 36 L124 40 L184 24 L244 29 L304 14 L364 18 L436 6'
  return (
    <svg className="h-14 w-full" viewBox="0 0 440 56" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="orbit-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={hue} stopOpacity="0.45" />
          <stop offset="100%" stopColor={hue} stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path
        d={`${line} L436 54 L4 54 Z`}
        fill="url(#orbit-area)"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.5 }}
      />
      <motion.path
        d={line} fill="none" stroke={hue} strokeWidth="2.5" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: 'easeOut' }}
      />
      <motion.circle
        cx="436" cy="6" r="4" fill="#fff"
        initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.85, type: 'spring', stiffness: 300, damping: 16 }}
        style={{ filter: `drop-shadow(0 0 7px ${hue})` }}
      />
    </svg>
  )
}

function VizBars({ hue }) {
  const H = [18, 24, 21, 30, 27, 36, 33, 46]
  return (
    <svg className="h-14 w-full" viewBox="0 0 440 56" preserveAspectRatio="none" aria-hidden="true">
      {H.map((h, i) => (
        <motion.rect
          key={i}
          x={10 + i * 55} width="34" rx="4"
          fill={i === H.length - 1 ? hue : `${hue}55`}
          initial={{ height: 0, y: 54 }}
          animate={{ height: h, y: 54 - h }}
          transition={{ delay: 0.15 + i * 0.07, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          style={i === H.length - 1 ? { filter: `drop-shadow(0 0 8px ${hue})` } : undefined}
        />
      ))}
    </svg>
  )
}

function VizStacked({ hue }) {
  const SEGS = [
    { label: 'Reviewed', w: 62, o: 1 },
    { label: 'Current', w: 26, o: 0.55 },
    { label: 'Due', w: 12, o: 0.25 },
  ]
  return (
    <div aria-hidden="true" className="w-full">
      <div className="flex h-4 w-full gap-1 overflow-hidden rounded-full">
        {SEGS.map((s, i) => (
          <motion.span
            key={s.label}
            className="h-full rounded-full"
            style={{ background: hue, opacity: s.o }}
            initial={{ width: 0 }}
            animate={{ width: `${s.w}%` }}
            transition={{ delay: 0.25 + i * 0.16, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          />
        ))}
      </div>
      <div className="mt-2 flex gap-4">
        {SEGS.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-navy/55">
            <i className="h-1.5 w-1.5 rounded-full" style={{ background: hue, opacity: s.o }} /> {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function VizGauge({ hue }) {
  // Semicircle fully INSIDE the viewBox (chord at y=80, apex at y=14 — the old
  // 0..64 box clipped the arc's crown) + the 87% tip dot on the arc itself.
  const arc = 'M14 80 A66 66 0 0 1 146 80'
  return (
    <svg className="mx-auto h-20" viewBox="0 0 160 92" aria-hidden="true">
      <path d={arc} fill="none" stroke="rgba(16,28,61,0.12)" strokeWidth="9" strokeLinecap="round" />
      <motion.path
        d={arc} fill="none" stroke={hue} strokeWidth="9" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 0.87 }} transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        style={{ filter: `drop-shadow(0 0 8px ${hue}aa)` }}
      />
      <motion.circle
        cx="140.5" cy="54" r="4.5" fill="#fff"
        initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.9, type: 'spring', stiffness: 300, damping: 15 }}
        style={{ filter: `drop-shadow(0 0 6px ${hue})` }}
      />
    </svg>
  )
}

function VizRows({ hue }) {
  const ROWS = [
    { label: 'HVAC', w: 78 },
    { label: 'Roofing', w: 52 },
    { label: 'Grounds', w: 34 },
  ]
  return (
    <div aria-hidden="true" className="w-full space-y-1.5">
      {ROWS.map((r, i) => (
        <div key={r.label} className="flex items-center gap-2.5">
          <span className="w-14 font-mono text-[9.5px] uppercase tracking-[0.08em] text-navy/55">{r.label}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-navy/10">
            <motion.span
              className="block h-full rounded-full"
              style={{ background: `linear-gradient(90deg, ${hue}88, ${hue})` }}
              initial={{ width: 0 }}
              animate={{ width: `${r.w}%` }}
              transition={{ delay: 0.2 + i * 0.14, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function VizThermo({ hue }) {
  return (
    <div aria-hidden="true" className="relative w-full pt-1">
      <div className="h-3.5 w-full overflow-hidden rounded-full bg-navy/10">
        <motion.span
          className="relative block h-full rounded-full"
          style={{ background: `linear-gradient(90deg, ${hue}77, ${hue})` }}
          initial={{ width: 0 }}
          animate={{ width: '72%' }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <motion.span
        className="absolute rounded-full border-2 border-white"
        style={{ background: hue, left: 'calc(72% - 9px)', height: 18, width: 18, top: 1, filter: `drop-shadow(0 0 8px ${hue})` }}
        initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.8, type: 'spring', stiffness: 280, damping: 14 }}
      />
      <span className="absolute right-0 font-mono text-[9.5px] uppercase tracking-[0.1em] text-navy/50" style={{ top: -14 }}>
        goal
      </span>
    </div>
  )
}

function VizMilestones({ hue }) {
  return (
    <div aria-hidden="true" className="relative flex w-full items-center justify-between px-1 py-2">
      <span className="absolute inset-x-2 top-1/2 h-px bg-navy/15" />
      {Array.from({ length: 9 }).map((_, i) => (
        <motion.span
          key={i}
          className="relative h-3 w-3 rotate-45 rounded-[3px]"
          style={{ background: i < 7 ? hue : 'rgba(16,28,61,0.15)', filter: i < 7 ? `drop-shadow(0 0 6px ${hue}aa)` : 'none' }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.15 + i * 0.07, type: 'spring', stiffness: 320, damping: 17 }}
        />
      ))}
    </div>
  )
}

function VizRatio({ hue }) {
  return (
    <div aria-hidden="true" className="flex w-full items-center justify-center gap-1.5 py-2">
      {Array.from({ length: 14 }).map((_, i) => (
        <motion.span
          key={i}
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: `${hue}cc` }}
          initial={{ scale: 0, y: 6 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ delay: 0.12 + i * 0.05, type: 'spring', stiffness: 320, damping: 16 }}
        />
      ))}
      <span className="mx-1 font-mono text-[13px] font-bold text-navy/60">:</span>
      <motion.span
        className="flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] border-white text-white"
        style={{ background: hue }}
        initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.85, type: 'spring', stiffness: 280, damping: 14 }}
      >
        <Users size={11} />
      </motion.span>
    </div>
  )
}

// Standing among peers (Academics): the peer schools as soft hue dots on one
// score scale (anonymous, as the app shows them), your school a glowing hue
// dot that drops in last — drawn in the same hue-lit idiom as the other eight.
function VizStanding({ hue }) {
  const PEERS = [12, 21, 30, 38, 47, 55, 81, 90]
  const YOU = 68
  return (
    <div aria-hidden="true" className="w-full">
      <div className="relative h-6">
        <span className="absolute inset-x-0 top-1/2 h-px bg-navy/15" />
        {PEERS.map((x, i) => (
          <motion.span
            key={x}
            className="absolute top-1/2 -ml-[5px] -mt-[5px] h-2.5 w-2.5 rounded-full"
            style={{ left: `${x}%`, background: `${hue}55` }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.12 + i * 0.06, type: 'spring', stiffness: 320, damping: 16 }}
          />
        ))}
        <motion.span
          className="absolute top-1/2 -ml-[9px] -mt-[9px] rounded-full border-2 border-white"
          style={{ left: `${YOU}%`, height: 18, width: 18, background: hue, filter: `drop-shadow(0 0 8px ${hue})` }}
          initial={{ scale: 0, y: -10 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ delay: 0.7, type: 'spring', stiffness: 280, damping: 14 }}
        />
      </div>
      {/* "Your school" sits under its dot, not at the scale's end. */}
      <div className="relative mt-1 h-4">
        <span className="absolute left-0 font-mono text-[9.5px] uppercase tracking-[0.1em] text-navy/55">Peer schools</span>
        <span
          className="absolute -translate-x-1/2 whitespace-nowrap font-mono text-[9.5px] font-bold uppercase tracking-[0.1em]"
          style={{ left: `${YOU}%`, color: hue }}
        >
          Your school
        </span>
      </div>
    </div>
  )
}

const VIZ = {
  finance: VizArea,
  enrollment: VizBars,
  academics: VizStanding,
  governance: VizStacked,
  accreditation: VizGauge,
  facilities: VizRows,
  advancement: VizThermo,
  strategy: VizMilestones,
  hr: VizRatio,
}

// Payload stat that counts up on every dock.
function CountStat({ target }) {
  const ref = useRef(null)
  useEffect(() => {
    const controls = animate(0, target, {
      duration: 0.65,
      ease: 'easeOut',
      onUpdate: (v) => { if (ref.current) ref.current.textContent = Math.round(v) },
    })
    return () => controls.stop()
  }, [target])
  return <span ref={ref}>0</span>
}

export default function OrbitScrolly() {
  const reduce = useReducedMotion()
  // Below sm the owl perches smaller (its cap clears the wrapped subtitle).
  const phone = useMediaQuery('(max-width: 639px)')

  // Warm the nine photos once the section is near — the backdrop mounts each
  // one at dock time, and a photo that pops in a beat after its own card undoes
  // the deal-in. Fire-and-forget; a failed fetch just means the browser loads
  // it on dock like it would have anyway.
  useEffect(() => {
    for (const { img } of DOMAINS) {
      const el = new Image()
      el.src = img
    }
  }, [])
  const trackRef = useRef(null)
  const stageRef = useRef(null)
  const introRef = useRef(null)
  const sysRef = useRef(null)
  const planetRefs = useRef([])
  const beamRef = useRef(null)
  const beamFlowRef = useRef(null)
  const coreRef = useRef(null)
  const typeRef = useRef(null)
  const payWrapRef = useRef(null)
  const photoWrapRef = useRef(null)
  const flankLRef = useRef(null)
  const flankRRef = useRef(null)
  const finaleRef = useRef(null)

  const { scrollYProgress } = useScroll({ target: trackRef, offset: ['start start', 'end end'] })
  const p = useSpring(scrollYProgress, { stiffness: 120, damping: 24, mass: 0.35 })

  const [active, setActive] = useState(0)
  const [shockKey, setShockKey] = useState(0)
  const activeRef = useRef(0)

  // KYRO's entrance, scrubbed by scroll: as the track rises from the bottom
  // of the viewport to the pin (`approach` 0→1) the Scholar flies in on an arc
  // from past the left edge (wing beating, mirrored to face its travel),
  // glides the last stretch and lands on the core — its own landing one-shot
  // plays the touchdown. Scrolling back up it takes off and flies back out,
  // facing left. The arc is written straight to the wrapper's style (no
  // re-render per frame); React state changes only when the phase or the
  // direction does.
  //
  // A visitor who STOPS mid-arc (the nav's "How it works" anchor lands there)
  // never leaves the owl hanging: after FLIGHT_IDLE_MS the flight finishes by
  // itself — it lands on the core (scrolling down) or flies back out
  // (scrolling up) — and stays there while the scroll carries on the same
  // way. Turning back, the owl rejoins the scrubbed arc with a short chase
  // instead of a jump. `flight` holds { f, mode: scrub|settle|latched|chase }.
  // Phones: 84px, so the perch lift (below) keeps the cap clear of the
  // wrapped subtitle while the owl waves hello.
  const owlSize = phone ? 84 : 140
  const wide = useMediaQuery('(min-width: 1280px)')
  const { scrollYProgress: approachRaw } = useScroll({ target: trackRef, offset: ['start end', 'start start'] })
  const approach = useSpring(approachRaw, { stiffness: 120, damping: 24, mass: 0.35 })
  const flyRef = useRef(null)
  const perchRef = useRef(null)
  const travelRef = useRef({ dir: 1, anchor: 0 })
  const flightRef = useRef({ f: 0, mode: 'scrub', to: null, anim: null, idle: 0 })
  const [flyDir, setFlyDir] = useState(1)
  const [flyPhase, setFlyPhase] = useState('flying')
  const paintFlight = (f, dir) => {
    const pt = flightPoint(f, {
      vw: window.innerWidth,
      vh: window.innerHeight,
      owlW: owlSize * 0.73,
    })
    const el = flyRef.current
    if (el) {
      el.style.transform = `translate3d(${pt.x.toFixed(1)}px, ${pt.y.toFixed(1)}px, 0)`
      el.style.opacity = String(pt.o)
    }
    setFlyPhase(flightPhase(f, dir))
  }
  const paintRef = useRef(paintFlight)
  useEffect(() => {
    paintRef.current = paintFlight
  })
  const runFlight = (to, duration, ease, dir, done) => {
    const F = flightRef.current
    F.anim?.stop()
    F.anim = animate(F.f, to, {
      duration,
      ease,
      onUpdate: (f) => {
        F.f = f
        paintRef.current(f, dir)
      },
      onComplete: done,
    })
  }
  const settleFlight = () => {
    const F = flightRef.current
    const { dir } = travelRef.current
    const to = settleTarget(F.f, dir)
    if (F.mode !== 'scrub' || to == null) return
    F.mode = 'settle'
    F.to = to
    runFlight(to, settleDuration(F.f, to), 'easeInOut', dir, () => {
      F.mode = 'latched'
    })
  }
  useEffect(
    () => () => {
      const F = flightRef.current
      window.clearTimeout(F.idle)
      F.anim?.stop()
    },
    [],
  )
  useMotionValueEvent(approach, 'change', (a) => {
    if (reduce) return
    travelRef.current = travelDir(travelRef.current, a)
    const { dir } = travelRef.current
    const target = flightProgress(a)
    const F = flightRef.current
    window.clearTimeout(F.idle)
    setFlyDir(dir)
    // Carrying on the way it finished (or is finishing): hold there until the
    // scroll catches up, then scrub again.
    if (F.mode === 'settle' || F.mode === 'latched') {
      const sameWay = F.to === 1 ? dir > 0 : dir < 0
      const caughtUp = F.to === 1 ? target >= 1 : target <= 0
      if (caughtUp && F.mode === 'latched') F.mode = 'scrub'
      else if (sameWay) return
      else F.mode = 'chase'
    }
    if (F.mode === 'chase') {
      runFlight(target, 0.35, 'easeOut', dir, () => {
        F.mode = 'scrub'
      })
    } else {
      F.anim?.stop()
      F.f = target
      paintRef.current(target, dir)
    }
    if (settleTarget(target, dir) != null) F.idle = window.setTimeout(settleFlight, FLIGHT_IDLE_MS)
  })

  // Perched, its beat follows the orbit (hello → listen/talk/think per dock →
  // celebrate); see orbitOwl.js. Set only when the beat changes.
  const [owlBeat, setOwlBeat] = useState('arrive')
  const owlBeatRef = useRef('arrive')

  useMotionValueEvent(p, 'change', (v) => {
    const beat = orbitBeat(v)
    if (beat !== owlBeatRef.current) {
      owlBeatRef.current = beat
      setOwlBeat(beat)
    }
    const sys = sysRef.current
    if (!sys) return
    const form = backOut(seg(v, 0, 0.1))
    const collapse = smooth(seg(v, 0.9, 1))
    const mp = seg(v, 0.1, 0.9)
    const spin = mp * SPIN
    const W = sys.clientWidth
    const RX = W * 0.5 - 34
    const RY = RX * 0.46
    const rf = Math.max(form * (1 - collapse), 0.001)
    // Perch lift: the docked planet sits at the ellipse front (y = +RY, scaled
    // ~1.17, layered above the core), so the owl rises just enough for its
    // feet to clear that tile. It rises as the planets come out (they layer
    // above the owl only once rf ≥ 0.85) and settles back as they collapse —
    // so the fly-in still lands exactly on the core.
    const tileReach = (phone ? 40 : 50) * 1.17 // planet centre → tile top (sm+ tiles are bigger)
    const perchLift = Math.max(0, owlSize / 2 + 8 - (RY - tileReach))
    if (perchRef.current) {
      perchRef.current.style.transform = `translate3d(0, ${(-perchLift * clamp(rf / 0.85, 0, 1)).toFixed(1)}px, 0)`
    }
    let frontX = 0
    let frontY = 0

    DOMAINS.forEach((_, i) => {
      const el = planetRefs.current[i]
      if (!el) return
      const a = ((i * STEP - spin + 90) * Math.PI) / 180
      const x = Math.cos(a) * RX * rf
      const y = Math.sin(a) * RY * rf
      const depth = (Math.sin(a) + 1) / 2 // 1 = front (bottom of ellipse)
      const sc = (0.62 + 0.55 * depth) * (form < 1 ? 0.5 + 0.5 * form : 1) * (1 - collapse * 0.7)
      el.style.transform = `translate(${x}px, ${y}px) scale(${sc})`
      // Gathered near the core (formation start / collapse end) the planets sit
      // BEHIND KYRO (z < core's 60) and branch out from it; only once the
      // orbit is formed do front-half passes layer above the owl.
      el.style.zIndex = String(rf < 0.85 ? 10 + Math.round(depth * 20) : 30 + Math.round(depth * 40))
      // Hidden until formation starts, so they never sit stacked on the empty
      // core (labels overprinting) while the owl flies in — they erupt from it.
      el.style.opacity = String((0.45 + 0.55 * depth) * (1 - collapse) * seg(v, 0, 0.02))
      el.style.filter = depth < 0.35 ? 'blur(1.2px)' : 'none'
      if (i === activeRef.current) { frontX = x; frontY = y }
    })

    // Beam: core → docked planet, visible only mid-stop (retracts in transit).
    const stopP = (mp * STOPS) % 1
    const midStop = (stopP > 0.18 && stopP < 0.82) || mp === 0 || mp === 1
    const show = mp > 0 && collapse === 0 && form >= 1 && midStop
    const cx = W / 2
    const cy = sys.clientHeight / 2
    ;[beamRef.current, beamFlowRef.current].forEach((l) => {
      if (!l) return
      l.setAttribute('x1', cx)
      l.setAttribute('y1', cy)
      l.setAttribute('x2', cx + frontX)
      l.setAttribute('y2', cy + frontY)
      l.style.opacity = show ? 1 : 0
    })

    // Dock: active index change → React state (payload/photo/type/shockwave).
    const idx = clamp(Math.round(mp * STOPS), 0, STOPS)
    if (mp > 0 && idx !== activeRef.current) {
      activeRef.current = idx
      setActive(idx)
      setShockKey((k) => k + 1)
    }

    // Giant type, core scale, payload + finale opacity.
    // Giant type is GONE before the finale card arrives (no ghost "HR" hanging
    // behind the briefing) — and before the Scholar's cap toss starts (the
    // celebrate beat, v ≥ 0.9): its spread wings + confetti would otherwise sit
    // right on top of the word. The last dock (HR, v ≈ 0.872) still shows it
    // in full; only the fade's tail is shortened (0.93 → 0.90).
    if (typeRef.current) typeRef.current.style.opacity = String(seg(v, 0.1, 0.14) * (1 - seg(v, 0.88, 0.9)))
    if (introRef.current) introRef.current.style.opacity = String(1 - seg(v, 0.05, 0.11))
    if (coreRef.current) {
      coreRef.current.style.transform = `scale(${1 + 0.5 * collapse})`
      // The Scholar's cap toss plays 0.90–0.93; the owl is gone by 0.95 so no
      // ghost of the cap hangs above the finale card (which arrives 0.94–1).
      coreRef.current.style.opacity = String(1 - seg(v, 0.93, 0.95))
    }
    const payO = String(seg(v, 0.1, 0.14) * (1 - seg(v, 0.88, 0.94)))
    if (payWrapRef.current) payWrapRef.current.style.opacity = payO
    // The flanking panels ride the same window as the payload card.
    if (flankLRef.current) flankLRef.current.style.opacity = payO
    if (flankRRef.current) flankRRef.current.style.opacity = payO
    // The backdrop photograph rides the FORMATION: it fades in as the planets
    // erupt from behind KYRO (the same 0→0.1 window `form` runs on), so the
    // room fills with Finance while the system is assembling — not a beat after
    // it. Stays through the finale (the briefing floats over the last scene).
    if (photoWrapRef.current) photoWrapRef.current.style.opacity = String(seg(v, 0.02, 0.1))
    if (finaleRef.current) {
      const f = seg(v, 0.94, 1)
      finaleRef.current.style.opacity = String(f)
      finaleRef.current.style.transform = `translate(-50%, -50%) scale(${0.6 + 0.4 * backOut(f)})`
    }
  })

  const d = DOMAINS[active]
  // In the air it faces its travel; perched, the orbit beat sets its mood.
  const perchedOwl = beatOwl(owlBeat, { wide })
  const owl =
    flyPhase === 'perched'
      ? perchedOwl
      : { facing: flyDir < 0 ? 'left' : 'right', moodHold: true }
  // The dock shockwave: a centred CIRCLE (not the owl's tall box) about the
  // owl's width, expanding once per dock.
  const shock = Math.round(owlSize * 0.73)

  // ── Reduced motion: one static, settled composition — no pin, no scrub. ────
  if (reduce) {
    return (
      // Top padding clears the hero's straddling card (its -mb overhang lands
      // here) — the same pt-* as the animated branch; py-24 let it cover the
      // heading at lg.
      <section id="how-it-works" aria-labelledby="orbit-h2" className="relative scroll-mt-20 overflow-hidden bg-[#e9f0fb] pb-24 pt-44 text-[17px] leading-[1.65] sm:pt-56 lg:pt-64">
        <div className="mx-auto max-w-4xl px-5 text-center sm:px-8">
          <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-[#7a5e00]">One AI · Nine domains</p>
          <h2 id="orbit-h2" className="mt-3 font-sans text-[32px] font-semibold leading-tight tracking-[-0.02em] text-navy sm:text-[42px]" style={NO_BALANCE}>
            Everything orbits KYRO.
          </h2>
          <div className="mx-auto mt-10 flex max-w-2xl flex-wrap items-center justify-center gap-3">
            {/* Reduced motion: the still Scholar (never in the animation loop). */}
            <PennyAvatar size={72} state="perched" />
            {DOMAINS.map((dom) => (
              <span key={dom.key} className="inline-flex items-center gap-2 rounded-full border border-navy/20 px-3 py-1.5 text-[13px] font-semibold text-navy/80">
                <dom.Icon size={14} style={{ color: dom.hue }} aria-hidden="true" /> {dom.label}
              </span>
            ))}
          </div>
        </div>
      </section>
    )
  }

  return (
    // Top padding clears the hero's straddling glass card (its -mb overhang
    // lands on this section). The heading lives INSIDE the pinned stage — no
    // standalone header block, no dead empty viewport before the scene.
    <section id="how-it-works" aria-labelledby="orbit-h2" className="relative scroll-mt-20 bg-[#e9f0fb] pt-44 text-[17px] leading-[1.65] sm:pt-56 lg:pt-64">
      <div ref={trackRef} className="relative h-[560vh]">
        <div
          ref={stageRef}
          className="sticky top-0 flex h-screen flex-col items-center justify-center overflow-hidden"
          style={{ background: 'linear-gradient(168deg, #f4f7fd 0%, #e2ebf9 55%, #d4e1f6 100%)' }}
        >
          {/* ── The module's PHOTOGRAPH, as the whole section's backdrop ──────
              Fills the pinned frame — all the whitespace around the system —
              and crossfades on every dock. Under a light veil, because the
              scene on top is pastel UI with navy type: the photo is meant to
              read as context, not compete as content. The veil is lightest at
              the edges (where there is only whitespace) and densest in the
              middle (where the orbit, giant type and payload card live), and it
              carries the dock's hue radial so the docked-domain glow still
              tints the room. The stage keeps its plain gradient underneath as
              the first-paint fallback while a photo streams in. STARTS
              INVISIBLE (opacity 0, handler-written): the very first frame
              belongs to KYRO alone — the photograph fades in WITH the planets'
              eruption, so the room fills with Finance as the system assembles. */}
          <div ref={photoWrapRef} aria-hidden="true" className="absolute inset-0 z-0 overflow-hidden" style={{ opacity: 0 }}>
            <AnimatePresence initial={false}>
              <motion.img
                key={d.key}
                src={d.img}
                alt=""
                draggable="false"
                initial={{ opacity: 0, scale: 1.06 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-0 h-full w-full object-cover"
              />
            </AnimatePresence>
            <div
              className="absolute inset-0 transition-[background] duration-1000"
              style={{
                // Centre stays milky enough for navy type and the pastel card;
                // the edges drop to a light haze so the image reads as a scene.
                background: `radial-gradient(760px 540px at 50% 34%, ${d.hue}30, transparent 65%), radial-gradient(105% 80% at 50% 45%, rgba(240,245,252,0.82) 28%, rgba(236,242,251,0.46) 60%, rgba(233,240,251,0.16) 100%)`,
              }}
            />
          </div>
          {/* The heading, lowered INTO the scene: overlays the stage top during
              KYRO's entrance + formation, fades as the first dock lands. */}
          <div
            ref={introRef}
            className="pointer-events-none absolute inset-x-0 top-[7%] z-[80] px-5 text-center"
          >
            <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-[#7a5e00]">One AI · Nine domains</p>
            <h2 id="orbit-h2" className="mt-2.5 font-sans text-[30px] font-semibold leading-tight tracking-[-0.02em] text-navy sm:text-[42px]" style={NO_BALANCE}>
              Everything orbits KYRO.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
              Nine domains, one AI at the center. Scroll — every one of them docks, hands its
              numbers to KYRO, and lands in a single morning briefing.
            </p>
          </div>
          {/* Domain watermark behind the system: CONTAINED bold type with a
              hue→navy gradient FILL clipped to the glyphs and a radial mask so
              it dissolves at the edges instead of hitting the viewport crop.
              Rises softly on each dock. The OUTER wrapper owns visibility
              (handler-written, STARTS hidden — the inner framer entrance
              animates on mount and would otherwise show the type before any
              scroll event fires). */}
          <div
            ref={typeRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-[21%] z-0"
            style={{ opacity: 0 }}
          >
            <AnimatePresence mode="popLayout">
              <motion.div
                key={d.key}
                initial={{ y: 26, opacity: 0, scale: 0.97 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: -20, opacity: 0 }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className="mx-auto w-max select-none whitespace-nowrap font-sans font-bold uppercase"
                style={{
                  fontSize: 'clamp(52px, 8.4vw, 128px)',
                  letterSpacing: '0.06em',
                  backgroundImage: `linear-gradient(180deg, ${d.hue}a6 0%, rgba(16,28,61,0.38) 60%, rgba(16,28,61,0.12) 100%)`,
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                  maskImage: 'radial-gradient(72% 90% at 50% 50%, #000 55%, transparent 100%)',
                  WebkitMaskImage: 'radial-gradient(72% 90% at 50% 50%, #000 55%, transparent 100%)',
                }}
              >
                {d.label}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* The system: beam + core + planets (the motion itself draws the
              orbit — no rings). */}
          <div ref={sysRef} aria-hidden="true" className="relative z-[2] w-[min(560px,92vw)] flex-none" style={{ aspectRatio: '1 / 0.78' }}>
            <svg className="pointer-events-none absolute inset-0 z-[40] h-full w-full overflow-visible">
              {/* opacity 0 initially — a zero-length round-cap line paints a dot
                  at the svg origin before the first handler write. */}
              <line ref={beamRef} strokeWidth="3" strokeLinecap="round" style={{ stroke: d.hue, filter: `drop-shadow(0 0 8px ${d.hue})`, transition: 'opacity .3s', opacity: 0 }} />
              <line ref={beamFlowRef} className="orbit-beam-flow" stroke="#fff" strokeWidth="3" strokeLinecap="round" style={{ transition: 'opacity .3s', opacity: 0 }} />
            </svg>

            {/* Core: KYRO + the dock shockwave (one ring per dock, one-shot).
                No disc behind the owl — it sits on the scene alone. */}
            <div className="absolute left-1/2 top-1/2 z-[60] -translate-x-1/2 -translate-y-1/2">
              <div ref={coreRef} className="relative will-change-transform">
                {/* The perch lift (handler-written) keeps the owl's feet above
                    the docked planet; the ring rides with the owl. */}
                <div ref={perchRef} className="relative will-change-transform">
                  {/* The scroll-scrubbed flight (transform + opacity written by
                      the approach handler; starts hidden at the arc's start). No
                      squash here: the Scholar's own landing plays the touchdown. */}
                  <div ref={flyRef} className="will-change-transform" style={{ opacity: 0 }}>
                    <PennyAvatar size={owlSize} state={flyPhase} {...owl} />
                  </div>
                  {/* Centred by margins, not translate: the keyframe owns transform. */}
                  <span
                    key={shockKey}
                    className="orbit-shock pointer-events-none absolute left-1/2 top-1/2 rounded-full border-2"
                    style={{ borderColor: d.hue, width: shock, height: shock, marginLeft: -shock / 2, marginTop: -shock / 2 }}
                  />
                </div>
              </div>
            </div>

            {/* Planets: translucent navy at rest; the docked one fills with its
                hue and glows. */}
            {DOMAINS.map((dom, i) => {
              const { key, label, hue } = dom
              const on = i === active
              return (
                <div
                  key={key}
                  ref={(el) => (planetRefs.current[i] = el)}
                  className="absolute left-1/2 top-1/2 -m-10 w-20 text-center will-change-transform sm:-m-12 sm:w-24"
                  style={{ opacity: 0 }}
                >
                  <span
                    className="mx-auto flex h-14 w-14 items-center justify-center rounded-[16px] border-[1.5px] backdrop-blur-sm transition-all duration-500 sm:h-[68px] sm:w-[68px] sm:rounded-[20px]"
                    style={
                      on
                        ? { background: hue, borderColor: '#fff', color: '#fff', boxShadow: `0 0 40px ${hue}, 0 0 90px ${hue}88` }
                        : { background: 'rgba(16,28,61,0.06)', borderColor: 'rgba(16,28,61,0.16)', color: '#16284f' }
                    }
                  >
                    <dom.Icon className="h-6 w-6 sm:h-7 sm:w-7" />
                  </span>
                  <span
                    className={`mt-1.5 block whitespace-nowrap font-mono text-[10.5px] tracking-[0.06em] transition-colors duration-500 ${on ? 'font-bold text-navy' : 'text-navy/60'}`}
                  >
                    {label}
                  </span>
                </div>
              )
            })}
          </div>

          {/* ── The flanking panels: WHAT IT DOES (left) and the module in
              practice as a real briefing item (right). Absolutely placed so the
              orbit's trig layout is untouched; hidden below xl where there is
              no room beside the system. Both re-mount per dock, sliding in from
              their own side, and ride the payload card's opacity ramp.
              ANCHORED OFF CENTER (calc(50% ± 330px)) so on an ultrawide they
              hug the system instead of drifting to the screen edge. */}
          <div
            ref={flankLRef}
            className="pointer-events-none absolute right-[calc(50%+330px)] top-1/2 z-[3] hidden w-[300px] -translate-y-1/2 xl:block"
            style={{ opacity: 0 }}
          >
            <AnimatePresence mode="popLayout">
              <motion.div
                key={d.key}
                initial={{ x: -36, opacity: 0, rotate: -2.5, scale: 0.95 }}
                animate={{ x: 0, opacity: 1, rotate: 0, scale: 1 }}
                exit={{ x: -20, opacity: 0, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              >
                {/* Gentle idle float, offset from the right panel's phase so the
                    pair breathes rather than bounces in lockstep. */}
                <motion.div
                  animate={{ y: [0, -7, 0] }}
                  transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
                  className="relative overflow-hidden rounded-[16px] border px-5 py-4 backdrop-blur-md"
                  style={{
                    borderColor: `${d.hue}33`,
                    background: `linear-gradient(160deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.78) 60%, ${d.hue}14 100%)`,
                    boxShadow: `0 24px 60px -24px rgba(16,28,61,0.35), 0 0 40px -18px ${d.hue}66`,
                  }}
                >
                  <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${d.hue}, transparent)` }} />
                  {/* The beam toward the core — these panels ORBIT the system,
                      they are not stray cards. */}
                  <span aria-hidden="true" className="absolute left-full top-1/2 h-px w-9 -translate-y-1/2" style={{ background: `linear-gradient(90deg, ${d.hue}88, transparent)` }} />
                  <p className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: d.hue }}>
                    <span aria-hidden="true" className="inline-block h-[7px] w-[7px] rounded-full" style={{ backgroundColor: d.hue, boxShadow: `0 0 8px ${d.hue}` }} />
                    What it does
                  </p>
                  <ul className="mt-2.5 space-y-2.5">
                    {d.points.map((pt) => (
                      <li key={pt} className="flex items-start gap-2.5 text-[13px] leading-snug text-navy/80">
                        <span aria-hidden="true" className="mt-[5px] h-[7px] w-[7px] shrink-0 rounded-full" style={{ backgroundColor: d.hue }} />
                        {pt}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              </motion.div>
            </AnimatePresence>
          </div>

          <div
            ref={flankRRef}
            className="pointer-events-none absolute left-[calc(50%+330px)] top-1/2 z-[3] hidden w-[300px] -translate-y-1/2 xl:block"
            style={{ opacity: 0 }}
          >
            <AnimatePresence mode="popLayout">
              <motion.div
                key={d.key}
                initial={{ x: 36, opacity: 0, rotate: 2.5, scale: 0.95 }}
                animate={{ x: 0, opacity: 1, rotate: 0, scale: 1 }}
                exit={{ x: 20, opacity: 0, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              >
                <motion.div
                  animate={{ y: [0, -7, 0] }}
                  transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut', delay: 1.6 }}
                  className="relative overflow-hidden rounded-[16px] border px-5 py-4 backdrop-blur-md"
                  style={{
                    borderColor: `${d.hue}33`,
                    background: `linear-gradient(200deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.78) 60%, ${d.hue}14 100%)`,
                    boxShadow: `0 24px 60px -24px rgba(16,28,61,0.35), 0 0 40px -18px ${d.hue}66`,
                  }}
                >
                  <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${d.hue}, transparent)` }} />
                  <span aria-hidden="true" className="absolute right-full top-1/2 h-px w-9 -translate-y-1/2" style={{ background: `linear-gradient(270deg, ${d.hue}88, transparent)` }} />
                  <p className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: d.hue }}>
                    <span aria-hidden="true" className="inline-block h-[7px] w-[7px] rounded-full" style={{ backgroundColor: d.hue, boxShadow: `0 0 8px ${d.hue}` }} />
                    In your morning briefing
                  </p>
                  {/* One attention item, the way the app actually renders one:
                      severity dot, the sentence, and where it takes you. */}
                  <div className="mt-2.5 rounded-[12px] border border-navy/10 bg-white px-3.5 py-3">
                    <div className="flex items-start gap-2.5">
                      <span
                        aria-hidden="true"
                        className="mt-[5px] h-[8px] w-[8px] shrink-0 rounded-full"
                        style={{ backgroundColor: d.brief.sev === 'critical' ? '#ef4444' : d.brief.sev === 'watch' ? '#f59e0b' : '#3b82f6' }}
                      />
                      <p className="text-[13px] font-medium leading-snug text-navy">{d.brief.text}</p>
                    </div>
                    <p className="mt-2 pl-[18px] font-mono text-[10.5px] uppercase tracking-[0.12em] text-navy/45">
                      {d.brief.sev === 'critical' ? 'Needs a decision' : d.brief.sev === 'watch' ? 'Worth watching' : 'Good news travels too'} · {d.label}
                    </p>
                  </div>
                  <p className="mt-2.5 text-[12px] leading-snug text-navy/55">
                    KYRO reads this domain every morning and says only what needs saying.
                  </p>
                </motion.div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Live payload card — deals in on every dock. The wrapper has a
              FIXED height (the Finance card's, so the stage sits exactly where
              the original orbit placed it) and a taller chart simply hangs
              below it: a card of another height never re-centres the stage and
              jolts the orbit (and the Scholar perched on it) at a dock. */}
          <div ref={payWrapRef} className="relative z-[3] mt-3 h-[183px] w-[min(500px,90vw)] sm:h-[187px]" style={{ opacity: 0 }}>
            <motion.div
              key={d.key}
              initial={{ y: 16, rotate: -1.2, opacity: 0.2 }}
              animate={{ y: 0, rotate: 0, opacity: 1 }}
              transition={{ duration: 0.42, ease: [0.2, 0.9, 0.2, 1] }}
              className="relative grid grid-cols-[1fr_auto] items-center gap-x-5 gap-y-1 overflow-hidden rounded-[16px] border border-navy/10 bg-white/80 px-6 py-4 shadow-[0_24px_60px_-24px_rgba(16,28,61,0.35)] backdrop-blur-md"
            >
              {/* Domain-hue hairline across the card's top edge. */}
              <span
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-px"
                style={{ background: `linear-gradient(90deg, transparent, ${d.hue}, transparent)` }}
              />
              <b className="font-sans text-[24px] font-semibold tracking-[-0.02em] text-navy">{d.label}</b>
              <div className="col-start-2 row-span-2 text-right">
                <b className="font-sans text-[36px] tabular-nums tracking-[-0.02em] text-[#8a6a20]"><CountStat target={d.stat} /></b>
                <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-navy/55">{d.unit}</span>
              </div>
              <p className="col-start-1 text-[13.5px] leading-snug text-muted">{d.line}</p>
              {/* Each domain deals in its OWN chart (area/bars/gauge/…), hue-lit. */}
              <div className="col-span-2 mt-3">
                {(() => { const Viz = VIZ[d.key]; return <Viz hue={d.hue} /> })()}
              </div>
            </motion.div>
          </div>

          {/* Collapse finale: the system becomes tomorrow's briefing — styled
              like the briefing hero (aurora ribbons + gradient CTA), floating
              over the last scene. */}
          <div
            ref={finaleRef}
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-[42%] z-[70] w-[min(560px,90vw)] opacity-0"
          >
            <div
              className="relative overflow-hidden rounded-[16px] border border-penny/60 bg-navy-gradient px-7 py-7 text-center sm:px-10"
              style={{ boxShadow: '0 0 90px rgba(212,180,122,0.35), 0 30px 80px -20px rgba(0,0,0,0.6)' }}
            >
              <ClassicAuroraFlow />
              <div className="relative">
                <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.22em] text-penny-light">
                  <Sparkles size={12} /> Daily briefing · 7:02 AM
                </span>
                <b className="mt-2.5 block font-sans text-[clamp(20px,3.2vw,30px)] font-semibold leading-tight tracking-[-0.02em] text-white">
                  Good morning — 3 things need a decision.
                </b>
                <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed text-white/70">
                  Every domain you just watched dock — distilled into one morning read.
                </p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  {/* Labels, not buttons: this whole layer is aria-hidden +
                      pointer-events-none, so nothing here presses. */}
                  <span
                    className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13.5px] font-semibold text-white"
                    style={{ backgroundImage: 'linear-gradient(100deg, #3b6ef5 0%, #8b5cf6 52%, #ff6b5c 100%)', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.25), 0 4px 6px -4px rgba(0,0,0,0.25)' }}
                  >
                    <Play size={14} className="fill-current" /> Open Daily Briefing
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-penny/40 bg-penny/10 px-3.5 py-2 text-[12.5px] font-semibold text-penny-light">
                    <Clock size={13} /> 2 min read
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
