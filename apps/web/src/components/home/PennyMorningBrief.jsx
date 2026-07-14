// ─────────────────────────────────────────────────────────────────────────────
// PennyMorningBrief — "Penny narrates the briefing". A navy-glass hero that sits
// above the triage board on Home (scope="school") and OrgHome / the Budget org
// tab (scope="org"). It fetches a SERVER-COMPOSED, value-validated narration of
// the exact lens-shaped attention briefing and renders it as flowing prose Penny
// can also read aloud — segment-by-segment, karaoke-highlighting the live line and
// (via 'penny:narrate-active') gold-ringing the matching triage card below.
//
//   • Prefetch on mount; shimmer while loading; full TEXT with no click needed.
//   • Play / Pause gold pill + 4-bar equalizer (existing TTS stack; click-to-play,
//     never autoplay). Active segment lit (gold rail), siblings dimmed.
//   • Item segments are interactive: while playing a click skips the voice there;
//     otherwise it navigates into item.link (org shows a school chip).
//   • ↻ regenerates; "Discuss with Penny →" hands off to the chat (penny:ai-ask).
//   • Zero items → an all-clear celebration. Hard error → renders null (fail-soft).
//   • Listens for 'penny:narrate' (from the "Brief me" CTAs) to scroll in + play.
//   • Reduced-motion safe; llm vs template render identically (no scary badge).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  MessagesSquare,
  Building2,
  ArrowUpRight,
  Crown,
  Calculator,
  Users,
} from 'lucide-react'
import PennyAvatar from '../penny/PennyAvatar.jsx'
import { WhyText } from '../ui/briefingFx.jsx'
import { useBriefingNarration } from '../../hooks/useBriefingNarration.js'
import { useNarrationPlayer } from '../penny/hooks/useNarrationPlayer.js'

// The active school (org scope reuses its content-agnostic TTS proxy; null just
// falls the transport back to the browser voice — still fully usable).
function activeSchoolId() {
  try {
    return localStorage.getItem('finrep_active_school_id') || null
  } catch {
    return null
  }
}

function fyLabel(fiscalYearStart) {
  if (!fiscalYearStart) return null
  const start = Number(String(fiscalYearStart).split('-')[0])
  return Number.isFinite(start) ? `FY ${start + 1}` : null
}

// Dark-surface lens chip (the light LensIndicator's navy/gold text is invisible on
// this deep-navy hero — same idiom as HomeCommandCenter's LensBadge).
const LENS_CHIP = {
  owner: { label: 'Leadership view', Icon: Crown },
  accountant: { label: 'Finance view', Icon: Calculator },
  viewer: { label: 'Board view', Icon: Users },
}
function LensChip({ lens }) {
  const meta = LENS_CHIP[lens]
  if (!meta) return null
  const { label, Icon } = meta
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-penny/40 bg-penny/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-penny-light"
      title={`This brief is shaped for the ${label}.`}
    >
      <Icon size={12} className="text-penny-light" />
      {label}
    </span>
  )
}

const SEV_DOT = {
  critical: 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.7)]',
  warn: 'bg-penny shadow-[0_0_8px_rgba(184,150,80,0.6)]',
  info: 'bg-white/50',
}

// The animated 4-bar equalizer shown while Penny speaks (CSS keyframes; static
// under reduced motion). Purely decorative.
function Equalizer({ playing }) {
  return (
    <span aria-hidden className="inline-flex items-end gap-[3px]" style={{ height: 16 }}>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={`w-[3px] rounded-full bg-penny-light ${playing ? 'nb-eq-bar' : ''}`}
          style={{ height: playing ? 16 : 5, animationDelay: `${i * 0.13}s` }}
        />
      ))}
    </span>
  )
}

function SegmentText({ text }) {
  return (
    <span className="font-serif text-[16px] leading-relaxed text-white/90 sm:text-[17px]">
      <WhyText text={text} tone="dark" />
    </span>
  )
}

