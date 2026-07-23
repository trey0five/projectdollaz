// ─────────────────────────────────────────────────────────────────────────────
// FlowConfirm — the count-aware Confirm panel for kind:'flow' options. Mirrors
// WizardConfirm's visuals (hue-tinted check tile, Add another outline + Done
// solid) WITHOUT importing or touching it — the modal/embed/handoff paths keep
// their untouched confirm. Title reads the batch result ("3 policies added"),
// with a soft line for any items that didn't save.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { CircleCheck, Plus } from 'lucide-react'
import { hueRgba } from '../wizard/wizardConfigs.jsx'

export default function FlowConfirm({ result, hue, moduleLabel, onAddAnother, onDone }) {
  const reduce = useReducedMotion()

  const title = `${result.ok} ${result.ok === 1 ? result.noun : result.nounPlural} added`
  const soft =
    result.failed > 0
      ? `${result.failed} didn’t save — you can add ${result.failed === 1 ? 'it' : 'them'} again anytime.`
      : null

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border-2 bg-white p-8 text-center shadow-card"
      style={{ borderColor: hueRgba(hue, 0.28) }}
    >
      {/* One-shot spring pop on the check tile (static under reduced motion). */}
      <motion.span
        initial={reduce ? false : { scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ backgroundColor: hueRgba(hue, 0.12), color: hue }}
      >
        <CircleCheck size={28} />
      </motion.span>

      <h3 className="font-serif text-xl font-semibold text-navy">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-[15px] leading-relaxed text-muted">
        {`They’re in your ${moduleLabel.toLowerCase()} register now. Add more, or head back to review them.`}
      </p>
      {soft && (
        <p className="mx-auto mt-1.5 max-w-md text-[13.5px] leading-relaxed text-muted">{soft}</p>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onAddAnother}
          className="inline-flex items-center gap-1.5 rounded-lg border-2 bg-white px-4 py-2.5 text-[14px] font-bold uppercase tracking-[0.06em] transition-colors"
          style={{ borderColor: hueRgba(hue, 0.4), color: hue }}
        >
          <Plus size={15} /> Add another
        </button>
        <button
          type="button"
          onClick={onDone}
          className="inline-flex items-center gap-1.5 rounded-lg px-5 py-2.5 text-[14px] font-bold uppercase tracking-[0.06em] text-white shadow-glow transition-transform hover:-translate-y-0.5"
          style={{ backgroundColor: hue }}
        >
          Done
        </button>
      </div>
    </motion.div>
  )
}
