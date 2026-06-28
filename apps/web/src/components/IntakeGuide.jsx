// "What goes where" — a plain-English explainer for the three upload slots, so a
// non-accountant doesn't (e.g.) drop the same trial balance into all three. Shown
// on the empty dropzone and above the review grid. Pure copy; no state.
import { CalendarClock, Info } from 'lucide-react'
import { ROLE_META, SLOT_ROLES } from '../lib/roleMeta.js'

export default function IntakeGuide() {
  return (
    <div className="rounded-2xl border border-rule bg-white p-4 text-left">
      <p className="mb-3 flex items-center gap-1.5 text-[14px] font-semibold uppercase tracking-[0.1em] text-navy">
        <Info size={14} className="text-gold" /> What goes where
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {SLOT_ROLES.map((role) => {
          const m = ROLE_META[role]
          return (
            <div key={role} className="flex gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold-gradient text-[14px] font-bold text-navy">
                {m.step}
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-navy">
                  {m.plainLabel}
                  <span
                    className={`ml-1.5 align-middle text-[12px] font-semibold uppercase tracking-[0.06em] ${
                      m.required ? 'text-[#7a5e00]' : 'text-muted'
                    }`}
                  >
                    {m.requirementLabel}
                  </span>
                </p>
                <p className="mt-0.5 text-[14px] leading-snug text-muted">{m.blurb}</p>
                <p className="mt-0.5 text-[13px] italic text-muted">{m.source}</p>
              </div>
            </div>
          )
        })}
      </div>

      <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-section px-3 py-2 text-[14px] text-ink">
        <CalendarClock size={14} className="mt-0.5 shrink-0 text-gold" />
        <span>
          <span className="font-semibold text-navy">#1 is this year; #2 and #3 are last year</span>{' '}
          (from two different sources) — so they should be three <em>different</em> files. Most
          schools start with just <span className="font-semibold text-navy">#1</span> and add the
          rest later.
        </span>
      </p>
    </div>
  )
}
