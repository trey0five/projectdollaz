// ─────────────────────────────────────────────────────────────────────────────
// UploadsSummary — what this school has already given us, folded down to a strip.
//
// WHY IT EXISTS. Once the trial balances are in, the first-run screen went on
// showing the whole intake apparatus: three tabs, the "what goes where" explainer
// with its three numbered slots, three file cards each with an account count, a
// balanced chip, a review chip, a role dropdown and a delete X, plus a period bar
// with its own Change button. All of it is the machinery of a job the user has
// just FINISHED, and it sat between them and the one thing they were looking for
// — the way forward. The page could not answer "what do I do now?" because it was
// still asking "what do you want to upload?".
//
// So the finished work becomes a receipt: which of the three slots are filled,
// which period they landed in, and three quiet doors back into the intake for the
// people who genuinely have more to add. The apparatus is folded, never deleted —
// a school with two more years of history must still find its way in, and one
// click gets there.
//
// PRESENTATIONAL ONLY. It takes the persisted period + files as props and reads
// no context, so it cannot disagree with what the intake actually stored. The
// chip vocabulary (check / minus, emerald / muted) is SummaryStrip's, because
// these two rows say the same thing in two places and should look like it.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { Check, FileSpreadsheet, Layers, Minus, Plug } from 'lucide-react'
import { SLOT_ROLES, ROLE_META } from '../../lib/roleMeta.js'
import { Section, Pill, Button } from '../ui/surface/index.js'

// Premium UI P3: the receipt is a `Section` on the ground (label "Your uploads",
// the period as the aside), the slots are status Pills (a 2px mark: good when
// present, neutral when not), the doors flat secondary Buttons. No card.
function SlotChip({ role, file }) {
  const present = !!file
  const meta = ROLE_META[role]
  return (
    <Pill variant="status" tone={present ? 'good' : 'neutral'} title={present ? file.fileName || meta.label : 'Not provided'}>
      {present ? <Check size={11} strokeWidth={3} aria-hidden="true" /> : <Minus size={11} aria-hidden="true" />}
      {meta.label}
    </Pill>
  )
}

function DoorButton({ Icon, label, onClick }) {
  return (
    <Button variant="secondary" size="sm" onClick={onClick} icon={<Icon size={13} />}>
      {label}
    </Button>
  )
}

/**
 * @param {object}   period    the saved period ({ label, roles }) — the receipt's subject
 * @param {Array}    files     persisted imports ([{ role, fileName, rows }])
 * @param {boolean}  canEdit   viewers get the receipt, never the doors
 * @param {Function} onExpand  (tab) => void — 'single' | 'bulk' | 'qbo'
 */
export default function UploadsSummary({ period, files = [], canEdit = false, onExpand }) {
  const reduce = useReducedMotion()
  const byRole = {}
  for (const f of files) if (f?.role && !byRole[f.role]) byRole[f.role] = f
  const filled = SLOT_ROLES.filter((r) => byRole[r]).length

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 240, damping: 24 }}
    >
      <Section label="Your uploads" aside={period?.label ? <span className="font-semibold text-ink">{period.label}</span> : null} className="!mt-0">
      {/* The three slots as STATE, not as instructions. An unfilled slot reads
          "Prior Year —", which is a fact about this school; the pitch for what
          filling it would unlock belongs in the intake, one click away. */}
      <div className="flex flex-wrap items-center gap-2">
        {SLOT_ROLES.map((role) => (
          <SlotChip key={role} role={role} file={byRole[role]} />
        ))}
      </div>

      {canEdit ? (
        <>
          {/* Three doors, all leading back into the SAME embed on the tab that
              matches the words. Nothing here navigates away — a user who came to
              add one more year should not lose this screen to find the uploader. */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <DoorButton
              Icon={FileSpreadsheet}
              label={filled === SLOT_ROLES.length ? 'Manage files' : 'Add another file'}
              onClick={() => onExpand?.('single')}
            />
            <DoorButton Icon={Layers} label="Add more years" onClick={() => onExpand?.('bulk')} />
            <DoorButton Icon={Plug} label="Connect QuickBooks" onClick={() => onExpand?.('qbo')} />
          </div>
        </>
      ) : null}
      </Section>
    </motion.div>
  )
}
