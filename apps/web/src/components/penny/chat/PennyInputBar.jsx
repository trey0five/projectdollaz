// PennyInputBar — the message composer: auto-resizing textarea + attach / mic /
// send row, a drag ring, safe-area padding, and staged attachment chips.
//
// Attachments: .xlsx/.csv/PDF/images, max 4 per turn, max 8 MB each. On pick/drop
// we validate type + size (inline toast on reject), FileReader.readAsDataURL, then
// strip the "data:...;base64," prefix → { local_id, name, mime, kind, dataBase64,
// preview?, status:'ready' }. submit() allows text-only / file-only / both; it
// primes TTS for the user gesture (iOS audio unlock) then calls onSubmit(text,
// { attachments }) and clears. Voice-in via useSpeechInput() (interim transcript
// appends to the typed base — never auto-sends; mic button only when supported).
//
// Listens for the panel-wide 'penny:ai-drop-files' CustomEvent dispatched by the
// PennyChat drag overlay.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Mic, Paperclip, Send } from 'lucide-react'
import { useSpeechInput } from '../hooks/useSpeechInput.js'
import PennyAttachmentChip from './PennyAttachmentChip.jsx'

const MAX_FILES = 4
const MAX_FILE_BYTES = 8 * 1024 * 1024
const MAX_ROWS = 4
const ROW_PX = 24

const ACCEPT = '.xlsx,.csv,application/pdf,image/png,image/jpeg,image/webp'

// MIME / extension → frozen `kind`. CSV + XLSX sometimes arrive with empty or
// generic MIME from the OS, so we fall back to the filename extension.
function classifyFile(file) {
  const mime = (file.type || '').toLowerCase()
  const name = (file.name || '').toLowerCase()
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return { kind: 'pdf', ok: true }
  if (mime.startsWith('image/')) {
    if (['image/png', 'image/jpeg', 'image/webp'].includes(mime)) return { kind: 'image', ok: true }
    return { kind: 'image', ok: false }
  }
  if (name.endsWith('.csv') || mime === 'text/csv') return { kind: 'csv', ok: true }
  if (
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mime === 'application/vnd.ms-excel'
  ) {
    return { kind: 'xlsx', ok: true }
  }
  return { kind: 'pdf', ok: false }
}

function uid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

