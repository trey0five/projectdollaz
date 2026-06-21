// Floating "Ask FinRep" assistant — available on every authed page. Sends the
// conversation to the agentic, tool-calling backend (read-only over the active
// school's data) and renders the answer plus any charts the AI drew on the fly.
import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sparkles, X, Send, Loader2 } from 'lucide-react'
import { useSchools } from '../../context/SchoolContext.jsx'
import { assistantApi, apiErrorMessage } from '../../lib/api.js'

const ChartRenderer = lazy(() => import('./ChartRenderer.jsx'))

const SUGGESTIONS = [
  'How are we tracking vs. budget?',
  'What compliance issues need attention?',
  'Show our days-cash-on-hand trend',
  'Break down our revenue by category',
]

export default function AssistantWidget() {
  const { activeId } = useSchools()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([]) // { role, content, charts? }
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef(null)

  // Keep the transcript scrolled to the latest (DOM-only side effect).
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy, open])

  const send = async (text) => {
    const q = (text ?? input).trim()
    if (!q || busy || !activeId) return
    const next = [...messages, { role: 'user', content: q }]
    setMessages(next)
    setInput('')
    setBusy(true)
    try {
      const history = next.map((m) => ({ role: m.role, content: m.content }))
      const res = await assistantApi.chat(activeId, { messages: history })
      const d = res.data
      setMessages((m) => [
        ...m,
        d?.configured === false
          ? { role: 'assistant', content: 'The assistant isn’t configured on this server yet.' }
          : { role: 'assistant', content: d?.answer || '(no answer)', charts: d?.charts || [] },
      ])
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: apiErrorMessage(e, 'Sorry — I hit an error answering that.') },
      ])
    } finally {
      setBusy(false)
    }
  }

  // No school yet (onboarding) → don't show the assistant.
  if (!activeId) return null

  return (
    <div className="no-print">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close assistant' : 'Ask FinRep'}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gold-gradient text-navy shadow-glow transition-transform hover:scale-105"
      >
        {open ? <X size={22} /> : <Sparkles size={24} />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="fixed bottom-24 right-5 z-50 flex h-[560px] max-h-[calc(100vh-7rem)] w-[380px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-gold/25 bg-cream shadow-login"
          >
            <div className="flex items-center gap-2 border-b border-rule bg-navy-gradient px-4 py-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold-gradient text-navy">
                <Sparkles size={15} />
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-white">Ask FinRep</p>
                <p className="text-[10px] text-white/50">Reads your numbers — never guesses.</p>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
              {messages.length === 0 && (
                <div className="space-y-2">
                  <p className="px-1 text-[12px] text-muted">Ask about this school’s finances:</p>
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="block w-full rounded-lg border border-border bg-white px-3 py-2 text-left text-[12.5px] text-navy transition-colors hover:border-gold/50 hover:text-gold"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {messages.map((m, i) => (
                <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                  <div
                    className={`max-w-[88%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-navy text-white'
                        : 'border border-rule/70 bg-white text-ink'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.content}</p>
                    {m.charts?.map((c, ci) => (
                      <Suspense key={ci} fallback={<p className="mt-2 text-[11px] text-muted">Rendering chart…</p>}>
                        <ChartRenderer spec={c} />
                      </Suspense>
                    ))}
                  </div>
                </div>
              ))}

              {busy && (
                <div className="flex justify-start">
                  <div className="inline-flex items-center gap-2 rounded-2xl border border-rule/70 bg-white px-3.5 py-2 text-[12px] text-muted">
                    <Loader2 size={13} className="animate-spin text-gold" /> Thinking…
                  </div>
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                send()
              }}
              className="flex items-end gap-2 border-t border-rule bg-cream px-3 py-2.5"
            >
              <textarea
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send()
                  }
                }}
                placeholder="Ask a question…"
                className="max-h-24 min-h-[40px] flex-1 resize-none rounded-lg border border-border bg-white px-3 py-2 text-[13px] text-ink outline-none focus:border-gold"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold-gradient text-navy disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send size={16} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
