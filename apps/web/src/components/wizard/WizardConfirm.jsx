// ─────────────────────────────────────────────────────────────────────────────
// WizardConfirm — step 3, the success state. Shown after a modal save, after the
// user finishes an embedded importer ("Done"), or after a Penny handoff. Offers
// "Add another" (back to Choose) and "Done" (leave). For external connectors
// (QBO/SIS) the copy covers the OAuth round-trip ("once you're back, connected").
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { CircleCheck, Plus, Sparkles } from 'lucide-react'
import { hueRgba } from './wizardConfigs.jsx'

export default function WizardConfirm({ option, hue, moduleLabel, onAddAnother, onDone }) {
  const reduce = useReducedMotion()
  const isHandoff = option?.kind === 'handoff'
  const isExternal = !!option?.external

  const title = isHandoff
    ? 'Handed to Penny'
    : isExternal
      ? 'Connection started'
      : 'That’s saved'

  const body = isHandoff
    ? option?.handoffNote ||
      'Penny is drafting for you — review it in the chat and apply what you like.'
    : isExternal
      ? 'Finish in the window that opened. Once you’re back, your connection shows here and your data syncs automatically.'
      : `Your ${moduleLabel.toLowerCase()} record is in. Add another, or head back to review it.`

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border-2 bg-white p-8 text-center shadow-card"
      style={{ borderColor: hueRgba(hue, 0.28) }}
    >
      <span
        className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ backgroundColor: hueRgba(hue, 0.12), color: hue }}
      >
        {isHandoff ? <Sparkles size={28} /> : <CircleCheck size={28} />}
      </span>
      <h3 className="font-serif text-xl font-semibold text-navy">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-[15px] leading-relaxed text-muted">{body}</p>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        {!isHandoff && (
          <button
            type="button"
            onClick={onAddAnother}
            className="inline-flex items-center gap-1.5 rounded-lg border-2 bg-white px-4 py-2.5 text-[14px] font-bold uppercase tracking-[0.06em] transition-colors"
            style={{ borderColor: hueRgba(hue, 0.4), color: hue }}
          >
            <Plus size={15} /> Add another
          </button>
        )}
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
