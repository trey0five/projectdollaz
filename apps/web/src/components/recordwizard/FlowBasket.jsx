// ─────────────────────────────────────────────────────────────────────────────
// FlowBasket — the queued-items strip. Lives OUTSIDE the animated step body
// (transforms would wreck the DatePicker portals and layout animations) and
// persists across steps so the basket is always visible. Each item carries its
// headline + subline, Edit/Remove actions (40px targets), an "editing" state
// while its values are back in the editor, and per-item status during submit
// (spinner / saved mark / failed mark). Remove moves focus to the next item,
// else the strip heading — the caller only mutates state.
//
// Premium UI P4: a ruled strip on the panel (hairline below), items as Pills —
// one shape, colour only in the 2px status mark; the old infinitely breathing
// "editing" ring is now a static 2px primary outline.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Pencil, X, Loader2 } from 'lucide-react'
import { flowCount } from './flowRuntime.js'

const MARK = { done: 'tone-good', error: 'tone-risk' }

export default function FlowBasket({ basket, flow, data, reduce, editingId, disabled, onEdit, onRemove }) {
  const headingRef = useRef(null)
  const removeRefs = useRef(new Map())

  const labelOf = (item) => flow.itemLabel(item.values) || `Untitled ${flow.noun}`

  // Focus contract: after a remove, land on the next item's Remove button (or
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
    <div className="border-b border-hair bg-ground/60 px-5 py-3">
      <p ref={headingRef} tabIndex={-1} className="fld-label mb-2 outline-none">
        In this batch — {flowCount(basket.length, flow.noun, flow.nounPlural)}
      </p>
      <ul className="flex flex-wrap items-center gap-2">
        <AnimatePresence initial={false}>
          {basket.map((item) => {
            const editing = item.id === editingId
            const locked = item.status === 'done' || item.status === 'saving' || disabled
            const mark = MARK[item.status]
            return (
              <motion.li
                key={item.id}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className={`flex min-w-0 max-w-full items-center gap-1.5 rounded-md border bg-white py-0.5 pl-2.5 pr-0.5 ${
                  editing ? 'border-[#2563eb] ring-1 ring-[#2563eb]' : 'border-hair/20'
                }`}
              >
                {/* Status during/after submit: spinner, or the 2px semantic mark. */}
                {item.status === 'saving' ? (
                  <Loader2 size={13} className="shrink-0 animate-spin text-ink2" aria-hidden />
                ) : mark ? (
                  <i className={`h-3 w-0.5 shrink-0 bg-current ${mark}`} aria-hidden />
                ) : null}

                <span className="min-w-0 truncate text-[13px] font-semibold text-ink sm:max-w-[220px]">
                  {labelOf(item)}
                </span>
                {flow.itemSub && (
                  <span className="hidden max-w-[160px] truncate text-[12px] text-ink2 sm:inline">
                    {flow.itemSub(item.values, data)}
                  </span>
                )}
                {editing && <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#2563eb]">Editing</span>}

                {!locked ? (
                  <span className="flex shrink-0 items-center">
                    <button
                      type="button"
                      onClick={() => onEdit(item.id)}
                      aria-label={`Edit ${flow.noun} ${labelOf(item)}`}
                      className="flex h-10 w-10 items-center justify-center rounded-md text-ink2 outline-none transition-colors hover:bg-ink/[0.05] hover:text-ink focus-visible:ring-2 focus-visible:ring-[#2563eb]/50"
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
                      className="flex h-10 w-10 items-center justify-center rounded-md text-ink2 outline-none transition-colors hover:bg-ink/[0.05] hover:text-ink focus-visible:ring-2 focus-visible:ring-[#2563eb]/50"
                    >
                      <X size={15} />
                    </button>
                  </span>
                ) : (
                  <span className="w-1.5" aria-hidden />
                )}
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>
    </div>
  )
}