// Org attribution reads as a consistent leading chip per point, so the school is
// stripped from the DISPLAYED sentence to avoid saying it twice. Only the common
// lead-ins are handled; anything else is left intact (graceful). The spoken brief
// still uses the full segment text — the school is always heard.
function capitalizeFirst(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}
function stripLeadingSchool(text, name) {
  if (!name) return text
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(`^\\s*at\\s+${esc}\\s*[,:]\\s*`, 'i'), // "At {name}, " / "At {name}: "
    new RegExp(`^\\s*${esc}['’]s\\s+`, 'i'), // "{name}'s "
    new RegExp(`^\\s*${esc}\\s+(?=(?:has|is|now|also|reports?|shows?|carries)\\b)`, 'i'), // "{name} has/is …"
  ]
  for (const re of patterns) {
    const t = text.replace(re, '')
    if (t !== text) return capitalizeFirst(t)
  }
  return text
}

// What Penny "is doing" while the narration endpoint composes the brief — cycled
// every ~1.7s so the wait reads as work happening, not a dead box.
const COMPOSING_STEPS = [
  'Reading your latest numbers…',
  'Ranking what needs a decision…',
  'Checking compliance and deadlines…',
  'Writing your brief…',
]

// The branded loading state for the brief popup. Module-scope (owns a timer hook,
// so it can't live inside the parent's conditional return). role=status so screen
// readers hear one polite announcement instead of the cycling line.
function ComposingCard({ reduce }) {
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (reduce) return undefined
    const t = window.setInterval(() => setStep((s) => (s + 1) % COMPOSING_STEPS.length), 1700)
    return () => window.clearInterval(t)
  }, [reduce])

  return (
    <section
      data-testid="penny-morning-brief"
      data-playing="false"
      role="status"
      aria-label="Penny is preparing your brief"
      className="no-print relative overflow-hidden rounded-2xl bg-navy-gradient p-5 shadow-navy-glow sm:p-7"
    >
      <div className="flex items-center gap-4">
        <span className="relative shrink-0">
          <span
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-[130%] w-[130%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-penny/25 blur-xl"
          />
          <PennyAvatar size={56} active listening={!reduce} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-serif text-[18px] font-semibold leading-snug text-white sm:text-[20px]">
            Penny is putting your brief together
            {!reduce && (
              <span aria-hidden className="inline-flex w-6 justify-start">
                <motion.span
                  animate={{ opacity: [0.2, 1, 0.2] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                >
                  …
                </motion.span>
              </span>
            )}
          </p>
          <div className="mt-1 min-h-[20px]" aria-hidden>
            {reduce ? (
              <p className="text-[13.5px] text-penny-light/90">{COMPOSING_STEPS[0]}</p>
            ) : (
              <AnimatePresence mode="wait" initial={false}>
                <motion.p
                  key={step}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.3 }}
                  className="text-[13.5px] text-penny-light/90"
                >
                  {COMPOSING_STEPS[step]}
                </motion.p>
              </AnimatePresence>
            )}
          </div>
          {/* The brief taking shape underneath. */}
          <div className="mt-3 space-y-2" aria-hidden>
            <div className="shimmer-bar h-3 w-3/4 rounded" />
            <div className="shimmer-bar h-3 w-2/3 rounded" />
          </div>
        </div>
      </div>
    </section>
  )
}

