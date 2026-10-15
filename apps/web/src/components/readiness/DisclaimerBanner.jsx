import { ShieldAlert } from 'lucide-react'

/**
 * The highest-stakes framing element: a readiness pre-flag is NOT the official
 * AUP or legal/audit advice. Visually DISTINCT from the rule rows (an ink left
 * rule and a shield, informational — never a status mark) so a school can't
 * mistake it for a verdict. Premium UI P4: on the ground, no card, no gold.
 */
export default function DisclaimerBanner() {
  return (
    <aside className="flex items-start gap-3 border-l-2 border-ink pl-4" aria-label="Disclaimer">
      <ShieldAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-ink2" />
      <div>
        <h2 className="text-[15px] font-semibold text-ink">Readiness pre-flag — not the official AUP</h2>
        <p className="mt-1 max-w-4xl text-small leading-relaxed text-ink2">
          This mirrors the Step Up For Students AUP template and the governing Florida statutes so you
          can self-check before your CPA engagement. It is{' '}
          <span className="font-semibold text-ink">not</span> the official Agreed-Upon-Procedures
          report and <span className="font-semibold text-ink">not</span> legal or audit advice. Your
          engaged CPA performs the official AUP.
        </p>
      </div>
    </aside>
  )
}
