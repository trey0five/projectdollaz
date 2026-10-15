// ─────────────────────────────────────────────────────────────────────────────
// SufficiencyPanel — purely presentational "is this budget complete enough?"
// block. Premium UI P4: a Section on the ground (no card) — the verdict is a
// status Pill ("Looks complete" good / "Worth a look" watch), the deterministic
// checks a ruled list with a 2px mark per warning, and (only when ai.configured
// and a summary is present) KYRO's verdict as a quiet paragraph with the gold
// "AI" mark (gold = KYRO only). A static "Checking…" note while it runs.
//
// Props: { assessment, loading }.
//   assessment = { status: 'ok'|'attention', checks: [{id,severity,message}],
//                  ai: { configured: boolean, summary?: string } } | null
//
// ADVISORY ONLY — never renders a button, never touches Apply/Confirm.
// Module-scope, no state, no effects (React-Compiler safe).
// ─────────────────────────────────────────────────────────────────────────────
import { Sparkles } from 'lucide-react'
import { Section, Pill } from '../ui/surface/index.js'

export default function SufficiencyPanel({ assessment, loading }) {
  if (loading) {
    return (
      <Section label="Budget check">
        <p className="text-small italic text-ink2" aria-busy="true">
          Checking your budget…
        </p>
      </Section>
    )
  }
  if (!assessment) return null

  const status = assessment.status === 'attention' ? 'attention' : 'ok'
  const ok = status === 'ok'
  const checks = Array.isArray(assessment.checks) ? assessment.checks : []
  const ai = assessment.ai || {}
  const showAi = Boolean(ai.configured && ai.summary)

  return (
    <Section
      label="Budget check"
      aside={
        <Pill variant="status" tone={ok ? 'good' : 'watch'}>
          {ok ? 'Looks complete' : 'Worth a look'}
        </Pill>
      }
     
    >
      {checks.length > 0 ? (
        <ul>
          {checks.map((c) => {
            const warn = c.severity === 'warn'
            return (
              <li key={c.id} className="fig !justify-start !gap-2.5">
                <i className={`mark ${warn ? 'tone-watch' : 'tone-neutral'}`} aria-hidden="true" />
                <span className={warn ? 'text-ink' : 'text-ink2'}>{c.message}</span>
              </li>
            )
          })}
        </ul>
      ) : (
        ok && <p className="text-small text-ink2">Nothing looks missing — this budget is ready to apply.</p>
      )}

      {showAi && (
        <div className="mt-3 border-l-2 border-penny pl-3">
          <span className="mb-1 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink2">
            <Sparkles size={11} aria-hidden="true" className="text-penny" /> KYRO&rsquo;s read
          </span>
          <p className="text-small leading-relaxed text-ink">{ai.summary}</p>
        </div>
      )}
    </Section>
  )
}
