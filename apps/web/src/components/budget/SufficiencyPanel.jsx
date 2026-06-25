// ─────────────────────────────────────────────────────────────────────────────
// SufficiencyPanel — purely presentational "is this budget complete enough?" card.
//
// Props: { assessment, loading }.
//   assessment = { status: 'ok'|'attention', checks: [{id,severity,message}],
//                  ai: { configured: boolean, summary?: string } } | null
//
// Renders a green "Looks complete" / amber "Worth a look" header pill, the
// deterministic checks as a short bullet list, and (only when ai.configured and a
// summary is present) the AI verdict paragraph behind a subtle gold "AI" tag. A
// loading shimmer while it runs. ADVISORY ONLY — never renders a button, never
// touches Apply/Confirm. Navy/gold. Module-scope, no state, no effects (React-
// Compiler safe).
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from 'framer-motion'
import { CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react'

// ── Loading shimmer ──────────────────────────────────────────────────────────
function ShimmerCard() {
  return (
    <div className="card-soft animate-pulse space-y-3 p-4">
      <div className="flex items-center gap-2.5">
        <span className="h-7 w-7 rounded-lg bg-rule/50" />
        <span className="h-3.5 w-32 rounded bg-rule/50" />
      </div>
      <div className="space-y-2">
        <span className="block h-3 w-5/6 rounded bg-rule/40" />
        <span className="block h-3 w-2/3 rounded bg-rule/40" />
      </div>
      <p className="text-[12px] italic text-muted">Checking your budget…</p>
    </div>
  )
}

// ── Header pill ──────────────────────────────────────────────────────────────
function StatusHeader({ status }) {
  const ok = status === 'ok'
  const Icon = ok ? CheckCircle2 : AlertTriangle
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-semibold ${
        ok
          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
          : 'bg-amber-50 text-amber-800 ring-1 ring-amber-300'
      }`}
    >
      <Icon size={16} className="shrink-0" />
      {ok ? 'Looks complete' : 'Worth a look'}
    </div>
  )
}

export default function SufficiencyPanel({ assessment, loading }) {
  if (loading) return <ShimmerCard />
  if (!assessment) return null

  const status = assessment.status === 'attention' ? 'attention' : 'ok'
  const checks = Array.isArray(assessment.checks) ? assessment.checks : []
  const ai = assessment.ai || {}
  const showAi = Boolean(ai.configured && ai.summary)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="card-soft space-y-3 p-4"
    >
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
          Budget check
        </span>
      </div>

      <StatusHeader status={status} />

      {checks.length > 0 ? (
        <ul className="space-y-1.5">
          {checks.map((c) => {
            const warn = c.severity === 'warn'
            return (
              <li key={c.id} className="flex items-start gap-2 text-[13px]">
                <span
                  className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${
                    warn ? 'bg-amber-500' : 'bg-muted/60'
                  }`}
                />
                <span className={warn ? 'text-ink' : 'text-muted'}>{c.message}</span>
              </li>
            )
          })}
        </ul>
      ) : (
        status === 'ok' && (
          <p className="text-[13px] text-muted">
            Nothing looks missing — this budget is ready to apply.
          </p>
        )
      )}

      {showAi && (
        <div className="rounded-xl border border-gold/30 bg-gold/5 px-3.5 py-3">
          <span className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-gold-gradient px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-white">
            <Sparkles size={11} /> AI
          </span>
          <p className="text-[13px] leading-relaxed text-ink">{ai.summary}</p>
        </div>
      )}
    </motion.div>
  )
}
