// ─────────────────────────────────────────────────────────────────────────────
// PennyDemo — the live scripted product demo in the landing hero, built from
// the REAL pure chat components (PennyAvatar / PennyTypingIndicator /
// PennyMessage → ProposalCard/AppliedCard) with fabricated props. NEVER the
// provider-coupled Penny.jsx / PennyChat.jsx / PennyStudio.jsx.
//
// The transcript is decorative theatre: aria-hidden + `inert` (React 19) so
// none of the real buttons inside are reachable; the adjacent sr-only <p>
// carries the meaning. AnimatePresence mode="wait" keyed on scenarioIndex
// gives each scenario hand-off a clean fade-out → fresh-mount reset; the three
// scenarios play ONCE and the last one's finished frame stays (no loop).
// Rendered inside the hero's Panel: a header row on a hairline, the transcript
// on white, a faux composer on a hairline — no tinted slab, no pulsing dot.
// ─────────────────────────────────────────────────────────────────────────────
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUp, Mic } from 'lucide-react'
import PennyAvatar from '../../components/penny/PennyAvatar.jsx'
import PennyTypingIndicator from '../../components/penny/chat/PennyTypingIndicator.jsx'
import PennyMessage from '../../components/penny/chat/PennyMessage.jsx'
import usePennyDemoScript from './usePennyDemoScript.js'
import { HERO } from './landingContent.js'

const noop = () => {}

export default function PennyDemo() {
  const { frameRef, reduce, scenarioIndex, state } = usePennyDemoScript()

  const userMessage = {
    role: 'user',
    content: state.userText,
    attachments: state.userAttachments,
  }
  const assistantMessage = {
    role: 'assistant',
    content: state.assistantText,
    proposals: state.proposal ? [state.proposal] : [],
  }

  return (
    <div>
      {/* The meaning of the demo, for screen readers (the theatre is hidden). */}
      <p className="sr-only">{HERO.demoSrSummary}</p>

      <div
        ref={frameRef}
        aria-hidden="true"
        inert
        className="flex h-[480px] flex-col bg-white"
      >
        {/* Header — the real owl, driven by the script. It stays perched in the
            header (no flight in a chat header); the script's glance becomes the
            facing direction, and its blink loop is ignored by the owl. */}
        <div className="flex items-center gap-3 border-b border-hair px-5 py-2.5">
          <PennyAvatar
            size={44}
            active
            state="perched"
            facing={state.glance < 0 ? 'left' : 'right'}
            celebrate={state.celebrate}
            speaking={state.speaking}
          />
          <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
            KYRO · AI Chief of Staff
            <span className="h-1.5 w-1.5 rounded-full bg-penny" />
          </p>
        </div>

        {/* Transcript — newest content pinned to the bottom, clipping at the top. */}
        <div className="flex flex-1 flex-col justify-end overflow-hidden px-5 py-3">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={scenarioIndex}
              className="space-y-3"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.35, delay: 0.15 } }}
              exit={{ opacity: 0, transition: { duration: 0.3 } }}
            >
              {state.showUser && (
                <PennyMessage message={userMessage} onConfirmProposal={noop} onSetProposalStatus={noop} />
              )}
              {state.showTyping && <PennyTypingIndicator />}
              {state.assistantVisible && (
                <div className="relative">
                  <PennyMessage
                    message={assistantMessage}
                    isStreaming={state.assistantStreaming}
                    streamingContent={state.assistantText}
                    onConfirmProposal={noop}
                    onSetProposalStatus={noop}
                    messageIndex={0}
                  />
                  {/* Gold click-pulse over the Confirm button as the script "clicks". */}
                  {state.clickPulse && (
                    <motion.span
                      className="pointer-events-none absolute bottom-3 left-14 h-9 w-9 rounded-full bg-penny/70"
                      initial={{ scale: 0.5, opacity: 0.9 }}
                      animate={{ scale: 1.5, opacity: 0 }}
                      transition={{ duration: 0.45, ease: 'easeOut' }}
                    />
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Faux composer strip — pure decoration. */}
        <div className="flex items-center gap-2 border-t border-hair px-4 py-2.5">
          <span className="flex-1 select-none rounded-md border border-hair/[.18] bg-white px-3 py-2 text-[13px] text-ink2">
            Ask KYRO anything…
          </span>
          <Mic size={16} className="shrink-0 text-ink2" />
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-penny text-ink">
            <ArrowUp size={15} />
          </span>
        </div>
      </div>
    </div>
  )
}