export default function PennyMorningBrief({
  scope = 'school',
  schoolId = null,
  periodId = null,
  orgId = null,
  fiscalYearStart = null,
  lens = null,
}) {
  const reduce = useReducedMotion()
  const navigate = useNavigate()

  const { data, segments, loading, error, reload } = useBriefingNarration({
    scope,
    schoolId,
    periodId,
    orgId,
    fiscalYearStart,
    lens,
  })

  const ttsSchoolId = scope === 'org' ? activeSchoolId() : schoolId
  const player = useNarrationPlayer(segments, ttsSchoolId)

  const rootRef = useRef(null)
  const wantPlayRef = useRef(false)
  // Latest player + segments in refs so the 'penny:narrate' listener registers once
  // yet always drives the current playhead.
  const playerRef = useRef(player)
  const segsRef = useRef(segments)
  useEffect(() => {
    playerRef.current = player
  })
  useEffect(() => {
    segsRef.current = segments
  })

  // 'penny:narrate' (from the "Brief me" CTAs): scroll the card in + start playback.
  // The dispatch happens inside the CTA's click, so this runs within the user-
  // gesture window that lets audio prime.
  useEffect(() => {
    const onNarrate = () => {
      const el = rootRef.current
      if (el) el.scrollIntoView(reduce ? { block: 'start' } : { block: 'start', behavior: 'smooth' })
      if (segsRef.current.length) playerRef.current.play()
      else wantPlayRef.current = true
    }
    window.addEventListener('penny:narrate', onNarrate)
    return () => window.removeEventListener('penny:narrate', onNarrate)
  }, [reduce])

  // If "Brief me" was hit before the narration finished loading, play once it lands.
  useEffect(() => {
    if (wantPlayRef.current && segments.length) {
      wantPlayRef.current = false
      playerRef.current.play()
    }
  }, [segments])

  // Fail-soft: a hard error with nothing to show collapses the card entirely.
  if (error && !data) return null

  if (loading && !data) {
    return <ComposingCard reduce={reduce} />
  }

  if (!data) return null

  const summary = data.summary || { total: 0, critical: 0, warn: 0, info: 0 }
  const isZero = (summary.total ?? 0) === 0
  const periodChip =
    scope === 'org'
      ? fyLabel(data.fiscalYearStart || fiscalYearStart)
      : data.periodLabel || null

  const discussWithPenny = () => {
    window.dispatchEvent(
      new CustomEvent('penny:ai-ask', {
        detail: { text: 'Brief me on what needs my attention.' },
      }),
    )
  }

  const onPlayToggle = () => {
    if (player.playing) player.pause()
    else player.play()
  }

  const onSegmentClick = (idx, seg) => {
    if (seg.kind !== 'item') return
    if (player.playing) player.skipTo(idx)
    else if (seg.link) navigate(seg.link)
  }

  return (
    <motion.section
      ref={rootRef}
      data-testid="penny-morning-brief"
      data-playing={player.playing ? 'true' : 'false'}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="no-print relative overflow-hidden rounded-2xl bg-navy-gradient p-5 shadow-navy-glow sm:p-6"
    >
      {/* Decorative navy-glass depth: a gold top hairline + a faint gold radial. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(214,178,92,0.55), transparent)' }}
      />
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-navy-radial opacity-70" />

      <div className="relative flex flex-col gap-4">
        {/* Header: avatar + eyebrow/chips on the left, controls on the right. */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <motion.div
              className="relative shrink-0"
              animate={reduce || !player.playing ? undefined : { y: [0, -5, 0] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
            >
              <PennyAvatar size={54} speaking={player.playing} celebrate={isZero} active />
            </motion.div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.16em] text-penny/85">
                  <Sparkles size={13} className="text-penny" />
                  Penny&rsquo;s morning brief
                </span>
                {periodChip && (
                  <span className="rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/70">
                    {periodChip}
                  </span>
                )}
              </div>
              <div className="mt-1.5">
                <LensChip lens={data.lens} />
              </div>
            </div>
          </div>

          {/* Controls: Play/Pause + equalizer, and regenerate. */}
          <div className="flex items-center gap-2">
            {player.supported && (
              <button
                type="button"
                onClick={onPlayToggle}
                aria-label={player.playing ? 'Pause the morning brief' : 'Play the morning brief'}
                className="group inline-flex items-center gap-2 rounded-full bg-penny-gradient px-4 py-2 text-[13px] font-semibold text-navy shadow-penny-glow transition-transform hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-penny/60 motion-reduce:hover:translate-y-0"
              >
                {player.playing ? <Pause size={15} /> : <Play size={15} />}
                <span>{player.playing ? 'Pause' : 'Play'}</span>
                {player.playing && <Equalizer playing />}
              </button>
            )}
            <button
              type="button"
              onClick={() => reload(true)}
              aria-label="Regenerate the morning brief"
              title="Regenerate"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-white/70 transition-colors hover:border-penny/50 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-penny/50"
            >
              <RotateCcw size={15} />
            </button>
          </div>
        </div>

        {/* The narration itself. */}
        <div className="space-y-2.5">
          {segments.map((seg, i) => {
            const isItem = seg.kind === 'item'
            const orgSchool = isItem && scope === 'org' ? seg.schoolName : null
            const displayText = orgSchool ? stripLeadingSchool(seg.text, orgSchool) : seg.text
            const active = player.playing && player.activeIndex === i
            const dimmed = player.playing && player.activeIndex !== i
            const rowBase =
              'relative rounded-lg py-1.5 pl-3.5 pr-2 transition-all duration-300 border-l-2'
            const rowState = active
              ? 'border-penny bg-white/[0.05]'
              : 'border-transparent'
            const opacity = dimmed ? 'opacity-60' : 'opacity-100'

            const inner = (
              <motion.div
                key={`${seg.kind}-${seg.itemId ?? i}`}
                data-narration-item={isItem ? seg.itemId : undefined}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: dimmed ? 0.6 : 1, y: 0 }}
                transition={{ duration: 0.4, delay: reduce ? 0 : Math.min(i, 8) * 0.08 }}
                className={`${rowBase} ${rowState} ${opacity} ${isItem ? 'group cursor-pointer hover:bg-white/[0.06]' : ''}`}
                onClick={isItem ? () => onSegmentClick(i, seg) : undefined}
                role={isItem ? 'button' : undefined}
                tabIndex={isItem ? 0 : undefined}
                onKeyDown={
                  isItem
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onSegmentClick(i, seg)
                        }
                      }
                    : undefined
                }
              >
                <div className="flex items-start gap-2.5">
                  {isItem && (
                    <span
                      aria-hidden
                      className={`mt-2 h-2 w-2 shrink-0 rounded-full ${SEV_DOT[seg.severity] ?? SEV_DOT.info}`}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    {/* Org: one consistent leading school chip per point, so
                        attribution reads the same on every row instead of trailing
                        at a ragged wrap position. */}
                    {orgSchool && (
                      <span className="mb-1 flex w-fit max-w-full items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.07em] text-penny-light/90 ring-1 ring-white/10">
                        <Building2 size={10} className="shrink-0" />
                        <span className="truncate">{orgSchool}</span>
                      </span>
                    )}
                    <SegmentText text={displayText} />
                    {isItem && (
                      <span className="ml-1.5 inline-flex translate-y-[1px] items-center align-middle text-penny-light opacity-0 transition-opacity group-hover:opacity-100">
                        <ArrowUpRight size={13} />
                      </span>
                    )}
                  </div>
                </div>
                {/* Underline that grows on hover — the "jump into item" affordance. */}
                {isItem && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute bottom-0 left-3.5 h-px w-0 bg-penny-light/70 transition-all duration-300 group-hover:w-[calc(100%-1.5rem)]"
                  />
                )}
              </motion.div>
            )
            return inner
          })}
        </div>

        {/* Footer: hand off to conversational Penny. (The "+N more on your board
            below" tail is already spoken in the closing segment, so no chip here.) */}
        <div className="flex items-center border-t border-white/10 pt-3">
          <button
            type="button"
            onClick={discussWithPenny}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-penny-light transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-penny/50"
          >
            <MessagesSquare size={15} />
            Discuss with Penny
            <ArrowUpRight size={14} />
          </button>
        </div>
      </div>
    </motion.section>
  )
}