export default function PennyInputBar({ busy, onSubmit, inputRef, tts }) {
  const [value, setValue] = useState('')
  const [attachments, setAttachments] = useState([])
  const [toast, setToast] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const localRef = useRef(null)
  const fileRef = useRef(null)

  const speech = useSpeechInput()
  const baseRef = useRef('')

  // While listening, interim transcript flows into the textarea appended to the
  // text the user had typed before tapping the mic. Final result simply stays
  // for review — we never auto-send.
  useEffect(() => {
    if (!speech.listening) return
    const base = baseRef.current
    const joined = base ? `${base}${base.endsWith(' ') ? '' : ' '}${speech.transcript}` : speech.transcript
    setValue(joined)
  }, [speech.transcript, speech.listening])

  const toggleMic = () => {
    if (speech.listening) {
      speech.stop()
    } else {
      baseRef.current = value
      speech.start()
    }
  }

  const setTaRef = (el) => {
    localRef.current = el
    if (inputRef) inputRef.current = el
  }

  // Auto-resize the textarea up to MAX_ROWS, then internal scroll.
  useEffect(() => {
    const ta = localRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, MAX_ROWS * ROW_PX + 16)}px`
  }, [value])

  // Auto-dismiss the inline toast.
  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 3400)
    return () => window.clearTimeout(t)
  }, [toast])

  const queueFiles = useCallback(
    async (files) => {
      const cleaned = []
      for (const f of files) {
        const { kind, ok } = classifyFile(f)
        if (!ok) {
          setToast(`${f.name}: unsupported type. Use XLSX, CSV, PDF, PNG, JPEG, or WebP.`)
          continue
        }
        if (f.size > MAX_FILE_BYTES) {
          setToast(`${f.name} is over 8 MB.`)
          continue
        }
        cleaned.push({ file: f, kind })
      }
      if (cleaned.length === 0) return

      setAttachments((prev) => {
        const room = MAX_FILES - prev.length
        if (room <= 0) {
          setToast(`Up to ${MAX_FILES} files per message.`)
          return prev
        }
        const accepted = cleaned.slice(0, room)
        if (accepted.length < cleaned.length) {
          setToast(`Only the first ${room} file${room === 1 ? '' : 's'} were attached.`)
        }
        // Read each accepted file → data URL → strip prefix. Async, so we patch
        // the staged chip from 'reading' to 'ready' when its bytes land.
        accepted.forEach(({ file, kind }) => {
          const local_id = uid()
          const seed = {
            local_id,
            name: file.name,
            mime: file.type || (kind === 'csv' ? 'text/csv' : 'application/octet-stream'),
            kind,
            dataBase64: '',
            preview: undefined,
            status: 'reading',
          }
          setAttachments((cur) => [...cur, seed])
          readAsDataURL(file)
            .then((dataUrl) => {
              const comma = dataUrl.indexOf(',')
              const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : ''
              setAttachments((cur) =>
                cur.map((a) =>
                  a.local_id === local_id
                    ? {
                        ...a,
                        dataBase64: b64,
                        preview: kind === 'image' ? dataUrl : undefined,
                        status: 'ready',
                      }
                    : a,
                ),
              )
            })
            .catch(() => {
              setToast(`Couldn’t read ${file.name}.`)
              setAttachments((cur) => cur.filter((a) => a.local_id !== local_id))
            })
        })
        return prev
      })
    },
    [],
  )

  const onFilePick = (e) => {
    const files = e.target.files ? Array.from(e.target.files) : []
    if (files.length) void queueFiles(files)
    if (e.target) e.target.value = ''
  }

  const removeAttachment = (local_id) => {
    setAttachments((prev) => prev.filter((a) => a.local_id !== local_id))
  }

  // Panel-wide drop dispatch from PennyChat.
  useEffect(() => {
    const onDrop = (e) => {
      const detail = e.detail || {}
      const files = Array.isArray(detail.files) ? detail.files : []
      if (files.length) void queueFiles(files)
    }
    window.addEventListener('penny:ai-drop-files', onDrop)
    return () => window.removeEventListener('penny:ai-drop-files', onDrop)
  }, [queueFiles])

  const someUnready = attachments.some((a) => a.status !== 'ready')

  const submit = () => {
    const text = value.trim()
    const ready = attachments.filter((a) => a.status === 'ready')
    if (!text && ready.length === 0) return
    if (busy) return
    if (someUnready) {
      setToast('Wait for all files to finish reading.')
      return
    }
    if (speech.listening) speech.stop()
    tts.primeForGesture() // iOS audio unlock — must run inside the user gesture
    setValue('')
    setAttachments([])
    onSubmit(text, { attachments: ready })
  }

  const canSend = !busy && !someUnready && (!!value.trim() || attachments.some((a) => a.status === 'ready'))

  return (
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
          setDragOver(false)
          void queueFiles(files)
        }
      }}
      className={`flex flex-col gap-2 border-t border-rule bg-cream px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] ${
        dragOver ? 'ring-2 ring-inset ring-gold/70' : ''
      }`}
    >
      <label htmlFor="penny-chat-input" className="sr-only">
        Message Penny
      </label>

      {/* Staged attachment chips */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((a) => (
            <div key={a.local_id} className="relative">
              <PennyAttachmentChip attachment={a} onRemove={() => removeAttachment(a.local_id)} />
              {a.status === 'reading' && (
                <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/60">
                  <Loader2 size={14} className="animate-spin text-gold" aria-hidden />
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Inline toast (rejects, caps) */}
      {toast && (
        <div
          role="status"
          className="rounded-md border border-gold/40 bg-gold/[0.08] px-2 py-1 text-[11px] text-[#7a5e00]"
        >
          {toast}
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={onFilePick}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={attachments.length >= MAX_FILES}
          aria-label="Attach a file"
          title={attachments.length >= MAX_FILES ? `Up to ${MAX_FILES} files per message` : 'Attach a file'}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-white text-muted transition hover:border-gold/60 hover:text-gold disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Paperclip size={18} aria-hidden />
        </button>

        <textarea
          id="penny-chat-input"
          ref={setTaRef}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={busy ? 'Thinking…' : speech.listening ? 'Listening…' : 'Ask a question…'}
          aria-busy={busy}
          className="max-h-24 min-h-[40px] flex-1 resize-none rounded-lg border border-border bg-white px-3 py-2 text-[15px] text-ink outline-none transition focus:border-gold"
        />

        {/* Voice input — rendered only when the Web Speech API exists. */}
        {speech.supported && (
          <button
            type="button"
            onClick={toggleMic}
            aria-label={speech.listening ? 'Stop voice input' : 'Start voice input'}
            aria-pressed={speech.listening}
            className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition ${
              speech.listening
                ? 'bg-gold-gradient text-navy shadow-glow'
                : 'border border-border bg-white text-muted hover:border-gold/60 hover:text-gold'
            }`}
          >
            {speech.listening && (
              <span
                aria-hidden
                className="absolute inset-0 rounded-lg bg-gold/40 motion-safe:animate-ping motion-reduce:hidden"
              />
            )}
            <Mic size={18} className="relative" aria-hidden />
          </button>
        )}

        <button
          type="submit"
          disabled={!canSend}
          aria-label={busy ? 'Sending — please wait' : 'Send message'}
          aria-busy={busy}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold-gradient text-navy shadow-sm transition-all hover:-translate-y-px hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm motion-reduce:hover:translate-y-0"
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
    </form>
  )
}
