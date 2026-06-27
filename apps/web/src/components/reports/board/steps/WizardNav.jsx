// Shared Back/Next footer for the Board Report wizard steps. Pure presentational.
import { ArrowLeft, ArrowRight } from 'lucide-react'

export default function WizardNav({
  onBack,
  onNext,
  nextDisabled = false,
  nextLabel = 'Next',
  backLabel = 'Back',
  saving = false,
  saved = false,
}) {
  return (
    <div className="mt-7 flex items-center justify-between gap-3 border-t border-rule/60 pt-5">
      <div className="min-w-0">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-[13px] font-semibold text-navy transition-colors hover:border-gold/50 hover:text-gold"
          >
            <ArrowLeft size={15} /> {backLabel}
          </button>
        ) : (
          <span />
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          {saving ? 'Saving…' : saved ? 'Saved' : ''}
        </span>
        {onNext && (
          <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled}
            className="btn-primary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {nextLabel} <ArrowRight size={15} />
          </button>
        )}
      </div>
    </div>
  )
}
