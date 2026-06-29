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
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { resolveTarget } from '../components/penny/guide/targetRegistry.js'

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
  // Agentic surface (driven by Penny's `navigate` / `applied` / `guide` SSE events).
  navIntent: null,
  agentNavigate() {},
  consumeNavIntent() {},
  agentRefresh() {},
  runAgentGuide() {},
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
  // guide: { steps: Step[], index, agent? } | null.
  //   Step (page tours)  = { targetId, message, cardKey?, action? }
  //   Step (agent guides) = { targetId, message, nav?:{page,openModal?}, ctaLabel? }
  // The `agent` flag marks an LLM-driven walkthrough so PennyAgentBridge drives
  // per-step navigation and Penny.jsx shows Done even on a single step.
  const [guide, setGuide] = useState(null)

  // navIntent: a one-shot { page, section?, openModal? } the bridge consumes to
  // navigate (+ open a DataHub modal). navNonceRef lets a repeat navigate to the
  // SAME page still re-fire the effect (object identity changes via the nonce).
  const [navIntent, setNavIntent] = useState(null)
  const navNonceRef = useRef(0)

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

  // ── Agentic surface ─────────────────────────────────────────────────────────
  // Set a navigation intent (consumed by PennyAgentBridge). The nonce guarantees a
  // fresh object even when navigating to the page we're already on, so the bridge's
  // effect always re-runs (e.g. re-open the same modal mid-walkthrough).
  const agentNavigate = useCallback((intent) => {
    if (!intent?.page) return
    navNonceRef.current += 1
    setNavIntent({ ...intent, _nonce: navNonceRef.current })
  }, [])
  const consumeNavIntent = useCallback(() => setNavIntent(null), [])

  // Broadcast a data-changed signal per refresh key; pages listen and refetch.
  const agentRefresh = useCallback((keys) => {
    for (const key of keys || []) {
      if (!key) continue
      window.dispatchEvent(new CustomEvent('penny:data-changed', { detail: { key } }))
    }
  }, [])

  // Translate an LLM walkthrough (registry keys) into the existing guide shape,
  // attaching per-step navigation so the coin can cross pages/modals. Reuses the
  // SAME guide state + Penny.jsx glide — this only maps keys → domIds.
  const runAgentGuide = useCallback((agentSteps) => {
    const steps = (agentSteps || [])
      .map((s) => {
        const t = resolveTarget(s?.target)
        if (!t) return null
        return {
          targetId: t.domId,
          message: s.message,
          nav: { page: s.page ?? t.page, openModal: s.openModal ?? t.openModal },
          ctaLabel: s.cta?.label,
        }
      })
      .filter(Boolean)
    if (!steps.length) return
    setChatOpen(false)
    setGuide({ steps, index: 0, agent: true })
  }, [])

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
      navIntent,
      agentNavigate,
      consumeNavIntent,
      agentRefresh,
      runAgentGuide,
    }),
    [
      chatOpen,
      guide,
      openChat,
      closeChat,
      toggleChat,
      guideTo,
      runTour,
      advance,
      dismissGuide,
      navIntent,
      agentNavigate,
      consumeNavIntent,
      agentRefresh,
      runAgentGuide,
    ],
  )

  return <PennyContext.Provider value={value}>{children}</PennyContext.Provider>
}
