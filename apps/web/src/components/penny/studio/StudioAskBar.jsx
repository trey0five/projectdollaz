// StudioAskBar — the bespoke Penny Studio composer (the mockup `.ask` pill). A
// cream pill with an auto-growing textarea, a rotating placeholder, an attach
// button, a dictation mic, and a gold send button. It composes the SHARED engine:
// submit() calls chat.send() directly (never dispatches penny:ai-ask).
//
// CONTROLLED: the typed `value` lives in PennyStudio (like `staging`), so the
// composer can render in the hero on the landing and as a bottom-docked bar in a
// conversation WITHOUT losing the half-typed message or staged files across the
// swap. Only the dictation-mic session is local (an in-flight dictation ends on
// the swap, which is fine — it never auto-sends).
//
// The dictation mic mirrors PennyInputBar: interim transcript appends to the typed
// base and NEVER auto-sends (only hands-free mode auto-sends, handled in the hero).
import { useEffect, useRef, useState } from 'react'
import { Loader2, Mic, Paperclip, Send } from 'lucide-react'
import { useSpeechInput } from '../hooks/useSpeechInput.js'
import { ACCEPT, MAX_FILES } from '../chat/stageAttachments.js'
import PennyAttachmentChip from '../chat/PennyAttachmentChip.jsx'

const PLACEHOLDERS = [
  'Ask Penny anything, or drop a file to get started…',
  'Turn my June trial balance into statements…',
  'Draft the treasurer’s narrative for Thursday…',
  'How does our cash compare to last year?',
  'Add a new enrollment policy to governance…',
]

export default function StudioAskBar({ variant = 'hero', chat, staging, value, onChange, focusNonce }) {
  const [placeIdx, setPlaceIdx] = useState(0)
  const [focused, setFocused] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const localRef = useRef(null)
  const fileRef = useRef(null)

  const speech = useSpeechInput()
  const baseRef = useRef('')

  // Focus the composer when a tile prefills it (keyed on a changing nonce).
  useEffect(() => {
    if (!focusNonce) return undefined
    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled) localRef.current?.focus()
    })
    return () => {
      cancelled = true
    }
  }, [focusNonce])

  // Interim dictation appends to the text typed before the mic was tapped. Final
  // result just stays for review — never auto-sent from the ask bar.
  useEffect(() => {
    if (!speech.listening) return
    const base = baseRef.current
    const joined = base ? `${base}${base.endsWith(' ') ? '' : ' '}${speech.transcript}` : speech.transcript
    onChange(joined)
  }, [speech.transcript, speech.listening, onChange])

  // Auto-resize the textarea up to ~120px.
  useEffect(() => {
    const ta = localRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`
  }, [value])

  // Rotating placeholder — paused while focused or when there's text.
  useEffect(() => {
    if (focused || value) return undefined
    const id = window.setInterval(() => setPlaceIdx((i) => (i + 1) % PLACEHOLDERS.length), 3200)
    return () => window.clearInterval(id)
  }, [focused, value])

  const toggleMic = () => {
    if (speech.listening) {
      speech.stop()
    } else {
      baseRef.current = value || ''
      speech.start()
    }
  }

  const ready = staging.attachments.filter((a) => a.status === 'ready')
  const someUnready = staging.someUnready

  const submit = () => {
    const text = (value || '').trim()
    if ((!text && ready.length === 0) || chat.busy || someUnready) return
    if (speech.listening) speech.stop()
    chat.tts.primeForGesture() // iOS audio unlock — must run inside the user gesture
    onChange('')
    staging.clear()
    chat.send(text, { attachments: ready })
  }

  const canSend = !chat.busy && !someUnready && (!!(value || '').trim() || ready.length > 0)
  const isHero = variant === 'hero'

  return (
    <div className={isHero ? 'w-full max-w-[820px]' : 'w-full'}>
      {/* Staged attachment chips */}
      {staging.attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {staging.attachments.map((a) => (
            <div key={a.local_id} className="relative">
              <PennyAttachmentChip attachment={a} onRemove={() => staging.removeAttachment(a.local_id)} />
              {a.status !== 'ready' && (
                <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/60">
                  <Loader2 size={14} className="animate-spin text-gold" aria-hidden />
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Inline toast (rejects / caps) */}
      {staging.toast && (
        <div
          role="status"
          className="mb-2 rounded-md border border-gold/40 bg-gold/[0.08] px-2.5 py-1 text-[12px] text-[#7a5e00]"
        >
          {staging.toast}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        onDragOver={(e) => {
          if (Array.from(e.dataTransfer.types || []).includes('Files')) {
            e.preventDefault()
            setDragOver(true)
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          const files = Array.from(e.dataTransfer.files || [])
          if (files.length) {
            e.preventDefault()
            // Stop the root onDrop from ALSO auto-sending these files: a drop on
            // the composer STAGES them (the user then types + sends). The overlay
            // still clears via PennyStudio's capture-phase window listeners.
            e.stopPropagation()
            setDragOver(false)
            void staging.stageFiles(files)
          }
        }}
        className={`flex items-end gap-2.5 rounded-[18px] border bg-white px-3 py-2.5 pl-4 shadow-login transition focus-within:ring-2 focus-within:ring-gold/50 ${
          dragOver ? 'border-gold bg-[#fffef8] ring-2 ring-inset ring-gold/60' : 'border-gold/35'
        }`}
      >
        <label htmlFor={`studio-ask-${variant}`} className="sr-only">
          Ask Penny anything
        </label>

        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            const files = e.target.files ? Array.from(e.target.files) : []
            if (files.length) void staging.stageFiles(files)
            if (e.target) e.target.value = ''
          }}
        />

        <textarea
          id={`studio-ask-${variant}`}
          ref={localRef}
          rows={1}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={chat.busy ? 'Penny is thinking…' : speech.listening ? 'Listening…' : PLACEHOLDERS[placeIdx]}
          aria-busy={chat.busy}
          className={`max-h-[120px] min-h-[40px] flex-1 resize-none bg-transparent py-2 text-[#16233d] outline-none placeholder:text-[#8a93a6] ${
            isHero ? 'text-[16.5px]' : 'text-[15px]'
          }`}
        />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={staging.attachments.length >= MAX_FILES}
            aria-label="Attach a document"
            title={staging.attachments.length >= MAX_FILES ? `Up to ${MAX_FILES} files per message` : 'Attach a document'}
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border border-border bg-white text-muted transition hover:border-gold hover:text-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Paperclip size={18} aria-hidden />
          </button>

          {speech.supported && (
            <button
              type="button"
              onClick={toggleMic}
              aria-label={speech.listening ? 'Stop dictation' : 'Dictate a message'}
              aria-pressed={speech.listening}
              className={`relative flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 ${
                speech.listening
                  ? 'border-danger bg-danger text-white'
                  : 'border-border bg-white text-muted hover:border-gold hover:text-navy'
              }`}
            >
              {speech.listening && (
                <span aria-hidden className="absolute inset-0 rounded-xl bg-danger/40 motion-safe:animate-ping motion-reduce:hidden" />
              )}
              <Mic size={18} className="relative" aria-hidden />
            </button>
          )}

          <button
            type="submit"
            disabled={!canSend}
            aria-label={chat.busy ? 'Sending — please wait' : 'Send'}
            aria-busy={chat.busy}
            className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl bg-gold-gradient text-navy shadow-glow transition-transform hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 motion-reduce:hover:translate-y-0"
          >
            {chat.busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      </form>
    </div>
  )
}
