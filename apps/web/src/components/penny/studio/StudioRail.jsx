// StudioRail — the right rail: recent conversations (from the engine's session
// store) and a set of suggested prompts. Clicking a conversation switches to it
// (entering the conversation state); clicking a chip prefills the ask bar. Dark deck.
import { MessageSquare } from 'lucide-react'

const SUGGESTIONS = [
  'Forecast year-end cash',
  'Compare us to last year',
  'Draft a donor thank-you',
  'What changed this month?',
  'Set a monthly cash alert',
]

function relTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  const diff = Date.now() - d.getTime()
  const min = Math.round(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`
  const day = Math.round(hr / 24)
  if (day === 1) return 'yesterday'
  if (day < 7) return `${day} days ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function StudioRail({ chat, onPick }) {
  const sessions = (chat.sessions || []).slice(0, 4)

  return (
    <aside className="rounded-2xl border border-[#22406e] bg-[#152a4d] p-4">
      <h2 className="mb-3 px-0.5 font-serif text-[16px] font-semibold text-white">Recent conversations</h2>

      {sessions.length === 0 ? (
        <p className="px-0.5 text-[13px] text-[#93a6c4]">No conversations yet — ask Penny anything to start one.</p>
      ) : (
        <div className="space-y-0.5">
          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => chat.switchSession(s.id)}
              className="flex w-full items-start gap-2.5 rounded-xl p-2.5 text-left transition-colors hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
            >
              <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-gold/15 text-gold-light">
                <MessageSquare size={14} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-semibold leading-tight text-white">
                  {s.title || 'Untitled chat'}
                </span>
                {relTime(s.updatedAt) && (
                  <span className="mt-0.5 block text-[12px] text-[#93a6c4]">{relTime(s.updatedAt)}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="my-3.5 h-px bg-[#22406e]" />

      <p className="mb-2.5 px-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#93a6c4]">Suggested for you</p>
      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="rounded-full border border-[#22406e] bg-white/5 px-3 py-1.5 text-[12.5px] text-[#c2d0e6] transition-colors hover:border-gold/60 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
          >
            {s}
          </button>
        ))}
      </div>
    </aside>
  )
}
