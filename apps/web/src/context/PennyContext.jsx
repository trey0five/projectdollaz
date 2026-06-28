// ─────────────────────────────────────────────────────────────────────────────
// Penny — the unified guide + AI character. ONE coin lives globally (mounted once
// in AuthedLayout) and plays two roles:
//   • GUIDE: any page can ask Penny to travel to an on-screen element and deliver a
//     contextual bubble — e.g. the Data hub sending a first-time user to the trial
//     balance card ("start here"). A guide can be a single pointer (guideTo) or a
//     multi-step walkthrough (runTour).
//   • AI: clicking Penny opens "Penny AI" (the streaming assistant) — there is no
//     separate Ask-FinRep button anymore; Penny IS the assistant.
//
// This context holds only the INTENT (which element + message, and whether the chat
// is open). The <Penny/> component owns the motion (measuring the target, gliding
// to it) so the script stays with the page that knows its own DOM.
// ─────────────────────────────────────────────────────────────────────────────
import { createContext, useCallback, useContext, useMemo, useState } from 'react'

const PennyContext = createContext(null)

// Defensive no-op so usePenny() never throws if a tree renders outside the provider.
const NOOP = {
  chatOpen: false,
  openChat() {},
  closeChat() {},
  toggleChat() {},
  guide: null,
  guideTo() {},
  runTour() {},
  advance() {},
  dismissGuide() {},
}

export const usePenny = () => useContext(PennyContext) || NOOP

const seenKey = (k) => `finrep:penny:seen:${k}`
const hasSeen = (k) => {
  try {
    return window.localStorage.getItem(seenKey(k)) === '1'
  } catch {
    return false
  }
}
const markSeen = (k) => {
  try {
    window.localStorage.setItem(seenKey(k), '1')
  } catch {
    /* ignore */
  }
}

export function PennyProvider({ children }) {
  const [chatOpen, setChatOpen] = useState(false)
  // guide: { steps: Step[], index } | null. Step = { targetId, message, cardKey?, action? }.
  const [guide, setGuide] = useState(null)

  const openChat = useCallback(() => {
    setGuide(null)
    setChatOpen(true)
  }, [])
  const closeChat = useCallback(() => setChatOpen(false), [])
  const toggleChat = useCallback(
    () =>
      setChatOpen((o) => {
        if (!o) setGuide(null) // opening chat clears any active guide
        return !o
      }),
    [],
  )

  // Point Penny at a single element. opts.once = a key; when set, the guide is shown
  // only the first time for that key (persisted) so it never nags on return visits.
  const guideTo = useCallback((step, opts = {}) => {
    if (!step?.targetId) return
    if (opts.once && hasSeen(opts.once)) return
    setChatOpen(false)
    setGuide((g) => {
      // Idempotent no-op: a DataHubPage effect may call guideTo every render — if
      // we're already pointing a single guide at this exact target, don't churn state.
      if (g && g.steps.length === 1 && g.steps[0].targetId === step.targetId) return g
      // Mark the once-key ONLY when the guide actually mounts (inside the updater,
      // after the idempotent guard) so it isn't burned on no-op re-calls.
      if (opts.once) markSeen(opts.once)
      return { steps: [step], index: 0 }
    })
  }, [])

  // Multi-step walkthrough (the "Show me around" tour).
  const runTour = useCallback((steps) => {
    const valid = (steps || []).filter((s) => s?.targetId)
    if (!valid.length) return
    setChatOpen(false)
    setGuide({ steps: valid, index: 0 })
  }, [])

  // Advance a tour; clears the guide once past the last step.
  const advance = useCallback(() => {
    setGuide((g) => {
      if (!g) return null
      const next = g.index + 1
      return next >= g.steps.length ? null : { ...g, index: next }
    })
  }, [])

  const dismissGuide = useCallback(() => setGuide(null), [])

  const value = useMemo(
    () => ({
      chatOpen,
      openChat,
      closeChat,
      toggleChat,
      guide,
      guideTo,
      runTour,
      advance,
      dismissGuide,
    }),
    [chatOpen, guide, openChat, closeChat, toggleChat, guideTo, runTour, advance, dismissGuide],
  )

  return <PennyContext.Provider value={value}>{children}</PennyContext.Provider>
}
