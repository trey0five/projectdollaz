// Penny AI — the streaming assistant chat, launched by Penny (the gold coin).
//
// This is now a THIN SHELL: all the brains (the preserved SSE stream loop, the
// growing-message update() closure, proposal confirm/apply, periodId-from-
// localStorage scoping, the activeId guard) live in chat/usePennyChat.js, which
// also layers on smooth token streaming, voice (two-way), sessions/new-chat, and
// attachments. The shell owns the flashy navy→gold frame: an animated Penny
// avatar, a sheen-swept gradient banner, the TTS voice toggle, the history menu,
// a panel-wide drag/drop overlay, an image lightbox, and the mobile bottom sheet.
//
// Assistant markdown is now rendered richly (renderMarkdown in PennyMessage), so
// the literal "**asterisks**" the old plain-text panel printed are gone.
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { X, Volume2, VolumeX } from 'lucide-react'
import { useSchools } from '../../context/SchoolContext.jsx'
import usePennyChat from './chat/usePennyChat.js'
import PennyAvatar from './PennyAvatar.jsx'
import PennyMessageList from './chat/PennyMessageList.jsx'
import PennyInputBar from './chat/PennyInputBar.jsx'
import PennyHistoryMenu from './chat/PennyHistoryMenu.jsx'

export default function PennyChat({ open, onClose }) {
  const { activeId } = useSchools()
  const reduced = useReducedMotion()

  const {
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
    sessions,
    activeSessionId,
    newChat,
    switchSession,
    deleteSession,
    tts,
  } = usePennyChat()

  const [panelDrag, setPanelDrag] = useState(false)
  const [lightboxSrc, setLightboxSrc] = useState(null)
  const inputRef = useRef(null)

  // ESC closes the panel.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Mobile: toggle body.modal-open while the bottom sheet is up (matches the
  // app's modal convention; pauses page-level background motion).
  useEffect(() => {
    if (!open) return
    const isMobile = window.matchMedia('(max-width: 639px)').matches
    if (!isMobile) return
    document.body.classList.add('modal-open')
    return () => document.body.classList.remove('modal-open')
  }, [open])

  // Autofocus the textarea when the panel opens.
  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => inputRef.current?.focus(), 60)
    return () => window.clearTimeout(t)
  }, [open])

  // activeId guard AFTER all hooks (hooks discipline).
  if (!activeId) return null

  const entrance = reduced
    ? { initial: { opacity: 1 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0 } }
    : {
        initial: { opacity: 0, y: 16, scale: 0.98 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: 16, scale: 0.98 },
        transition: { duration: 0.2, ease: 'easeOut' },
      }

  return (
    <div className="no-print">
      <AnimatePresence>
        {open && (
          <motion.div
            {...entrance}
            role="dialog"
            aria-label="Penny AI assistant"
            onDragOver={(e) => {
              if (Array.from(e.dataTransfer.types || []).includes('Files')) {
                e.preventDefault()
                setPanelDrag(true)
              }
            }}
            onDragLeave={(e) => {
              if (e.currentTarget === e.target) setPanelDrag(false)
            }}
            onDrop={(e) => {
              const files = Array.from(e.dataTransfer.files || [])
              setPanelDrag(false)
              if (files.length) {
                e.preventDefault()
                window.dispatchEvent(new CustomEvent('penny:ai-drop-files', { detail: { files } }))
              }
            }}
            className="fixed z-50 flex flex-col overflow-hidden border border-gold/25 bg-cream shadow-login
              inset-x-0 bottom-0 max-h-[92vh] rounded-t-2xl
              sm:inset-x-auto sm:bottom-24 sm:right-5 sm:h-[680px] sm:max-h-[calc(100vh-7rem)] sm:w-[440px] sm:max-w-[calc(100vw-2.5rem)] sm:rounded-2xl
              lg:h-[760px] lg:w-[500px]"
          >
            {/* ── Header — navy→gold gradient banner with a motion-safe sheen
                sweep + gold corner bloom, an animated Penny avatar, an online
                pulse, the voice toggle, history menu, and close. ── */}
            {/* NOTE: the header is NOT overflow-hidden — that would clip the recent-
                chats dropdown (which opens below the header). The decorations are
                clipped by their own inset layer instead. */}
            <header className="relative flex items-center gap-2 border-b border-rule bg-navy-gradient px-4 py-3">
              {/* Decorative layer (clipped to the header so it never bleeds). */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 overflow-hidden"
              >
                {/* Sweeping sheen across the banner. */}
                <span
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent motion-safe:animate-[penny-sheen_9s_ease-in-out_infinite] motion-reduce:hidden"
                  style={{ backgroundSize: '220% 100%' }}
                />
                {/* Soft gold corner bloom. */}
                <span className="absolute -right-6 -top-8 h-32 w-32 rounded-full bg-gold/25 blur-2xl" />
              </span>

              {/* Animated Penny avatar with online pulse dot. */}
              <div className="relative shrink-0">
                <PennyAvatar size={30} active speaking={tts.speaking} />
                <span
                  aria-hidden
                  className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-navy bg-emerald-400 motion-safe:animate-pulse"
                />
              </div>

              <div className="relative min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-white">Penny AI</p>
                <p className="flex items-center gap-1 truncate text-[11px] text-white/55">
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300 motion-safe:animate-pulse"
                  />
                  {busy ? status || 'Working…' : 'Reads your numbers — never guesses.'}
                </p>
              </div>

              {/* Voice-output toggle. Friendly CTA when off; active ping when
                  speaking. Falls back to browser speech if no ElevenLabs key. */}
              {tts.supported && (
                <button
                  type="button"
                  onClick={() => {
                    if (tts.enabled) {
                      tts.setEnabled(false)
                      tts.stop()
                    } else {
                      tts.setEnabled(true)
                      tts.primeForGesture()
                    }
                  }}
                  aria-label={tts.enabled ? 'Mute voice replies' : 'Enable voice replies'}
                  aria-pressed={tts.enabled}
                  title={tts.enabled ? 'Voice on — tap to mute' : 'Voice off — tap to enable'}
                  className={`relative inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition ${
                    tts.enabled
                      ? 'bg-gold-gradient text-navy shadow-sm'
                      : 'border border-white/25 bg-white/10 text-white/90 hover:bg-white/20 hover:text-white'
                  }`}
                >
                  {tts.enabled && tts.speaking && (
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-full bg-gold/40 motion-safe:animate-ping motion-reduce:hidden"
                    />
                  )}
                  {tts.enabled ? (
                    <Volume2 size={14} className="relative" aria-hidden />
                  ) : (
                    <VolumeX size={14} className="relative" aria-hidden />
                  )}
                  <span className="relative hidden whitespace-nowrap sm:inline">
                    {tts.enabled ? 'Voice on' : 'Voice'}
                  </span>
                </button>
              )}

              <div className="relative shrink-0">
                <PennyHistoryMenu
                  sessions={sessions}
                  activeSessionId={activeSessionId}
                  onNewChat={newChat}
                  onSwitch={switchSession}
                  onDelete={deleteSession}
                />
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close Penny AI"
                className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                <X size={16} aria-hidden />
              </button>
            </header>

            <PennyMessageList
              messages={messages}
              busy={busy}
              streamingContent={streamingContent}
              status={status}
              error={error}
              onPick={send}
              onOpenImage={(src) => setLightboxSrc(src)}
              onRetry={retry}
              onConfirmProposal={confirmProposal}
              onSetProposalStatus={setProposalStatus}
              onUndoProposal={undoApplied}
            />

            <PennyInputBar busy={busy} onSubmit={send} inputRef={inputRef} tts={tts} />

            {/* Drag-and-drop overlay (pointer-events-none so the real drop
                target keeps receiving the event). */}
            {panelDrag && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 z-[60] flex items-center justify-center border-4 border-dashed border-gold/80 bg-gold/10"
              >
                <div className="rounded-xl border border-gold/60 bg-white/95 px-4 py-2 text-[14px] font-semibold text-[#7a5e00] shadow-card">
                  Drop a file for Penny to analyze
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Image lightbox — outside the panel so it overlays the full viewport. */}
      <AnimatePresence>
        {lightboxSrc && (
          <motion.div
            initial={{ opacity: reduced ? 1 : 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.15 }}
            role="dialog"
            aria-modal="true"
            aria-label="Attached image preview"
            onClick={() => setLightboxSrc(null)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setLightboxSrc(null)
            }}
            className="fixed inset-0 z-[70] flex cursor-zoom-out items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          >
            <img src={lightboxSrc} alt="Attached" className="max-h-full max-w-full rounded-lg shadow-login" />
            <button
              type="button"
              onClick={() => setLightboxSrc(null)}
              aria-label="Close image preview"
              className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white hover:bg-white/30"
            >
              <X size={18} aria-hidden />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
