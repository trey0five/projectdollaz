// ─────────────────────────────────────────────────────────────────────────────
// FlowBasket — the queued-items chip strip. Lives OUTSIDE the animated step
// panel (transforms would wreck the DatePicker portals and layout animations)
// and persists across steps so the basket is always visible. Chips carry the
// item headline + subline, Edit/Remove actions (≥44px targets), an "editing"
// pulse outline while their values are back in the editor, and per-item status
// decorations during submit (spinner / ✓ / ✗). Remove moves focus to the next
// chip, else the strip heading — the caller only mutates state.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Pencil, X, Check, Loader2, AlertCircle } from 'lucide-react'
import { hueRgba } from '../wizard/wizardConfigs.jsx'
import { flowCount } from './flowRuntime.js'

export default function FlowBasket({ basket, flow, data, hue, reduce, editingId, disabled, onEdit, onRemove }) {
  const headingRef = useRef(null)
  const removeRefs = useRef(new Map())

  const labelOf = (item) => flow.itemLabel(item.values) || `Untitled ${flow.noun}`

  // Focus contract: after a remove, land on the next chip's Remove button (or
  // the previous one), else the strip heading. rAF waits for React to commit.
  const handleRemove = (item) => {
    const idx = basket.findIndex((it) => it.id === item.id)
    const next = basket[idx + 1] ?? basket[idx - 1] ?? null
    onRemove(item.id)
    requestAnimationFrame(() => {
      if (next && removeRefs.current.get(next.id)) removeRefs.current.get(next.id).focus()
      else headingRef.current?.focus()
    })
  }

  return (
    <div className="border-b border-rule/60 bg-white/70 px-5 py-3">
      <p
        ref={headingRef}
        tabIndex={-1}
        className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] outline-none"
        style={{ color: hue }}
      >
        In this batch — {flowCount(basket.length, flow.noun, flow.nounPlural)}
      </p>
      <ul className="flex flex-wrap items-center gap-2">
        <AnimatePresence initial={false}>
          {basket.map((item) => {
            const editing = item.id === editingId
            const locked = item.status === 'done' || item.status === 'saving' || disabled
            return (
              <motion.li
                key={item.id}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, scale: 0.8, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 380, damping: 26 }}
                className="relative flex items-center gap-1 rounded-full bg-white py-1 pl-3.5 pr-1"
                style={{
                  border: `1.5px solid ${hueRgba(hue, 0.35)}`,
                  boxShadow: editing ? `0 0 0 2px ${hueRgba(hue, 0.6)}` : undefined,
                }}
              >
                {/* Editing pulse — a soft breathing ring while this chip's
                    values are open in the editor. */}
                {editing && !reduce && (
                  <motion.span
                    aria-hidden
                    className="pointer-events-none absolute -inset-px rounded-full border-2"
                    style={{ borderColor: hueRgba(hue, 0.6) }}
                    initial={{ scale: 1, opacity: 0.8 }}
                    animate={{ scale: 1.12, opacity: 0 }}
                    transition={{ duration: 1.4, ease: 'easeOut', repeat: Infinity, repeatDelay: 0.4 }}
                  />
                )}

                {/* Status decoration during/after submit. */}
                {item.status === 'saving' && (
                  <Loader2 size={14} className="animate-spin" style={{ color: hue }} aria-hidden />
                )}
                {item.status === 'done' && (
                  <Check size={14} className="text-emerald-600" strokeWidth={3} aria-hidden />
                )}
                {item.status === 'error' && (
                  <AlertCircle size={14} className="text-danger" aria-hidden />
                )}

                <span className="max-w-[220px] truncate text-[13px] font-semibold text-navy">
                  {labelOf(item)}
                </span>
                {flow.itemSub && (
                  <span className="hidden max-w-[160px] truncate text-[12px] text-muted sm:inline">
                    {flow.itemSub(item.values, data)}
                  </span>
                )}

                {!locked ? (
                  <span className="ml-0.5 flex items-center">
                    <button
                      type="button"
                      onClick={() => onEdit(item.id)}
                      aria-label={`Edit ${flow.noun} ${labelOf(item)}`}
                      className="flex h-11 w-11 items-center justify-center rounded-full text-muted outline-none transition-colors hover:text-navy focus-visible:ring-2"
                      style={{ '--tw-ring-color': hueRgba(hue, 0.5) }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      ref={(el) => {
                        if (el) removeRefs.current.set(item.id, el)
                        else removeRefs.current.delete(item.id)
                      }}
                      onClick={() => handleRemove(item)}
                      aria-label={`Remove ${flow.noun} ${labelOf(item)}`}
                      className="flex h-11 w-11 items-center justify-center rounded-full text-muted outline-none transition-colors hover:text-danger focus-visible:ring-2"
                      style={{ '--tw-ring-color': hueRgba(hue, 0.5) }}
                    >
                      <X size={15} />
                    </button>
                  </span>
                ) : (
                  <span className="w-2" aria-hidden />
                )}
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>
    </div>
  )
}
