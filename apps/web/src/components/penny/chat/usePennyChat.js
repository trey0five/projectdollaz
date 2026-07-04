// usePennyChat — the brain behind the Penny AI chat panel.
//
// This hook absorbs the ORIGINAL PennyChat.send() streaming loop VERBATIM (the
// fetch → getReader() → buf.split('\n\n') → JSON.parse(line.slice(5)) → switch on
// ev.type machinery, the update() growing-message closure, the proposal apply
// path, the activeId guard, and periodId from localStorage 'finrep_active_period').
// On top of that frozen core it layers:
//   • smooth token streaming  (useSmoothStream)
//   • voice-out               (useTextToSpeech, two-way w/ graceful fallback)
//   • new-chat / recent-chats (useAiChatSessions, localStorage only)
//   • attachments on the latest user turn (wire shape per the frozen contract)
//
// The SSE vocabulary is UNCHANGED: delta | status | chart | proposal | error | done.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSchools } from '../../../context/SchoolContext.jsx'
import { usePenny } from '../../../context/PennyContext.jsx'
import { tokenStore, apiErrorMessage, assistantApi } from '../../../lib/api.js'
import { useTextToSpeech } from '../hooks/useTextToSpeech.js'
import { useSmoothStream } from '../hooks/useSmoothStream.js'
import { useAiChatSessions } from '../hooks/useAiChatSessions.js'

// A confirmed module-create proposal → the domain refresh key to broadcast so an
// open register page refetches. Mirrors the API's REFRESH map for these kinds; any
// kind not listed here falls through the confirmProposal branches to a no-op.
const CONFIRM_REFRESH_KEYS = {
  create_policy: 'governance',
  create_committee: 'governance',
  create_meeting: 'governance',
  create_standard: 'accreditation',
  create_maintenance_item: 'facilities',
  create_campaign: 'advancement',
  create_alert: 'alerts',
}

// tool → the domain refresh keys to broadcast after an UNDO reverses that action, so
// an open register/data page refetches without a reload. Mirrors each create's own
// refresh keys (an unknown/off-page key is a harmless no-op via agentRefresh).
const UNDO_REFRESH_KEYS = {
  create_policy: ['governance'],
  create_committee: ['governance'],
  create_meeting: ['governance'],
  create_standard: ['accreditation'],
  create_maintenance_item: ['facilities'],
  create_campaign: ['advancement'],
  create_alert: ['alerts'],
  create_task: ['tasks'],
  file_document: ['knowledge', 'facilities'],
  import_trial_balance: ['dataStatus', 'metrics'],
}

// Map a locally-staged attachment to the FROZEN wire shape the backend expects.
// Local: { local_id, name, mime, kind, dataBase64, preview?, status }
// Wire:  { name, kind, mimeType, size, dataBase64 }
function toWireAttachment(a) {
  return {
    name: a.name,
    kind: a.kind,
    mimeType: a.mime,
    // size is the decoded byte length; base64 expands ~4/3, so derive it.
    size: Math.floor((a.dataBase64?.length || 0) * 0.75),
    dataBase64: a.dataBase64,
  }
}

