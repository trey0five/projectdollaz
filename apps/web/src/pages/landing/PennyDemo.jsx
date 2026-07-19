// ─────────────────────────────────────────────────────────────────────────────
// PennyDemo — the live scripted product demo in the landing hero, built from
// the REAL pure chat components (PennyAvatar / PennyTypingIndicator /
// PennyMessage → ProposalCard/AppliedCard) with fabricated props. NEVER the
// provider-coupled Penny.jsx / PennyChat.jsx / PennyStudio.jsx.
//
// The transcript is decorative theatre: aria-hidden + `inert` (React 19) so
// none of the real buttons inside are reachable; the adjacent sr-only <p>
// carries the meaning. AnimatePresence mode="wait" keyed on scenarioIndex
// gives the loop a clean fade-out → fresh-mount reset.
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
        className="flex h-[480px] flex-col rounded-xl bg-cream"
      >
        {/* Header — the real avatar, driven by the script. */}
        <div className="flex items-center gap-3 border-b border-rule/60 px-4 py-3">
          <PennyAvatar
            size={44}
            active
            glance={state.glance}
            blink={state.blink}
            celebrate={state.celebrate}
            speaking={state.speaking}
          />
          <p className="flex items-center gap-2 font-serif text-[15px] font-semibold text-navy">
            Penny · AI Chief of Staff
            <span className="h-2 w-2 rounded-full bg-gold shadow-glow motion-safe:animate-pulse" />
          </p>
        </div>

        {/* Transcript — newest content pinned to the bottom, clipping at the top. */}
        <div className="flex flex-1 flex-col justify-end overflow-hidden px-4 py-3">
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
                      className="pointer-events-none absolute bottom-3 left-14 h-9 w-9 rounded-full bg-gold/70"
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
        <div className="flex items-center gap-2 border-t border-rule/60 px-3 py-2.5">
          <span className="flex-1 select-none rounded-full border border-rule/70 bg-white px-3.5 py-2 text-[13px] text-muted">
            Ask Penny anything…
          </span>
          <Mic size={16} className="shrink-0 text-muted" />
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-gradient text-navy">
            <ArrowUp size={15} />
          </span>
        </div>
      </div>
    </div>
  )
}
