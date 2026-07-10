// PennyStudio — the /penny orchestrator. Mounts the ONE Penny engine instance
// (usePennyChat) and composes the studio surfaces around it. The page state-swaps
// on chat.messages.length: a rich landing (hero + tiles + action inbox + rail) vs
// an active conversation (compact hero + transcript + a bottom-docked composer).
//
// No-data-loss guarantee: the composer's typed `value` and the staged attachment
// list both live HERE (lifted state), so even though the composer node renders in
// the hero on the landing and in the bottom dock during a conversation, a half-
// typed message + staged files survive the swap. The hands-free control stays
// mounted in the hero. There is exactly ONE usePennyChat() and the page calls
// chat.send() directly — it never dispatches penny:ai-ask.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { UploadCloud } from 'lucide-react'
import usePennyChat from '../chat/usePennyChat.js'
import { stageFiles, MAX_FILES } from '../chat/stageAttachments.js'
import { useSchools } from '../../../context/SchoolContext.jsx'
import { useAuth } from '../../../context/AuthContext.jsx'
import { usePersistence } from '../../../context/PersistenceContext.jsx'
import StudioHero from './StudioHero.jsx'
import StudioAskBar from './StudioAskBar.jsx'
import StudioCapabilityTiles from './StudioCapabilityTiles.jsx'
import StudioRecipes from './StudioRecipes.jsx'
import StudioActionInbox from './StudioActionInbox.jsx'
import StudioRail from './StudioRail.jsx'
import StudioActivity from './StudioActivity.jsx'
import StudioParticles from './StudioParticles.jsx'
import StudioConversation from './StudioConversation.jsx'

const PERIOD_KEY = 'finrep_active_period'

