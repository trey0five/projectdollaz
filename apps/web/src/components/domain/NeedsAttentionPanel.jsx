// ─────────────────────────────────────────────────────────────────────────────
// NeedsAttentionPanel — the right-hand rail of the Domain Command Center. A
// prioritised list of "items that need a decision" for the domain: each row is a
// 2px status mark + a bold ink title + a one-line "why" + optional one-click
// action button(s). Presentational — the parent computes the items and wires
// the actions. Premium UI P3: a `Panel tone="attention"` (it is the one place
// on the page you ACT), rows ruled by hairlines, flat Buttons. Empty state is
// a quiet "all caught up" line.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { CheckCircle2 } from 'lucide-react'
import { Panel, Button } from '../ui/surface/index.js'

const TONE = { good: 'tone-good', watch: 'tone-watch', risk: 'tone-risk', neutral: 'tone-neutral' }

function ActionButton({ action }) {
  return (
    <Button variant={action.primary ? 'primary' : 'secondary'} size="sm" onClick={action.onClick}>
      {action.label}
    </Button>
  )
}

export default function NeedsAttentionPanel({ items = [], moreCount = 0, onMore = null }) {
  const reduce = useReducedMotion()

  return (
    <Panel tone={items.length ? 'attention' : undefined} title="Needs attention" padded={false} className="flex flex-col">
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
          <span className="inline-flex tone-good" aria-hidden="true">
            <CheckCircle2 size={20} />
          </span>
          <p className="text-body font-semibold text-ink">You&apos;re all caught up</p>
          <p className="text-small text-ink2">No decisions waiting on you right now.</p>
        </div>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {items.map((item, i) => (
            <motion.li
              key={item.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.24, delay: reduce ? 0 : i * 0.04 }}
              className="flex gap-2.5 border-b border-hair px-4 py-3 last:border-b-0"
            >
              <i className={`mark mt-1.5 ${TONE[item.tone] ?? TONE.neutral}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-body font-semibold leading-snug text-ink">{item.title}</p>
                <p className="mt-0.5 text-small leading-snug text-ink2">{item.why}</p>
                {item.meta ?? null}
                {item.actions?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {item.actions.map((action, ai) => (
                      <ActionButton key={ai} action={action} />
                    ))}
                  </div>
                ) : null}
              </div>
            </motion.li>
          ))}
          {/* THE OVERFLOW IS SAID, NEVER SILENT. The rail caps at six, and a cap
              that reads as "this is everything" hides whatever it dropped — the
              defect that let a critical finding vanish behind two watch-level
              prompts. One honest line with a door to the full list. */}
          {moreCount > 0 ? (
            <li className="px-4 py-2.5">
              {onMore ? (
                <button type="button" onClick={onMore} className="text-small font-semibold text-ink2 underline decoration-hair underline-offset-2 transition-colors hover:text-ink">
                  …and {moreCount} more — see the full list
                </button>
              ) : (
                <p className="text-small font-semibold text-ink2">…and {moreCount} more</p>
              )}
            </li>
          ) : null}
        </ul>
      )}
    </Panel>
  )
}
