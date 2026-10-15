import { ShieldAlert } from 'lucide-react'

/**
 * The highest-stakes framing element: a readiness pre-flag is NOT the official
 * AUP or legal/audit advice. Visually DISTINCT from the rule rows (an ink left
 * rule and a shield, informational — never a status mark) so a school can't
 * mistake it for a verdict. Aurora (2026-10-15): it stays VISIBLE under the
 * band, cut to one short line (it counts toward the ≤120-words-above-the-fold
 * budget, so it is trimmed, never hidden — both "not"s stay on screen); the
 * full wording (the Step Up For Students template, the statutes, "your engaged
 * CPA performs the official AUP") lives in the page's "How this works".
 */
export default function DisclaimerBanner() {
  return (
    <aside className="mt-6 flex items-start gap-3 border-l-2 border-ink pl-4" aria-label="Disclaimer">
      <ShieldAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-ink2" />
      <p className="text-small leading-relaxed text-ink2">
        <span className="font-semibold text-ink">A self-check — not the official AUP</span>, and{' '}
        <span className="font-semibold text-ink">not</span> legal or audit advice.
      </p>
    </aside>
  )
}
