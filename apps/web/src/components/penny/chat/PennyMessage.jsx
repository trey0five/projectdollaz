// PennyMessage — renders a single user or assistant turn.
//
// User turns: a navy bubble (rounded-br tail) with any attachment chips ABOVE it.
// Assistant turns: a white bubble (rounded-bl tail) whose body runs through
// renderMarkdown(...) — THIS is what kills the literal "**asterisks**" the old
// plain-text panel printed. Charts render via the lazy ChartRenderer (unchanged),
// and each proposal renders a ProposalCard.
import { Suspense, lazy } from 'react'
import { renderMarkdown } from '../../../lib/markdown.jsx'
import PennyAttachmentChip from './PennyAttachmentChip.jsx'
import ProposalCard from './ProposalCard.jsx'

const ChartRenderer = lazy(() => import('../../assistant/ChartRenderer.jsx'))

export default function PennyMessage({
  message,
  isStreaming = false,
  streamingContent = '',
  onOpenImage,
  onConfirmProposal,
  onSetProposalStatus,
  messageIndex,
}) {
  if (message.role === 'user') {
    const chips = message.attachments || []
    return (
      <div className="flex flex-col items-end gap-1.5 motion-safe:animate-[penny-pop_260ms_ease-out]">
        {chips.length > 0 && (
          <div className="flex max-w-[80%] flex-wrap justify-end gap-1.5">
            {chips.map((a, i) =>
              a.kind === 'image' && a.preview ? (
                <button
                  key={`${a.name}:${i}`}
                  type="button"
                  onClick={() => onOpenImage?.(a.preview)}
                  aria-label={`View ${a.name || 'attached image'}`}
                  className="cursor-zoom-in"
                >
                  <PennyAttachmentChip attachment={a} />
                </button>
              ) : (
                <PennyAttachmentChip key={`${a.name}:${i}`} attachment={a} />
              ),
            )}
          </div>
        )}
        {(message.content || '').trim().length > 0 && (
          <div className="ml-auto max-w-[88%] break-words rounded-2xl rounded-br-md bg-navy px-3.5 py-2 text-[15px] leading-relaxed text-white shadow-card">
            <p className="whitespace-pre-wrap">{message.content}</p>
          </div>
        )}
      </div>
    )
  }

  // Assistant turn.
  const text = isStreaming ? streamingContent : message.content
  const charts = message.charts || []
  const proposals = message.proposals || []

  return (
    <div className="flex justify-start motion-safe:animate-[penny-pop_260ms_ease-out]">
      <div className="mr-auto max-w-[88%] rounded-2xl rounded-bl-md border border-rule/70 bg-white px-3.5 py-2 text-[15px] text-ink shadow-card">
        <div className="space-y-1.5 leading-relaxed">{renderMarkdown(text || '')}</div>
        {isStreaming && (
          <span
            aria-hidden
            className="ml-0.5 inline-block h-4 w-[3px] align-middle rounded-full bg-gold-gradient motion-safe:animate-pulse"
          />
        )}

        {charts.map((c, ci) => (
          <Suspense
            key={`c${ci}`}
            fallback={<p className="mt-2 text-[13px] text-muted">Rendering chart…</p>}
          >
            <ChartRenderer spec={c} />
          </Suspense>
        ))}

        {proposals.map((p, pi) => (
          <ProposalCard
            key={`p${pi}`}
            proposal={p}
            index={pi}
            messageIndex={messageIndex}
            onConfirm={onConfirmProposal}
            onCancel={onSetProposalStatus}
          />
        ))}
      </div>
    </div>
  )
}
