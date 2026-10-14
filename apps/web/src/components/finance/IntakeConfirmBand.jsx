// ─────────────────────────────────────────────────────────────────────────────
// IntakeConfirmBand — "here is exactly what we stored. Is that right?"
//
// Sits between the trial-balance intake and the celebration. It exists because
// the intake autosaves: by the time a user finishes reading the three slots,
// their books are already in the database, and nothing has ever asked them to
// look at the result and agree with it. This is that checkpoint.
//
// It reads from the PERSISTED imports of the saved period — not from whatever
// is sitting in the uploader — so what it lists is what the school actually has
// stored. It does not save, delete, or change anything; confirming only opens
// the reveal. The honest consequence is that "Not quite right" cannot undo a
// save, so it says what it can actually do: take you back to the files to fix.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { Check, Sparkles } from 'lucide-react'
import { SLOT_ROLES, ROLE_META } from '../../lib/roleMeta.js'
import { Button } from '../ui/surface/index.js'

// Premium UI P3: the checkpoint is a `Panel` (the one raised surface — it asks
// a question and takes an answer), the file receipts are ruled lines, the
// actions flat Buttons. No gold icon tile, no bevel.

export default function IntakeConfirmBand({
  period,
  files = [],
  onConfirm,
  onFix,
  // Whether the save actually produced statement figures. When it did not, the
  // accounts have not been categorised yet — and offering "show me what lit up"
  // there is the product congratulating itself over an empty statement, which
  // is precisely how a school came to believe its books were live when every
  // number was zero.
  dataReady = true,
  // What "Categorise my accounts" actually DOES. Without it that button was
  // wired to onFix — the dismiss handler — so the one call to action the screen
  // offered hid itself and changed nothing.
  onCategorise = null,
}) {
  const reduce = useReducedMotion()
  if (!period) return null

  const byRole = {}
  for (const f of files) if (f?.role && !byRole[f.role]) byRole[f.role] = f
  const provided = SLOT_ROLES.filter((r) => byRole[r])
  if (provided.length === 0) return null

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 240, damping: 22 }}
      className="panel panel-body"
    >
      <div className="flex flex-wrap items-start gap-3">
        <span className="mt-0.5 inline-flex shrink-0 text-navy-soft" aria-hidden="true">
          <Sparkles size={19} />
        </span>
        <div className="min-w-0 flex-1 basis-[16rem]">
          <h3 className="font-serif text-title text-ink">
            {dataReady ? 'Does this look right?' : 'Saved — but we can’t read it yet'}
          </h3>
          <p className="mt-1 min-w-0 break-words text-small leading-snug text-ink2">
            Saved to <span className="font-semibold text-ink">{period.label}</span>.{' '}
            {dataReady
              ? 'Check the files below — then we’ll show you everywhere this data just lit up.'
              : 'Your accounts aren’t named in a way we recognise yet, so your statements are still empty. Open a file below and confirm what each account is — we’ve suggested most of them.'}
          </p>
        </div>
      </div>

      <ul className="mt-4 grid grid-cols-1 gap-x-6 sm:grid-cols-3">
        {provided.map((role) => {
          const f = byRole[role]
          const accounts = f.rows?.length ?? 0
          return (
            <li key={role} className="flex min-w-0 items-start gap-2.5 border-t border-hair py-3">
              <span className="mt-0.5 inline-flex shrink-0 tone-good" aria-hidden="true">
                <Check size={14} strokeWidth={2.5} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block break-words text-small font-semibold leading-snug text-ink">
                  {ROLE_META[role].plainLabel}
                </span>
                <span className="mt-0.5 block break-words text-small leading-snug text-ink2">
                  {f.fileName}
                </span>
                {accounts > 0 && (
                  <span className="mt-0.5 block text-[12px] text-ink2 tabular-nums">
                    {accounts} account{accounts === 1 ? '' : 's'}
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ul>

      <div className="mt-5 flex flex-col gap-2.5 sm:flex-row-reverse sm:items-center">
        {dataReady ? (
          <>
            <Button variant="primary" onClick={onConfirm} icon={<Sparkles size={15} />} className="w-full sm:w-auto">
              Yes — show me what lit up
            </Button>
            <Button variant="secondary" onClick={onFix} className="w-full sm:w-auto">
              Not quite — let me fix a file
            </Button>
          </>
        ) : (
          // NO CELEBRATION ON OFFER. There is exactly one useful next step from
          // here, and it is naming the accounts.
          <Button
            variant="primary"
            onClick={() => {
              // Open the review panel FIRST, then step out of its way.
              onCategorise?.()
              onFix?.()
            }}
            className="w-full sm:w-auto"
          >
            Categorise my accounts
          </Button>
        )}
      </div>
    </motion.div>
  )
}
