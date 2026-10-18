// ─────────────────────────────────────────────────────────────────────────────
// PennyDemo — the live scripted product demo in the landing hero, built from
// the REAL pure chat components (PennyAvatar / PennyTypingIndicator /
// PennyMessage → ProposalCard/AppliedCard) with fabricated props. NEVER the
// provider-coupled Penny.jsx / PennyChat.jsx / PennyStudio.jsx.
//
// The transcript is decorative theatre: aria-hidden + `inert` (React 19) so
// none of the real buttons inside are reachable; the adjacent sr-only <p>
// carries the meaning. AnimatePresence mode="wait" keyed on scenarioIndex
// gives each scenario hand-off (and the loop back to the first) a clean
// fade-out → fresh-mount reset.
// Rendered inside the hero's floating glass frame: a header with the Scholar
// and a pulsing status dot, the transcript on a pale-blue slab, and a faux
// composer with a round input and a blue gradient send button. The three
// scenarios loop while the demo is on screen. Styles: landing-restore-top.css.
// ─────────────────────────────────────────────────────────────────────────────
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUp, Mic } from 'lucide-react'
import PennyAvatar from '../../components/penny/PennyAvatar.jsx'
import PennyTypingIndicator from '../../components/penny/chat/PennyTypingIndicator.jsx'
import PennyMessage from '../../components/penny/chat/PennyMessage.jsx'
import usePennyDemoScript from './usePennyDemoScript.js'
import { HERO } from './landingContent.js'
import '../../styles/landing-restore-top.css'

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
        className="lr-chat flex h-[480px] flex-col"
      >
        {/* Header — the real Scholar, driven by the script. It stays perched in
            the header (no flight in a chat header); the script's glance is a
            gaze turn (eyes + head, never a mirror) and its blink beats are real
            blinks. Its moods follow the chat: it LISTENS while the question is
            typed, THINKS while the typing dots show and while an action
            applies, TALKS while the answer streams, and tosses its cap when the
            action lands. */}
        <div className="lr-chat-head flex items-center gap-3">
          <PennyAvatar
            size={44}
            active
            state="perched"
            glance={state.glance}
            blink={state.blink}
            celebrate={state.celebrate}
            speaking={state.speaking}
            listening={state.showUser && !state.showTyping && !state.assistantVisible}
            thinking={state.showTyping || state.proposal?.status === 'applying'}
          />
          <p className="lr-chat-title flex items-center gap-2">
            KYRO · AI Chief of Staff
            <span className="lr-chat-dot" />
          </p>
        </div>

        {/* Transcript — newest content pinned to the bottom, clipping at the top.
            overflow-anchor: none — its lines move up as the script types, and
            the browser must never use one as the page's scroll anchor (it
            would nudge the whole page up a line, mid-scroll). */}
        <div className="flex flex-1 flex-col justify-end overflow-hidden px-4 py-3 [overflow-anchor:none]">
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
                  {/* A blue click-pulse over the Confirm button as the script "clicks". */}
                  {state.clickPulse && (
                    <motion.span
                      className="lr-click-pulse pointer-events-none absolute bottom-3 left-14 h-9 w-9"
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
        <div className="lr-chat-compose flex items-center gap-2">
          <span className="lr-chat-input flex-1 select-none">
            Ask KYRO anything…
          </span>
          <Mic size={16} className="shrink-0 text-[#44506e]" />
          <span className="lr-chat-send flex shrink-0 items-center justify-center">
            <ArrowUp size={15} />
          </span>
        </div>
      </div>
    </div>
  )
}
