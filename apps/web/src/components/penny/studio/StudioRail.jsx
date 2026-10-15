// StudioRail — the right column: recent conversations (from the engine's session
// store) and a set of suggested prompts. Clicking a conversation switches to it
// (entering the conversation state); clicking a chip prefills the ask bar.
import { MessageSquare } from 'lucide-react'
import { Section } from '../../ui/surface/index.js'

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

  // Premium UI P4: two Sections on the ground — recent conversations as ruled
  // rows, suggestions as one-shape Pills — no card shell.
  return (
    <div className="space-y-2">
      <Section label="Recent conversations">
        {sessions.length === 0 ? (
          <p className="text-[13px] text-ink2">No conversations yet — ask KYRO anything to start one.</p>
        ) : (
          <ul className="ruled border-b border-hair">
            {sessions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => chat.switchSession(s.id)}
                  className="group flex w-full items-start gap-2.5 py-2.5 text-left outline-none transition-colors hover:bg-ink/[0.03] focus-visible:ring-2 focus-visible:ring-penny/60"
                >
                  <MessageSquare size={14} aria-hidden className="mt-[3px] shrink-0 text-penny" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold leading-tight text-ink">
                      {s.title || 'Untitled chat'}
                    </span>
                  </span>
                  {relTime(s.updatedAt) && (
                    <span className="shrink-0 text-[12px] tabular-nums text-ink2">{relTime(s.updatedAt)}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section label="Suggested for you">
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onPick(s)}
              className="pill h-7 cursor-pointer px-2.5 text-[12.5px] transition-colors hover:border-hair/40 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-penny/60"
            >
              {s}
            </button>
          ))}
        </div>
      </Section>
    </div>
  )
}
