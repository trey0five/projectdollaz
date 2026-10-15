import { AlertTriangle, Check, Eye, Minus } from 'lucide-react'
import { VERDICT_LABEL, toVerdict } from './verdict.js'

const ICON = { good: Check, watch: Eye, risk: AlertTriangle, neutral: Minus }

/**
 * VerdictPill — Good / Watch / At risk as word + icon + colour.
 *   verdict  any status token (good|watch|risk, or bad/warn/strength aliases)
 *   label    override the word (e.g. "Ahead", "Behind", "1 to fix") — the
 *            colour + icon still come from the verdict
 *   neutral  with no mapped verdict the pill renders ONLY when a `label` is
 *            given (grey) — a figure with no band never gets a judgement word.
 *   reserve  with no pill to show, keep its height with an invisible spacer
 *            (glass KPI cards in one row stay aligned; nothing is announced)
 */
export default function VerdictPill({ verdict, label = null, reserve = false, className = '', ...rest }) {
  const v = toVerdict(verdict) ?? 'neutral'
  const text = label ?? VERDICT_LABEL[v] ?? null
  if (!text) return reserve ? <span className="au-pill au-pill-ghost" aria-hidden="true" /> : null
  const Icon = ICON[v]
  return (
    <span className={`au-pill au-pill-${v}${className ? ` ${className}` : ''}`} data-verdict={v} {...rest}>
      <i className="au-pill-i" aria-hidden="true">
        <Icon size={11} strokeWidth={3} />
      </i>
      {text}
    </span>
  )
}