export default function usePennyChat() {
  const { activeId } = useSchools()

  // Penny's agentic surface (navigate / refresh / guide). Mirrored into a latest-
  // ref so send() can drive it WITHOUT listing penny as a dep — otherwise send()
  // would be re-created on every PennyContext value change, churning consumers.
  const penny = usePenny()
  const pennyRef = useRef(penny)
  pennyRef.current = penny

  const tts = useTextToSpeech(activeId)
  const smooth = useSmoothStream()
  const sessions = useAiChatSessions(activeId)

  // These hooks return a fresh object each render (smooth.displayed changes every
  // animation frame while streaming). Mirror them into latest-refs so the callbacks
  // below can use them WITHOUT listing them as deps — otherwise send()/abortLive()
  // would be re-created 60×/s during a stream, churning every consumer.
  const smoothRef = useRef(smooth)
  smoothRef.current = smooth
  const ttsRef = useRef(tts)
  ttsRef.current = tts
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions

  const [messages, setMessages] = useState([]) // { role, content, charts?, proposals?, status? }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  // The in-flight assistant streaming text (smoothed for display). The committed
  // transcript lives in `messages`; this mirrors the current assistant turn so
  // the list can render a caret-tailed streaming bubble.
  const streamingContent = smooth.displayed
  const [status, setStatus] = useState('')

  // Abort the live stream when the user starts a new chat / switches sessions.
  const abortRef = useRef(null)
  // Guard so a stale stream (school switched mid-flight) can't clobber state.
  const activeIdRef = useRef(activeId)
  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

  // ── Session hydration: load the active stored transcript when the identity
  // (school + session id) changes. This is a sync-from-external-store (loading a
  // localStorage transcript), keyed on a changing identity — NOT a render loop:
  // the hydratedKeyRef guard ensures the setState runs once per distinct key, so
  // it never cascades. localStorage only; attachment bytes were stripped on
  // persist, so hydrated user turns carry text + any preview-less chip refs.
  const activeSessionId = sessions.activeSessionId
  const hydratedKeyRef = useRef(null)
  useEffect(() => {
    if (!activeId) return
    const key = `${activeId}:${activeSessionId}`
    if (hydratedKeyRef.current === key) return
    hydratedKeyRef.current = key
    const loaded = sessions.loadActive()
    setMessages(Array.isArray(loaded?.messages) ? loaded.messages : [])
    setError(null)
    setStatus('')
    smooth.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, activeSessionId])

  // ── Debounced persistence of the active transcript. The sessions hook strips
  // attachment dataBase64 internally; we just hand it the current messages.
  useEffect(() => {
    if (!activeId) return
    const id = window.setTimeout(() => {
      sessions.persist(messages)
    }, 400)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, activeId, activeSessionId])

  const setProposalStatus = useCallback((mi, pi, st) => {
    setMessages((m) => {
      const copy = [...m]
      const msg = { ...copy[mi] }
      const props = [...(msg.proposals || [])]
      props[pi] = { ...props[pi], status: st }
      msg.proposals = props
      copy[mi] = msg
      return copy
    })
  }, [])

  // Merge an arbitrary patch onto one proposal (used to attach undo affordances +
  // flip a card to Undone). Same immutable-copy shape as setProposalStatus.
  const patchProposal = useCallback((mi, pi, patch) => {
    setMessages((m) => {
      const copy = [...m]
      const msg = { ...copy[mi] }
      const props = [...(msg.proposals || [])]
      props[pi] = { ...props[pi], ...patch }
      msg.proposals = props
      copy[mi] = msg
      return copy
    })
  }, [])

  // Undo a reversible action straight from its chat receipt. Reads the audit id +
  // tool the card captured (from either the autonomous `applied` event or the
  // confirm-then-apply response), calls the undo route, then flips the card to
  // "Undone" and broadcasts the reverse's refresh keys. Already-undone is idempotent
  // server-side (200), so a double-tap is safe; a hard failure shows a soft error.
  const undoApplied = useCallback(
    async (mi, pi, proposal) => {
      const auditId = proposal?.auditId
      const tool = proposal?.undoTool || proposal?.tool || proposal?.targetType
      if (!auditId || proposal?.undone || proposal?.status === 'undoing') return
      patchProposal(mi, pi, { status: 'undoing' })
      try {
        await assistantApi.undoActivity(activeIdRef.current, auditId)
        patchProposal(mi, pi, { undone: true, status: 'undone' })
        pennyRef.current?.agentRefresh?.(UNDO_REFRESH_KEYS[tool] || [])
      } catch {
        patchProposal(mi, pi, { status: 'undo-error' })
      }
    },
    [patchProposal],
  )

  const confirmProposal = useCallback(
    // `destination` is an OPTIONAL override from the file_document destination picker
    // (ProposalCard). When present we merge it into the action payload so the backend
    // files to the user's PICKED destination (it re-validates + clamps it server-side).
    async (mi, pi, action, destination) => {
      setProposalStatus(mi, pi, 'applying')
      try {
        const outbound =
          action?.kind === 'file_document' && destination
            ? { ...action, payload: { ...(action.payload ?? {}), destination } }
            : action
        const res = await assistantApi.apply(activeIdRef.current, outbound) // UNCHANGED apply path
        const applied = res?.data || {}
        // Attach the action-log affordances so the confirmed card can offer an inline
        // Undo (auditId + reversible come from the extended /apply response). undoTool
        // pins the kind so undoApplied broadcasts the right refresh keys.
        patchProposal(mi, pi, {
          status: 'applied',
          auditId: applied.auditId ?? null,
          targetId: applied.targetId ?? null,
          reversible: !!applied.reversible,
          undoTool: action?.kind,
        })
        // A confirmed create_task now exists server-side — broadcast so an open
        // Tasks page (useTasks) refetches. The autonomous 'applied' SSE path already
        // refreshes via ev.refresh; the proposal/confirm path needs this explicitly.
        if (
          action?.kind === 'create_task' ||
          action?.kind === 'submit_for_approval' ||
          action?.kind === 'decide_approval'
        ) {
          pennyRef.current?.agentRefresh?.(['tasks'])
        } else if (action?.kind === 'file_document') {
          // A confirmed file_document now exists in the Knowledge store — broadcast so
          // an open Knowledge list (useDocuments) refetches without a manual reload. A
          // 'facilities' filing ALSO created a maintenance item, so refresh that surface
          // too (harmless no-op when no facilities list is open / for a plain filing).
          const chosen = destination || outbound?.payload?.destination
          pennyRef.current?.agentRefresh?.(
            chosen === 'facilities' ? ['knowledge', 'facilities'] : ['knowledge'],
          )
        } else if (CONFIRM_REFRESH_KEYS[action?.kind]) {
          // A confirmed module-create (policy/committee/meeting/standard/maintenance/
          // campaign) now exists — broadcast its domain key so an open register page
          // (usePolicies/useCommittees/… listeners) refetches. agentRefresh dispatches
          // a per-key 'penny:data-changed' window event; an unknown/off-page key is a
          // harmless no-op, so this never breaks the existing refresh handling.
          pennyRef.current?.agentRefresh?.([CONFIRM_REFRESH_KEYS[action.kind]])
        }
      } catch {
        setProposalStatus(mi, pi, 'error')
      }
    },
    [setProposalStatus, patchProposal],
  )

  // ── The core send(). text is the typed prompt; opts.attachments are locally
  // staged files (latest-turn only). Early-returns per the frozen contract.
  const send = useCallback(
    async (text, opts = {}) => {
      const attachments = opts.attachments || []
      const q = (text ?? '').trim()
      if ((!q && attachments.length === 0) || busy || !activeId) return

      // Title the session from the first user message (no-op after first).
      if (q) sessionsRef.current.setTitleFromFirstMessage(q)

      // Build the history exactly as before — role/content pairs only. The new
      // user turn carries no bytes in the transcript (bytes ride the request
      // body's attachments array, latest turn only).
      const history = [...messages, { role: 'user', content: q }].map((m) => ({
        role: m.role,
        content: m.content,
      }))

      // The displayed user message keeps lightweight attachment chips (no bytes)
      // so the bubble can show thumbnails; bytes are dropped on persist anyway.
      const userChips = attachments.map((a) => ({
        name: a.name,
        kind: a.kind,
        mime: a.mime,
        preview: a.preview,
      }))
      setMessages((m) => [
        ...m,
        { role: 'user', content: q, attachments: userChips },
        { role: 'assistant', content: '', charts: [], proposals: [], status: '' },
      ])
      setBusy(true)
      setError(null)
      setStatus('')
      smoothRef.current.reset()
      ttsRef.current.reset()

      let content = ''
      let charts = []
      let proposals = []
      let st = ''
      const update = () =>
        setMessages((m) => {
          const copy = [...m]
          copy[copy.length - 1] = { role: 'assistant', content, charts, proposals, status: st }
          return copy
        })

      const controller = new AbortController()
      abortRef.current = controller

      try {
        let periodId = null
        try {
          periodId = localStorage.getItem('finrep_active_period') || null
        } catch {
          periodId = null
        }
        const wireAttachments = attachments.map(toWireAttachment)
        const token = tokenStore.getAccess()
        const res = await fetch(assistantApi.chatStreamUrl(activeId), {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({
            messages: history,
            ...(periodId ? { periodId } : {}),
            ...(wireAttachments.length ? { attachments: wireAttachments } : {}),
          }),
        })
        if (!res.ok || !res.body) {
          content = 'Sorry — I hit an error answering that.'
          setError(content)
          update()
          return
        }
        const reader = res.body.getReader()
        const dec = new TextDecoder()
        let buf = ''
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          // Stale-stream guard: school switched mid-flight → drop this stream.
          if (activeIdRef.current !== activeId) {
            try { await reader.cancel() } catch { /* ignore */ }
            return
          }
          buf += dec.decode(value, { stream: true })
          const parts = buf.split('\n\n')
          buf = parts.pop() ?? ''
          for (const part of parts) {
            const line = part.split('\n').find((l) => l.startsWith('data:'))
            if (!line) continue
            let ev
            try {
              ev = JSON.parse(line.slice(5).trim())
            } catch {
              continue
            }
            if (ev.type === 'delta') {
              st = ''
              content += ev.text
              smoothRef.current.setTarget(content) // smooth token streaming
              ttsRef.current.feed(content) // voice-out: cumulative text → sentence chunking
              setStatus('')
              update()
            } else if (ev.type === 'status') {
              st = ev.text
              setStatus(ev.text)
              update()
            } else if (ev.type === 'chart') {
              charts = [...charts, ev.spec]
              update()
            } else if (ev.type === 'proposal') {
              // Legacy proposal/confirm path — kept for back-compat (no tool emits
              // this anymore; writes are now autonomous via `applied`).
              proposals = [...proposals, { action: ev.action, status: 'pending' }]
              update()
            } else if (ev.type === 'navigate') {
              // Penny moved the user to a page/modal — drive react-router via the
              // agent bridge (NOT useNavigate here, so send() stays stable).
              pennyRef.current.agentNavigate({
                page: ev.page,
                section: ev.section,
                openModal: ev.openModal,
              })
            } else if (ev.type === 'applied') {
              // Autonomous write already executed server-side: render a terminal
              // "what I changed" card (rides the same proposals[] array, applied:true
              // + terminal status so it rehydrates statically) and refresh the data.
              proposals = [
                ...proposals,
                {
                  applied: true,
                  tool: ev.tool,
                  summary: ev.summary,
                  details: ev.details || [],
                  periodId: ev.periodId,
                  // Action-log affordances so the receipt can render an inline Undo
                  // (only a TB import is reversible among the autonomous write tools).
                  targetType: ev.targetType,
                  targetId: ev.targetId ?? null,
                  auditId: ev.auditId ?? null,
                  reversible: !!ev.reversible,
                  status: ev.tool === 'import_trial_balance' ? 'imported' : 'applied',
                },
              ]
              update()
              pennyRef.current.agentRefresh(ev.refresh || [])
            } else if (ev.type === 'guide') {
              // Interactive on-screen walkthrough — drive the existing Penny glide.
              pennyRef.current.runAgentGuide(ev.steps)
            } else if (ev.type === 'error') {
              content = content || ev.text
              st = ''
              setStatus('')
              update()
            } else if (ev.type === 'done') {
              break
            }
          }
        }
        // Loop exit / done: flush the smoothed display + the final TTS sentence.
        st = ''
        setStatus('')
        smoothRef.current.flush()
        ttsRef.current.flush(content)
        update()
      } catch (e) {
        if (e?.name === 'AbortError') return // user started a new chat — silent
        content = content || apiErrorMessage(e, 'Sorry — I hit an error answering that.')
        st = ''
        setError(content)
        setStatus('')
        update()
      } finally {
        smoothRef.current.reset()
        ttsRef.current.reset()
        abortRef.current = null
        setBusy(false)
      }
    },
    // messages is intentionally a dep so history is fresh; smooth/tts/sessions are
    // accessed via latest-refs so send() stays stable across streaming frames.
    [activeId, busy, messages],
  )

  // ── One-click "ask Penny" bridge (e.g. HomeBriefing's "Brief me" button).
  // Mirrors the existing window CustomEvent transport (penny:ai-drop-files):
  // an outside surface dispatches 'penny:ai-ask' with { text }, and here — inside
  // the always-mounted chat hook — we open the panel and route the text through
  // the SAME send() streaming path a typed message uses (so get_briefing runs
  // server-side identically). send()'s busy guard no-ops any accidental double-fire.
  // Read send through a latest-ref so the listener subscribes ONCE — send is a
  // useCallback that changes on every message/streaming tick, and re-binding the
  // window listener per token is wasteful (and could drop an event mid-swap).
  const sendRef = useRef(send)
  sendRef.current = send
  useEffect(() => {
    const onAsk = (e) => {
      const text = e?.detail?.text
      if (!text) return
      pennyRef.current?.openChat?.()
      sendRef.current(text)
    }
    window.addEventListener('penny:ai-ask', onAsk)
    return () => window.removeEventListener('penny:ai-ask', onAsk)
  }, [])

  const retry = useCallback(() => {
    // Re-send the last user message (drop the failed assistant turn + that user
    // turn, then resend its text). Mirrors the simple Nagare retry.
    let lastUser = null
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUser = messages[i]
        break
      }
    }
    if (!lastUser) return
    setMessages((m) => {
      // Trim trailing assistant + that user turn so send() re-appends cleanly.
      const copy = [...m]
      while (copy.length && copy[copy.length - 1].role === 'assistant') copy.pop()
      if (copy.length && copy[copy.length - 1].role === 'user') copy.pop()
      return copy
    })
    setError(null)
    // Defer so the trim commits before send() reads `messages`.
    window.setTimeout(() => send(lastUser.content), 0)
  }, [messages, send])

  // Tear down an in-flight stream + voice (used by new-chat / switch).
  const abortLive = useCallback(() => {
    try { abortRef.current?.abort() } catch { /* ignore */ }
    abortRef.current = null
    ttsRef.current.stop()
    smoothRef.current.reset()
    setBusy(false)
    setStatus('')
  }, [])

  const newChat = useCallback(() => {
    abortLive()
    sessionsRef.current.newChat()
    setMessages([])
    setError(null)
  }, [abortLive])

  const switchSession = useCallback(
    (id) => {
      abortLive()
      sessionsRef.current.switchSession(id)
      // hydration effect (keyed on activeSessionId) loads the transcript
    },
    [abortLive],
  )

  const deleteSession = useCallback(
    (id) => {
      sessionsRef.current.deleteSession(id)
    },
    [],
  )

  return {
    messages,
    streamingContent,
    status,
    busy,
    error,
    send,
    retry,
    setProposalStatus,
    confirmProposal,
    undoApplied,
    sessions: sessions.sessions,
    activeSessionId: sessions.activeSessionId,
    newChat,
    switchSession,
    deleteSession,
    tts,
  }
}
