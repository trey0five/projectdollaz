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

export default function IntakeConfirmBand({ period, files = [], onConfirm, onFix }) {
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
      className="card-flashy p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start gap-3">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold-gradient text-navy shadow-glow">
          <Sparkles size={19} />
        </span>
        <div className="min-w-0 flex-1 basis-[16rem]">
          <h3 className="font-serif text-[18px] font-semibold leading-snug text-navy">
            Does this look right?
          </h3>
          <p className="mt-1 min-w-0 break-words text-[14px] leading-snug text-muted">
            Saved to <span className="font-semibold text-navy">{period.label}</span>. Check the
            files below — then we&apos;ll show you everywhere this data just lit up.
          </p>
        </div>
      </div>

      <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {provided.map((role) => {
          const f = byRole[role]
          const accounts = f.rows?.length ?? 0
          return (
            <li
              key={role}
              className="flex min-w-0 items-start gap-2.5 rounded-xl border border-rule bg-white px-3.5 py-3"
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#e6f5ec] text-[#2f7d51]">
                <Check size={12} strokeWidth={3} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block break-words text-[13px] font-semibold leading-snug text-navy">
                  {ROLE_META[role].plainLabel}
                </span>
                <span className="mt-0.5 block break-words text-[12.5px] leading-snug text-muted">
                  {f.fileName}
                </span>
                {accounts > 0 && (
                  <span className="mt-0.5 block text-[12px] text-muted tabular-nums">
                    {accounts} account{accounts === 1 ? '' : 's'}
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ul>

      <div className="mt-5 flex flex-col gap-2.5 sm:flex-row-reverse sm:items-center">
        <button
          type="button"
          onClick={onConfirm}
          className="btn-cta inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl px-6 text-[12.5px] font-semibold uppercase tracking-[0.1em] outline-none focus-visible:ring-2 focus-visible:ring-gold/50 sm:w-auto"
        >
          <Sparkles size={15} />
          Yes — show me what lit up
        </button>
        <button
          type="button"
          onClick={onFix}
          className="inline-flex min-h-[46px] w-full items-center justify-center rounded-xl border-2 border-border px-5 text-[13.5px] font-semibold text-muted outline-none transition-colors hover:border-navy hover:text-navy focus-visible:ring-2 focus-visible:ring-navy/30 sm:w-auto"
        >
          Not quite — let me fix a file
        </button>
      </div>
    </motion.div>
  )
}
