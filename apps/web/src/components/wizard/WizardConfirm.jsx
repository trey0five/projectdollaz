// ─────────────────────────────────────────────────────────────────────────────
// WizardConfirm — step 3, the success state. Shown after a modal save, after the
// user finishes an embedded importer ("I'm done"), or after a KYRO handoff.
// Offers "Add another" (back to Choose) and "Done" (leave). For external
// connectors (QBO/SIS) the copy covers the OAuth round-trip.
//
// Premium UI P4: the step renders inside the wizard's ONE Panel — a quiet
// statement on the panel body (hue glyph stroke, Garamond title, ink-2 line) and
// the actions on the panel's hairline footer as flat Buttons.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { CircleCheck, Plus, Sparkles } from 'lucide-react'
import Panel from '../ui/surface/Panel.jsx'
import Button from '../ui/surface/Button.jsx'

export default function WizardConfirm({
  option,
  moduleLabel,
  onAddAnother,
  onDone,
  // WHERE THE WORK ACTUALLY PAYS OFF. "Done" leaves for the module's records
  // tab, which is a filing cabinet — a user who has just handed over their
  // books wants to see what those books now say. Optional: modules with no
  // such destination simply keep the two buttons they had.
  onSeeResult = null,
  seeResultLabel = 'See what lit up',
}) {
  const reduce = useReducedMotion()
  const isHandoff = option?.kind === 'handoff'
  const isExternal = !!option?.external

  const title = isHandoff
    ? 'Handed to KYRO'
    : isExternal
      ? 'Connection started'
      : 'That’s saved'

  const body = isHandoff
    ? option?.handoffNote ||
      'KYRO is drafting for you — review it in the chat and apply what you like.'
    : isExternal
      ? 'Finish in the window that opened. Once you’re back, your connection shows here and your data syncs automatically.'
      : `Your ${moduleLabel.toLowerCase()} record is in. Add another, or head back to review it.`

  // Own wrapping row: Panel's .panel-foot is a nowrap flex-end row, and three
  // buttons do not fit at phone width — they would overflow off the START edge
  // (left overflow never scrolls, so "Add another" was cut by the panel).
  const footer = (
    <div className="flex w-full flex-wrap items-center justify-end gap-2">
      {!isHandoff && (
        <Button variant="quiet" icon={<Plus size={15} />} onClick={onAddAnother} className="mr-auto">
          Add another
        </Button>
      )}
      <Button variant={onSeeResult ? 'secondary' : 'primary'} onClick={onDone}>
        Done
      </Button>
      {onSeeResult && (
        <Button variant="primary" icon={<Sparkles size={15} />} onClick={onSeeResult}>
          {seeResultLabel}
        </Button>
      )}
    </div>
  )

  return (
    <Panel footer={footer}>
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="flex items-start gap-3.5 py-2"
      >
        <span className="tone-hue mt-1 shrink-0" aria-hidden="true">
          {isHandoff ? <Sparkles size={24} strokeWidth={1.6} /> : <CircleCheck size={24} strokeWidth={1.6} />}
        </span>
        <div className="min-w-0">
          <h3 className="font-serif text-title font-medium text-ink">{title}</h3>
          <p className="mt-1 max-w-[60ch] text-[14px] leading-[22px] text-ink2">{body}</p>
        </div>
      </motion.div>
    </Panel>
  )
}
