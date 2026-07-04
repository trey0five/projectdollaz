// ─────────────────────────────────────────────────────────────────────────────
// ActVisuals — the four bespoke act visuals. Real product surfaces wherever
// possible: the destination chips reuse PennyAttachmentChip + the ProposalCard
// chip language; the trust cards render the ACTUAL ProposalCard/AppliedCard
// with fabricated props (aria-hidden + inert — the copy carries the meaning).
// All animation transform/opacity, whileInView once, dead under reduced motion.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import { BadgeCheck, Landmark, Library, Wrench } from 'lucide-react'
import PennyAttachmentChip from '../../components/penny/chat/PennyAttachmentChip.jsx'
import ProposalCard from '../../components/penny/chat/ProposalCard.jsx'
import AppliedCard from '../../components/penny/chat/AppliedCard.jsx'
import { EASE } from './Reveal.jsx'
import { BRIEFING_MOCK, DESTINATIONS_MOCK, STATEMENT_MOCK, TRUST_MOCK } from './landingContent.js'

const noop = () => {}

// ── Act I — the prioritized briefing card ────────────────────────────────────
const DOT_TONE = {
  gold: 'bg-gold',
  amber: 'bg-amber-500',
  navy: 'bg-navy',
}

export function BriefingCardMock() {
  const reduce = useReducedMotion()
  return (
    <div className="card-vital p-6">
      <p className="relative z-[1] font-serif text-[17px] font-semibold text-navy">
        {BRIEFING_MOCK.title}
      </p>
      <ul className="relative z-[1] mt-4 space-y-3">
        {BRIEFING_MOCK.rows.map((row, i) => (
          <motion.li
            key={row.text}
            initial={reduce ? false : { opacity: 0, x: -12 }}
            whileInView={reduce ? undefined : { opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.45, ease: EASE, delay: 0.25 + i * 0.12 }}
            className="flex items-start gap-2.5 text-[14px] leading-snug tabular-nums text-ink"
          >
            <span
              aria-hidden="true"
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT_TONE[row.tone]}`}
            />
            {row.text}
          </motion.li>
        ))}
      </ul>
    </div>
  )
}

// ── Act II — drop a file, Penny picks the destination ────────────────────────
const OTHER_DEST_ICON = {
  Accreditation: BadgeCheck,
  Governance: Landmark,
  Knowledge: Library,
}

export function DestinationChipsMock() {
  const reduce = useReducedMotion()
  return (
    <div className="card-soft p-6">
      {/* The file chip (the REAL attachment chip component) settles onto the
          desk once on reveal — no perpetual bob; the ledger spine stays the
          page's one persistent signature. */}
      <motion.div
        className="flex justify-center"
        initial={reduce ? false : { opacity: 0, y: -8 }}
        whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.5, ease: EASE, delay: 0.2 }}
      >
        <PennyAttachmentChip
          attachment={{ name: DESTINATIONS_MOCK.file, kind: 'pdf' }}
        />
      </motion.div>
      <div className="mt-6 rounded-lg border border-navy/10 bg-white/60 p-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-navy/70">
          Detected destination · pick one
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gold bg-gold-gradient px-2.5 py-1 text-[13px] font-semibold text-navy shadow-sm">
            <Wrench size={13} aria-hidden="true" />
            {DESTINATIONS_MOCK.selected.label}
            <span className="ml-0.5 rounded-full bg-navy/15 px-1.5 py-px text-[11px] font-bold text-navy">
              {DESTINATIONS_MOCK.selected.confidence}
            </span>
          </span>
          {DESTINATIONS_MOCK.others.map((label) => {
            const Icon = OTHER_DEST_ICON[label]
            return (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 rounded-full border border-navy/15 bg-white px-2.5 py-1 text-[13px] font-semibold text-navy/80"
              >
                {Icon && <Icon size={13} aria-hidden="true" />}
                {label}
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Act IV — the cropped statement paper, "generating" rows resolving ────────
export function StatementPaperMock() {
  const reduce = useReducedMotion()
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  // How many shimmer rows have resolved to amounts (once per view, not a loop).
  const [resolved, setResolved] = useState(0)

  useEffect(() => {
    if (reduce || !inView) return undefined
    const t1 = setTimeout(() => setResolved(1), 2200)
    const t2 = setTimeout(() => setResolved(2), 2350)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [inView, reduce])

  let shimmerOrder = 0
  return (
    <div ref={ref} className="relative max-h-[340px] overflow-hidden">
      <div className="report-paper !p-6 sm:!p-7">
        <p className="font-serif text-[17px] font-semibold text-navy">{STATEMENT_MOCK.header}</p>
        <div className="mt-4">
          {STATEMENT_MOCK.rows.map((row) => {
            const order = row.shimmer ? ++shimmerOrder : 0
            const settled = !row.shimmer || reduce || resolved >= order
            return (
              <div
                key={row.label}
                className="flex items-baseline justify-between gap-4 border-b border-rule/40 py-2.5 text-[14px]"
              >
                <span className="text-ink">{row.label}</span>
                {settled ? (
                  <motion.span
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.35 }}
                    className="font-medium tabular-nums text-navy"
                  >
                    {row.value}
                  </motion.span>
                ) : (
                  <span aria-hidden="true" className="shimmer-bar inline-block h-3.5 w-20" />
                )}
              </div>
            )
          })}
        </div>
      </div>
      {/* Cropped-paper fade into the section ground. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-section to-transparent"
      />
    </div>
  )
}

// ── Act VI — confirm-then-apply trust cards (the REAL components) ────────────
export function TrustCardsMock() {
  return (
    <div aria-hidden="true" inert className="card-soft p-5">
      <ProposalCard
        proposal={TRUST_MOCK.proposal}
        index={0}
        messageIndex={0}
        onConfirm={noop}
        onCancel={noop}
        onUndo={noop}
      />
      <div className="mt-3">
        <AppliedCard proposal={TRUST_MOCK.applied} onUndo={noop} />
      </div>
    </div>
  )
}
