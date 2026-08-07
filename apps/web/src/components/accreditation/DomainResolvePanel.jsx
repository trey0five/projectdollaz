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
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { domainIcon, domainHue } from './domainMeta.js'
import { riskBandMeta } from './RiskChip.jsx'
import { actionsForFinding, SEVERITY_RANK, SEVERITY_TONE } from './ruleActions.js'

const TONE_CHIP = {
  risk: 'border-danger/40 bg-danger/10 text-danger',
  watch: 'border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#B45309]',
  neutral: 'border-rule/60 bg-section text-muted',
}

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
            className="absolute inset-0 bg-navy/40 backdrop-blur-[2px]"
          />
          <motion.aside
            role="dialog"
            aria-label={`${label} — what to do`}
            initial={reduce ? { opacity: 0 } : { x: 32, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { x: 32, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="relative z-10 flex h-full w-full max-w-xl flex-col overflow-y-auto bg-white shadow-2xl"
          >
            <header
              className="sticky top-0 z-10 border-b border-rule/60 bg-white/95 px-6 py-4 backdrop-blur"
              style={{ borderTopColor: hue, borderTopWidth: 4 }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">
                    <Glyph icon={Icon} style={{ color: hue }} /> {label}
                  </p>
                  <h2 className="mt-1 font-serif text-[20px] font-semibold text-navy">
                    What to do about this
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="shrink-0 rounded-lg border border-rule/60 p-1.5 text-muted transition hover:text-navy"
                >
                  <X size={16} />
                </button>
              </div>
              {band.band ? (
                <span
                  className={`mt-2.5 inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[12px] font-semibold ${meta.chip}`}
                >
                  <span
                    aria-hidden
                    className="inline-block h-[6px] w-[6px] rounded-full"
                    style={{ backgroundColor: meta.dot }}
                  />
                  {meta.label}
                </span>
              ) : null}
            </header>

            <div className="flex-1 space-y-3 px-6 py-5">
              {rows.length === 0 ? (
                // Reachable when a finding clears between the grid rendering and
                // the panel opening. Says so rather than showing an empty box.
                <p className="text-[13.5px] leading-relaxed text-muted">
                  Nothing in this domain is open right now.
                </p>
              ) : (
                rows.map((f) => {
                  const tone = SEVERITY_TONE[f.severity] ?? 'neutral'
                  const actions = actionsForFinding(f, api)
                  return (
                    <article
                      key={f.findingKey ?? f.factKey}
                      className="rounded-xl border border-rule/60 bg-white p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h3 className="min-w-0 text-[14px] font-semibold text-navy">{f.title}</h3>
                        <span
                          className={`shrink-0 rounded-md border px-2 py-0.5 text-[11.5px] font-semibold ${TONE_CHIP[tone]}`}
                        >
                          {f.severity}
                        </span>
                      </div>
                      {/* The engine's own sentences, rendered verbatim. The web
                          composes no rationale — a locally-written explanation
                          could disagree with the finding it explains. */}
                      {f.rationale ? (
                        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                          {f.rationale}
                        </p>
                      ) : null}
                      {f.consequence ? (
                        <p className="mt-2 rounded-lg bg-section px-3 py-2 text-[12.5px] leading-relaxed text-navy/80">
                          {f.consequence}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {actions.map((a) => (
                          <button
                            key={a.label}
                            type="button"
                            onClick={() => {
                              a.onClick?.()
                              onClose?.()
                            }}
                            className={
                              a.primary
                                ? 'rounded-lg btn-cta px-3 py-1.5 text-[13px] font-semibold'
                                : 'rounded-lg border border-rule/70 bg-white px-3 py-1.5 text-[13px] font-semibold text-navy transition hover:border-navy/40'
                            }
                          >
                            {a.label}
                          </button>
                        ))}
                      </div>
                    </article>
                  )
                })
              )}
            </div>
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
