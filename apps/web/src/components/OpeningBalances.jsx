// Opening net assets — DERIVED from the uploaded trial balances rather than
// typed at school creation. Each uploaded role (current year / prior year /
// audited) yields its own opening via deriveOpeningNetAssets (the imbalance for
// a management TB, or the equity row for a complete one). The values feed the
// live report; a user can override any of them (a derived "plug" is a suggestion
// that should be confirmed). "Save to school" PERSISTS the confirmed openings to
// the School row via PATCH /schools/:id — the only I/O, kept in the app layer so
// the engine stays pure. The pipeline is: upload → derive → confirm → save.
import { Info } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
import { useAutosave } from '../hooks/useAutosave.js'
import AutosaveIndicator from './AutosaveIndicator.jsx'
import { sanitizeDecimal } from '../lib/numericInput.js'
import { fmtDollar } from '../lib/format.js'

const ROLE_LABEL = { cy: 'Current year', py: 'Prior year', audit: 'Audited' }
const ROLE_FIELD = { cy: 'netAssetsBegin', py: 'pyNetAssetsBegin', audit: 'auditNetAssetsBegin' }
const ROLES = ['cy', 'py', 'audit']

const SOURCE_NOTE = {
  'equity-row': 'from the opening-equity row',
  plug: 'from the trial-balance imbalance',
  unavailable: "couldn't be derived — enter it",
}

export default function OpeningBalances() {
  const { openings, setOpening, school, canEdit } = useApp()
  const { updateSchool } = useSchools()

  const present = ROLES.filter((r) => openings[r])

  // Dirty = a derived/overridden opening differs from what's stored on the school.
  // Money is Decimal(18,2); compare at cents so a derived value with float artifacts
  // (or >2 decimals) doesn't read as perpetually dirty once it's rounded on store.
  const cents = (v) => Math.round(Number(v) * 100)
  const dirty =
    present.length > 0 &&
    present.some((r) => cents(openings[r].effective) !== cents(school?.[ROLE_FIELD[r]] ?? NaN))

  const { saving, error: saveError, saveNow } = useAutosave({
    enabled: !!school?.id && canEdit,
    dirty,
    signal: present.map((r) => openings[r].effective).join(','),
    save: async () => {
      const patch = {}
      for (const r of present) patch[ROLE_FIELD[r]] = openings[r].effective
      await updateSchool(school.id, patch)
    },
  })

  if (present.length === 0) return null

  return (
    <section className="no-print mb-5 rounded-2xl border border-rule bg-white p-4 sm:mb-6 sm:p-6">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-serif text-base font-semibold text-navy sm:text-lg">Opening net assets</h2>
          <span className="flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-[13px] font-semibold uppercase tracking-wide text-gold">
            <Info size={12} /> derived
          </span>
        </div>
        {school?.id && canEdit && (
          <div className="flex shrink-0 items-center gap-3">
            <AutosaveIndicator saving={saving} dirty={dirty} error={!!saveError} />
            {dirty && !saving && (
              <button
                type="button"
                onClick={saveNow}
                className="text-[14px] font-semibold uppercase tracking-wide text-gold transition-colors hover:text-gold-light"
              >
                Save now
              </button>
            )}
          </div>
        )}
      </div>
      <p className="mb-3 text-[14px] text-muted sm:mb-4 sm:text-[15px]">
        Read from your uploaded trial balances — confirm or adjust; changes autosave to the school.
      </p>
      {saveError && <p className="mb-3 text-[14px] font-medium text-danger">{saveError}</p>}
      <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        {present.map((role) => {
          const o = openings[role]
          return (
            <div key={role}>
              <label className="mb-1.5 block text-[13px] font-semibold uppercase tracking-[0.12em] text-muted sm:text-[14px] sm:tracking-[0.14em]">
                {ROLE_LABEL[role]}
              </label>
              <input
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-[16px] text-ink outline-none transition-colors focus:border-gold disabled:cursor-not-allowed disabled:bg-section sm:py-2.5 sm:text-base"
                inputMode="decimal"
                value={o.effective}
                disabled={!canEdit}
                onChange={(e) => setOpening(role, sanitizeDecimal(e.target.value, { allowNegative: true }))}
              />
              <p className="mt-1.5 text-[13px] leading-snug text-muted">
                {o.override != null ? (
                  <>
                    Overridden — derived was {fmtDollar(o.derived.value)}.{' '}
                    <button
                      type="button"
                      className="font-semibold text-gold hover:underline"
                      onClick={() => setOpening(role, '')}
                    >
                      Reset
                    </button>
                  </>
                ) : (
                  <>
                    {fmtDollar(o.derived.value)} {SOURCE_NOTE[o.derived.source]} ({o.fileName})
                  </>
                )}
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
