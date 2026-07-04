// PennyMessageList — the scrolling transcript. role="log" aria-live="polite" so
// screen readers announce streamed assistant text. Auto-scrolls to bottom only
// when the user was already pinned (within 32px), so scrolling up to re-read
// isn't yanked back down. Renders the empty state, the message map, the typing
// indicator (busy + no streamed text yet), and an error banner with Retry.
import { useEffect, useLayoutEffect, useRef } from 'react'
import PennyMessage from './PennyMessage.jsx'
import PennyEmptyState from './PennyEmptyState.jsx'
import PennyTypingIndicator from './PennyTypingIndicator.jsx'

export default function PennyMessageList({
  messages,
  busy,
  streamingContent,
  status,
  error,
  onPick,
  onOpenImage,
  onRetry,
  onConfirmProposal,
  onSetProposalStatus,
  onUndoProposal,
}) {
  const scrollRef = useRef(null)
  const pinnedRef = useRef(true)

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 32
  }

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (pinnedRef.current) el.scrollTop = el.scrollHeight
  }, [messages.length, streamingContent, busy, status, error])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    pinnedRef.current = true
  }, [])

  // The LAST assistant message is the one being streamed (if busy).
  let lastAssistantIdx = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      lastAssistantIdx = i
      break
    }
  }
  const showEmpty = messages.length === 0 && !busy
  // Typing dots only while busy with no streamed text on the live assistant turn.
  const liveText = lastAssistantIdx >= 0 ? messages[lastAssistantIdx].content : ''
  const showTyping = busy && !streamingContent && !liveText

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      role="log"
      aria-live="polite"
      aria-atomic="false"
      className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-3"
    >
      {showEmpty && <PennyEmptyState onPick={onPick} />}

      {messages.map((m, i) => {
        const isLiveAssistant = busy && i === lastAssistantIdx && m.role === 'assistant'
        return (
          <PennyMessage
            key={i}
            message={m}
            messageIndex={i}
            isStreaming={isLiveAssistant}
            streamingContent={isLiveAssistant ? streamingContent : ''}
            onOpenImage={onOpenImage}
            onConfirmProposal={onConfirmProposal}
            onSetProposalStatus={onSetProposalStatus}
            onUndoProposal={onUndoProposal}
          />
        )
      })}

      {showTyping && <PennyTypingIndicator />}

      {!!error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/[0.06] px-3 py-2 text-[14px] text-danger">
          <div className="font-medium">Something went wrong.</div>
          <div className="mt-0.5 text-[12.5px] opacity-90">{error}</div>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 text-[12.5px] font-semibold underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  )
}
