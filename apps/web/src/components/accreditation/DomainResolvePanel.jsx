// ─────────────────────────────────────────────────────────────────────────────
// DomainResolvePanel — "Finance is High. Now what?"
//
// The early-warning grid told a school which domains were in trouble and stopped
// there. Ten cards reading "High · 3 critical · 1 warning" name a problem
// precisely and offer nothing to do about it, which is the most frustrating
// possible shape for a warning: enough to worry, not enough to act.
//
// So a band card opens THIS: every open finding in that domain, each with the
// consequence the engine already wrote and the button that actually goes where
// the fix lives. Nothing here is composed locally — the title, the rationale and
// the consequence are the server's words, and the actions come from ruleActions,
// which is the one place a rule is mapped to a destination.
//
// WHAT IT DOES NOT DO. It does not rank, score or summarise the domain, and it
// does not tell a school which finding to fix first beyond the severity order the
// engine already assigns. A panel that invented a priority would be inventing
// exactly the kind of judgement the twin refuses to make.
//
// PREMIUM UI P4 (a2): a float drawer (hairline, --sh-float, no backdrop blur —
// glass lives only on the scrolled top strip), a 2px domain-hue rule, findings
// as ruled rows, severity and band as ledger Pills, actions as flat Buttons.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { domainIcon, domainHue } from './domainMeta.js'
import { riskBandMeta } from './RiskChip.jsx'
import { actionsForFinding, SEVERITY_LABEL, SEVERITY_RANK, SEVERITY_TONE } from './ruleActions.js'
import Button from '../ui/surface/Button.jsx'
import Pill from '../ui/surface/Pill.jsx'
import '../../styles/pending/a2-carry.css'

function Glyph(props) {
  const Icon = props.icon
  return <Icon size={16} style={props.style} aria-hidden />
}

export default function DomainResolvePanel({ open, band, label, findings = [], api, onClose }) {
  const reduce = useReducedMotion()
  if (!band) return null

  const Icon = domainIcon(band.domainKey)
  const hue = domainHue(band.domainKey)
  const meta = riskBandMeta(band.band)

  // Severity order is the ENGINE'S, not ours — critical, then warn, then info.
  const rows = [...findings].sort(
    (a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9),
  )

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute inset-0 bg-ink/40"
          />
          <motion.aside
            role="dialog"
            aria-label={`${label} — what to do`}
            initial={reduce ? { opacity: 0 } : { x: 32, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { x: 32, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="relative z-10 flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-hair bg-white shadow-float"
          >
            <header
              className="sticky top-0 z-10 border-b border-hair bg-white px-6 py-4"
              style={{ borderTopColor: hue, borderTopWidth: 2 }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-micro font-semibold uppercase text-ink2">
                    <Glyph icon={Icon} style={{ color: hue }} /> {label}
                  </p>
                  <h2 className="mt-1 font-serif text-[22px] font-medium leading-7 text-ink">
                    What to do about this
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="a2-icon-btn shrink-0"
                >
                  <X size={16} />
                </button>
              </div>
              {band.band ? (
                <Pill variant="status" tone={meta.tone} className="mt-2.5">
                  {meta.label}
                </Pill>
              ) : null}
            </header>

            <div className="flex-1 px-6 py-5">
              {rows.length === 0 ? (
                // Reachable when a finding clears between the grid rendering and
                // the panel opening. Says so rather than showing an empty box.
                <p className="a2-empty">Nothing in this domain is open right now.</p>
              ) : (
                <ul className="a2-rows">
                {rows.map((f) => {
                  const tone = SEVERITY_TONE[f.severity] ?? 'neutral'
                  const actions = actionsForFinding(f, api)
                  return (
                    <li key={f.findingKey ?? f.factKey} className="!py-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h3 className="min-w-0 text-[15px] font-semibold text-ink">{f.title}</h3>
                        <Pill variant="status" tone={tone} className="shrink-0">
                          {SEVERITY_LABEL[f.severity] ?? f.severity}
                        </Pill>
                      </div>
                      {/* The engine's own sentences, rendered verbatim. The web
                          composes no rationale — a locally-written explanation
                          could disagree with the finding it explains. */}
                      {f.rationale ? (
                        <p className="mt-1.5 text-small leading-relaxed text-ink2">
                          {f.rationale}
                        </p>
                      ) : null}
                      {f.consequence ? (
                        <p className="a2-note mt-2" data-tone={tone}>
                          {f.consequence}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {actions.map((a) => (
                          <Button
                            key={a.label}
                            size="sm"
                            variant={a.primary ? 'primary' : 'secondary'}
                            onClick={() => {
                              a.onClick?.()
                              onClose?.()
                            }}
                          >
                            {a.label}
                          </Button>
                        ))}
                      </div>
                    </li>
                  )
                })}
                </ul>
              )}
            </div>
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
