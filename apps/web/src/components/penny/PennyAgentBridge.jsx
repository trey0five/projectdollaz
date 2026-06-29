// PennyAgentBridge — the headless glue between Penny's agentic intents (held in
// PennyContext) and react-router + the DataHub modal. It renders nothing.
//
// WHY a bridge (not useNavigate in the chat hook): usePennyChat must stay mounted
// with a STABLE send() — adding router hooks there would either churn send() or
// require navigation outside <Router>. Instead the chat hook only sets INTENT on
// PennyContext; this component (mounted inside <Router> AND <PennyProvider>) owns
// the actual navigate() + the DataHub modal-open CustomEvent.
//
// Two effects, both pure side-effects with cleanup (no setState):
//   1) navIntent  → navigate to the target path; if it's the Data hub with a
//      modal, dispatch 'penny:open-datahub-modal' AFTER navigation commits (a
//      0ms timer lets DataHubPage mount its listener first); then consume.
//   2) guide.agent active-step nav → navigate-then-glide. Deduped per step so a
//      re-render doesn't re-fire; Penny.jsx's measurement retry self-sequences
//      the glide once the (possibly newly-navigated) target mounts.
import { useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { usePenny } from '../../context/PennyContext.jsx'

// Contract section B route map: PageKey (+ optional settings section) → path.
function pageToPath(page, section) {
  switch (page) {
    case 'home':
      return '/'
    case 'data':
      return '/data'
    case 'statements':
      return '/statements'
    case 'analytics':
      return '/analytics'
    case 'budget':
      return '/budget'
    case 'readiness':
      return '/readiness'
    case 'reports':
      return '/reports'
    case 'schedules':
      return '/reports/schedules'
    case 'settings':
      return '/settings' + (section ? `/${section}` : '')
    default:
      return null
  }
}

export default function PennyAgentBridge() {
  const navigate = useNavigate()
  const location = useLocation()
  const { navIntent, consumeNavIntent, guide, agentNavigate } = usePenny()

  // ── (1) One-shot navigate intent (from a `navigate` SSE event). ──────────────
  useEffect(() => {
    if (!navIntent) return undefined
    const { page, section, openModal } = navIntent
    const path = pageToPath(page, section)
    if (path && path !== location.pathname) {
      navigate(path)
    }
    let timer
    if (page === 'data' && openModal) {
      // Defer so DataHubPage has (re)mounted its modal listener after navigate.
      timer = window.setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent('penny:open-datahub-modal', { detail: { openKey: openModal } }),
        )
      }, 0)
    }
    consumeNavIntent()
    return () => {
      if (timer) window.clearTimeout(timer)
    }
    // location.pathname intentionally excluded: navIntent is the trigger and is
    // consumed immediately; reading the current path is a one-shot comparison.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navIntent])

  // ── (2) Per-step agent-guide navigation (navigate-then-glide). ───────────────
  const lastNavKeyRef = useRef(null)
  useEffect(() => {
    if (!guide?.agent) {
      lastNavKeyRef.current = null
      return
    }
    const step = guide.steps[guide.index]
    const nav = step?.nav
    if (!nav?.page) return
    const key = `${guide.index}:${nav.page}:${nav.openModal || ''}`
    if (lastNavKeyRef.current === key) return
    lastNavKeyRef.current = key
    agentNavigate({ page: nav.page, openModal: nav.openModal })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guide?.agent, guide?.index])

  return null
}
