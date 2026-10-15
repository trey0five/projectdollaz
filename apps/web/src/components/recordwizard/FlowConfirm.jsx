// ─────────────────────────────────────────────────────────────────────────────
// FlowConfirm — the count-aware Confirm panel for kind:'flow' options. Mirrors
// WizardConfirm's grammar (one Panel: a quiet statement on the body, flat
// Buttons on the hairline footer) WITHOUT importing it — the modal/embed/handoff
// paths keep their own confirm. Title reads the batch result ("3 policies
// added"), with a soft line for any items that didn't save.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { CircleCheck, Plus } from 'lucide-react'
import Panel from '../ui/surface/Panel.jsx'
import Button from '../ui/surface/Button.jsx'

export default function FlowConfirm({ result, moduleLabel, onAddAnother, onDone }) {
  const reduce = useReducedMotion()

  const title = `${result.ok} ${result.ok === 1 ? result.noun : result.nounPlural} added`
  const soft =
    result.failed > 0
      ? `${result.failed} didn’t save — you can add ${result.failed === 1 ? 'it' : 'them'} again anytime.`
      : null

  const footer = (
    <>
      <Button variant="quiet" icon={<Plus size={15} />} onClick={onAddAnother} className="mr-auto">
        Add another
      </Button>
      <Button variant="primary" onClick={onDone}>
        Done
      </Button>
    </>
  )

  return (
    <Panel footer={footer}>
      <div className="flex items-start gap-3.5 py-2">
        {/* One-shot settle on the check (static under reduced motion). */}
        <motion.span
          initial={reduce ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          className="tone-hue mt-1 shrink-0"
          aria-hidden="true"
        >
          <CircleCheck size={24} strokeWidth={1.6} />
        </motion.span>
        <div className="min-w-0">
          <h3 className="font-serif text-title font-medium text-ink">{title}</h3>
          <p className="mt-1 max-w-[60ch] text-[14px] leading-[22px] text-ink2">
            {`They’re in your ${moduleLabel.toLowerCase()} register now. Add more, or head back to review them.`}
          </p>
          {soft && (
            <p className="mt-2 border-l-2 border-watch pl-2.5 text-[13px] leading-[18px] text-ink">{soft}</p>
          )}
        </div>
      </div>
    </Panel>
  )
}
