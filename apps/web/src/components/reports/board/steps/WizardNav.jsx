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
    <div className="mt-7 flex items-center justify-between gap-3 border-t border-hair pt-5">
      <div className="min-w-0">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="btn btn-quiet"
          >
            <ArrowLeft size={14} aria-hidden="true" /> {backLabel}
          </button>
        ) : (
          <span />
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink2">
          {saving ? 'Saving…' : saved ? 'Saved' : ''}
        </span>
        {onNext && (
          <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled}
            className="btn btn-primary"
          >
            {nextLabel} <ArrowRight size={14} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  )
}
