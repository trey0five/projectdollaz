// ─────────────────────────────────────────────────────────────────────────────
// NeedsAttentionPanel — the "Needs attention" section of the Domain Command
// Center. A prioritised list of items that need a decision for the domain.
//
// AURORA: an `AuroraSection` heading strip (status-coloured: rose when there is
// something to decide, green when all clear, with a count pill) over a list of
// colourful ROW TILES — one per item: icon well in the item's tone, a bold
// title, ONE short "why" line, the verdict pill and the item's one-click
// action button(s). Beside a register it is a single column (`compact`); under
// a wide register it becomes a 3-up tile grid. Presentational — the parent
// computes the items and wires the actions. Empty state is a designed
// "all caught up" line.
//
// WORDS. A tile is a tile, not a paragraph: the "why" shows its FIRST
// sentence only (the full text rides on the tile's tooltip), and both lines
// clamp at two lines in aurora.css.
//
// COUNTS. The pill counts EVERY item, the overflow included ("3 at risk ·
// 3 watch · 4 more") — the rail never reads as "this is everything" when it
// is not. The strip is rose only when something is at risk, amber when the
// worst is watch, green when all clear.
//
// `limit` caps the tiles shown here (the rest join the overflow line) — the
// wide layout shows one row of three right under the band.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Eye, Info } from 'lucide-react'
import {
  AuroraSection,
  AuroraTile,
  AuroraTileGrid,
  AuroraEmpty,
  AuroraLightButton,
  toVerdict,
  verdictCountLabel,
} from '../ui/aurora/index.js'

const TONE_ICON = { risk: AlertTriangle, watch: Eye, good: CheckCircle2 }

/** The first sentence of a "why" — one short line for the tile. */
export function firstSentence(text) {
  if (typeof text !== 'string') return text
  const t = text.trim()
  // A sentence ends at . ! or ? followed by a space and a capital/digit — so
  // "$1.2M" or "e.g. the" never cut a sentence short.
  const m = t.match(/^(.+?[.!?])\s+(?=[A-Z0-9"“(])/)
  return m ? m[1] : t
}

function ActionButton({ action }) {
  return (
    <AuroraLightButton variant={action.primary ? 'solid' : 'ghost'} size="sm" onClick={action.onClick}>
      {action.label}
    </AuroraLightButton>
  )
}

export default function NeedsAttentionPanel({
  items = [],
  moreCount = 0,
  onMore = null,
  wide = false,
  limit = null,
  title = 'Needs attention',
  subtitle = 'Decisions waiting on you',
}) {
  const [expanded, setExpanded] = useState(false)
  const shown = !expanded && limit != null && limit >= 0 ? items.slice(0, limit) : items
  const localHidden = items.length - shown.length
  const more = moreCount > 0 ? moreCount : 0
  const tones = items.map((i) => toVerdict(i.tone))
  const known = verdictCountLabel(tones)
  const extra = moreCount > 0 ? `${moreCount} more` : null
  const count = items.length ? [known || `${items.length} to review`, extra].filter(Boolean).join(' · ') : 'All clear'
  const worst = tones.includes('risk') ? 'risk' : tones.includes('watch') ? 'watch' : items.length ? 'watch' : 'good'

  return (
    <AuroraSection
      icon={items.length ? AlertTriangle : CheckCircle2}
      title={title}
      subtitle={subtitle}
      count={count}
      tone={worst}
      compact={!wide}
    >
      {items.length === 0 ? (
        <AuroraEmpty icon={CheckCircle2} hue="#059669" text="You're all caught up" sub="No decisions waiting on you right now." />
      ) : (
        <AuroraTileGrid cols={3} stack={!wide}>
          {shown.map((item) => {
            const v = toVerdict(item.tone)
            const why = firstSentence(item.why)
            return (
              <AuroraTile
                key={item.id}
                row
                art={false}
                icon={TONE_ICON[v] ?? Info}
                tone={v ?? 'neutral'}
                title={item.title}
                desc={why}
                tip={typeof item.why === 'string' ? item.why : undefined}
                verdict={v}
                foot={
                  item.actions?.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {item.actions.map((action, ai) => (
                        <ActionButton key={ai} action={action} />
                      ))}
                    </div>
                  ) : null
                }
              >
                {item.meta ?? null}
              </AuroraTile>
            )
          })}
        </AuroraTileGrid>
      )}
      {/* THE OVERFLOW IS SAID, NEVER SILENT. The rail caps at six, and a cap
          that reads as "this is everything" hides whatever it dropped — the
          defect that let a critical finding vanish behind two watch-level
          prompts. One honest line with a door to the full list. */}
      {localHidden > 0 ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-small font-semibold text-ink2 underline decoration-hair underline-offset-2 transition-colors hover:text-ink"
          >
            …and {localHidden + more} more — show them
          </button>
        </div>
      ) : more > 0 ? (
        <div className="mt-3">
          {onMore ? (
            <button
              type="button"
              onClick={onMore}
              className="text-small font-semibold text-ink2 underline decoration-hair underline-offset-2 transition-colors hover:text-ink"
            >
              …and {moreCount} more — see the full list
            </button>
          ) : (
            <p className="text-small font-semibold text-ink2">…and {moreCount} more</p>
          )}
        </div>
      ) : null}
    </AuroraSection>
  )
}