export default function PennyStudio() {
  const reduce = useReducedMotion()
  const chat = usePennyChat()
  const { activeId, activeSchool } = useSchools()
  const { user } = useAuth()
  const { periods } = usePersistence()

  const inConversation = chat.messages.length > 0
  const name = user?.first_name || 'there'
  const canEdit = activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'

  // Always land on the rich landing, never a resumed transcript. usePennyChat
  // hydrates the last session on mount (messages > 0), which would open the page
  // straight into a full-screen chat. Once (per visit), reset to a fresh chat so
  // the hero + tiles + inbox show first; the prior chat stays in Recent
  // conversations for the user to resume deliberately.
  //
  // CRITICAL: only reset a *hydrated* prior session — NOT the user's own first
  // send. `engagedRef` flips true the instant the user sends or resumes (via the
  // wrapped `engagedChat` below), so a first message on a school with no prior
  // session enters the conversation instead of being wiped.
  const engagedRef = useRef(false)
  const didResetRef = useRef(false)
  useEffect(() => {
    if (didResetRef.current) return
    if (chat.messages.length > 0 && !engagedRef.current) {
      didResetRef.current = true
      chat.newChat()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.messages.length])

  // A view of the engine whose send/switchSession mark the visit "engaged" so the
  // landing-reset above never wipes a conversation the user themselves started.
  const engagedChat = useMemo(
    () => ({
      ...chat,
      send: (text, opts) => {
        engagedRef.current = true
        return chat.send(text, opts)
      },
      switchSession: (id) => {
        engagedRef.current = true
        return chat.switchSession(id)
      },
    }),
    [chat],
  )

  // ── Period: the inbox + chat must agree. Prefer the stored active period; else
  // fall back to the newest snapshot period and persist it (PeriodSelector writes
  // the same key), so a first visit still scopes the briefing + Penny alike.
  const savedPeriods = useMemo(() => (periods || []).filter((p) => p.hasSnapshot), [periods])
  const [periodId, setPeriodId] = useState(() => {
    try {
      return localStorage.getItem(PERIOD_KEY) || null
    } catch {
      return null
    }
  })
  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      let stored = null
      try {
        stored = localStorage.getItem(PERIOD_KEY)
      } catch {
        stored = null
      }
      if (stored) {
        setPeriodId((cur) => (cur === stored ? cur : stored))
        return
      }
      const fallback = savedPeriods[0]?.id ?? null
      if (fallback) {
        try {
          localStorage.setItem(PERIOD_KEY, fallback)
        } catch {
          /* ignore */
        }
        setPeriodId((cur) => (cur === fallback ? cur : fallback))
      }
    })
    return () => {
      cancelled = true
    }
  }, [savedPeriods])

  // ── Composer text (lifted so it survives the hero↔dock swap) ─────────────────
  const [value, setValue] = useState('')
  const [focusNonce, setFocusNonce] = useState(0)

  // ── Shared staging (one attachment list for the dropzone + ask bar) ──────────
  const [attachments, setAttachments] = useState([])
  const [toast, setToast] = useState(null)
  // Latest attachments mirrored into a ref (updated in an effect, never during
  // render) so the async stager can read the current count without a stale closure.
  const attachmentsRef = useRef(attachments)
  useEffect(() => {
    attachmentsRef.current = attachments
  }, [attachments])

  useEffect(() => {
    if (!toast) return undefined
    const t = window.setTimeout(() => setToast(null), 3400)
    return () => window.clearTimeout(t)
  }, [toast])

  const stageToBar = useCallback(async (files) => {
    const staged = await stageFiles(files, setToast)
    if (!staged.length) return
    const room = MAX_FILES - attachmentsRef.current.length
    if (room <= 0) {
      setToast(`Up to ${MAX_FILES} files per message.`)
      return
    }
    const accepted = staged.slice(0, room)
    if (accepted.length < staged.length) {
      setToast(`Only the first ${room} file${room === 1 ? '' : 's'} were attached.`)
    }
    setAttachments((prev) => [...prev, ...accepted])
  }, [])

  const staging = {
    attachments,
    stageFiles: stageToBar,
    removeAttachment: (id) => setAttachments((prev) => prev.filter((a) => a.local_id !== id)),
    clear: () => setAttachments([]),
    someUnready: attachments.some((a) => a.status !== 'ready'),
    toast,
  }

  // ── Actions ──────────────────────────────────────────────────────────────────
  const runPrompt = useCallback((text) => engagedChat.send(text), [engagedChat])
  const onSelectTile = useCallback(
    (tile) => {
      if (tile.mode === 'send') engagedChat.send(tile.prompt)
      else {
        setValue(tile.prompt)
        setFocusNonce((n) => n + 1)
      }
    },
    [engagedChat],
  )

  // ── Drop-anything auto-file ──────────────────────────────────────────────────
  const [dragging, setDragging] = useState(false)

  // Window-level guards. `dragover`/`drop` preventDefault so a stray drop never
  // navigates the browser. The drop/dragend/leave-window handlers ALWAYS clear the
  // overlay — registered in the CAPTURE phase so they fire even when a child (the
  // ask bar) calls stopPropagation on its own drop, and even when the file leaves
  // the window over a child (which never triggers the root dragleave guard).
  useEffect(() => {
    const onDragOver = (e) => e.preventDefault()
    const onWinDrop = (e) => {
      e.preventDefault()
      setDragging(false)
    }
    const onDragEnd = () => setDragging(false)
    const onWinDragLeave = (e) => {
      if (
        e.clientX <= 0 ||
        e.clientY <= 0 ||
        e.clientX >= window.innerWidth ||
        e.clientY >= window.innerHeight
      ) {
        setDragging(false)
      }
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onWinDrop, true)
    window.addEventListener('dragend', onDragEnd, true)
    window.addEventListener('dragleave', onWinDragLeave, true)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onWinDrop, true)
      window.removeEventListener('dragend', onDragEnd, true)
      window.removeEventListener('dragleave', onWinDragLeave, true)
    }
  }, [])

  const onRootDragOver = (e) => {
    if (Array.from(e.dataTransfer.types || []).includes('Files')) {
      e.preventDefault()
      setDragging(true)
    }
  }
  const onRootDragLeave = (e) => {
    if (e.currentTarget === e.target) setDragging(false)
  }
  const onRootDrop = async (e) => {
    e.preventDefault()
    setDragging(false)
    const files = Array.from(e.dataTransfer.files || [])
    if (!files.length) return
    const staged = await stageFiles(files, setToast)
    if (staged.length) engagedChat.send('', { attachments: staged })
  }

  const askBar = (
    <StudioAskBar
      variant={inConversation ? 'docked' : 'hero'}
      chat={engagedChat}
      staging={staging}
      value={value}
      onChange={setValue}
      focusNonce={focusNonce}
    />
  )

  const swap = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.15 } }
    : {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: 8 },
        transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
      }

  return (
    <div
      className="relative h-full overflow-hidden bg-page-glow"
      onDragOver={onRootDragOver}
      onDragLeave={onRootDragLeave}
      onDrop={onRootDrop}
    >
      {/* Ambient drifting-particle field behind a conversation so the light page
          doesn't read as flat while Penny works. Landing has its own hero backdrop. */}
      {inConversation && <StudioParticles />}
      {inConversation ? (
        /* Conversation: a FIXED-HEIGHT flex column (viewport minus the app-shell's
           h-14 top strip). The slim hero sits on top, the transcript fills the
           middle and scrolls on its own, and the composer is a flex child at the
           bottom — NOT a floating sticky bar — so it can never cover the last
           message and the transcript always scrolls clear of it. */
        <div className="relative z-10 mx-auto flex h-full max-w-[1160px] flex-col px-4 pt-4 sm:px-6">
          <div className="shrink-0">
            <StudioHero compact name={name} chat={engagedChat} askBar={null} onNewChat={chat.newChat} />
          </div>
          <div className="mt-4 min-h-0 flex-1">
            <StudioConversation chat={engagedChat} />
          </div>
          <div className="mt-3 shrink-0 rounded-t-2xl border-t border-rule/60 bg-cream/95 px-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
            <div className="mx-auto max-w-[820px]">{askBar}</div>
          </div>
        </div>
      ) : (
        /* Landing: scrolls internally (the page itself doesn't scroll). */
        <div className="relative z-10 mx-auto h-full max-w-[1160px] overflow-y-auto px-4 py-6 sm:px-6">
          <StudioHero compact={false} name={name} chat={engagedChat} askBar={askBar} onNewChat={chat.newChat} />
          <motion.div {...swap} className="mt-6 space-y-10 pb-24">
            <StudioCapabilityTiles onSelect={onSelectTile} canEdit={canEdit} />
            <StudioRecipes onRun={runPrompt} />
            {/* min-w-0 on both tracks so the fr ratios are honoured — without it
                a grid child defaults to min-content width (long activity rows that
                won't wrap), ballooning the right track and crushing the inbox. */}
            <div className="grid items-start gap-5 lg:grid-cols-[1.35fr_1fr]">
              <div className="min-w-0">
                <StudioActionInbox schoolId={activeId} periodId={periodId} onHandle={runPrompt} />
              </div>
              <div className="min-w-0 space-y-5">
                <StudioRail chat={engagedChat} onPick={runPrompt} />
                <StudioActivity schoolId={activeId} canEdit={canEdit} />
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Drop-anything overlay */}
      <AnimatePresence>
        {dragging && (
          <motion.div
            key="drop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            aria-hidden
            className="pointer-events-none fixed inset-0 z-[65] flex items-center justify-center bg-navy-deep/40 backdrop-blur-sm"
          >
            <div className="mx-4 flex items-center gap-3 rounded-2xl border-2 border-dashed border-penny bg-[#fffef8] px-6 py-5 text-center shadow-login">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-penny-gradient text-navy shadow-penny-glow">
                <UploadCloud size={22} aria-hidden />
              </span>
              <p className="max-w-[38ch] text-[14px] font-semibold text-navy">
                Drop a trial balance, budget, invoice, policy, or minutes — Penny files it automatically.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
