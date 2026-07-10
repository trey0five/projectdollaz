// PennyEmptyState — the flashy welcome shown before the first message. A
// gold-haloed Penny hero over a 2×2 capability bento (Insights / Compliance /
// Budget / Reports). Tapping a tile expands its suggestion pills; tapping a pill
// fires onPick(text) → send. The "Insights" set reuses the original SUGGESTIONS
// strings so the default prompts are preserved. Tip line mentions attach + mic.
import { useState } from 'react'
import { BarChart3, ShieldCheck, Wallet, FileText } from 'lucide-react'
import PennyAvatar from '../PennyAvatar.jsx'

// Insights prompts === the original SUGGESTIONS (preserved verbatim).
const CATEGORIES = [
  {
    key: 'insights',
    icon: BarChart3,
    title: 'Insights',
    blurb: 'How the numbers look',
    prompts: [
      'How are we tracking vs. budget?',
      'Show our days-cash-on-hand trend',
      'Break down our revenue by category',
    ],
  },
  {
    key: 'compliance',
    icon: ShieldCheck,
    title: 'Compliance',
    blurb: 'Flags & follow-ups',
    prompts: [
      'What compliance issues need attention?',
      'Are there any reportable findings?',
      'Summarize our corrective action plan',
    ],
  },
  {
    key: 'budget',
    icon: Wallet,
    title: 'Budget',
    blurb: 'Plan vs. actual',
    prompts: [
      'Where are we over budget?',
      'Which categories have the biggest variance?',
      'How is enrollment revenue pacing?',
    ],
  },
  {
    key: 'reports',
    icon: FileText,
    title: 'Reports',
    blurb: 'Board-ready packets',
    prompts: [
      'Summarize this period for the board',
      'What are our key financial indicators?',
      'Draft a finance-committee headline',
    ],
  },
]

export default function PennyEmptyState({ onPick }) {
  const [expanded, setExpanded] = useState(null)
  const active = CATEGORIES.find((c) => c.key === expanded)

  return (
    <div className="flex flex-col items-center px-2 py-4 text-center motion-safe:animate-[penny-pop_360ms_ease-out]">
      {/* Hero — Penny coin behind a soft pulsing gold halo. */}
      <div className="relative mb-3">
        <span
          aria-hidden
          className="absolute -inset-4 rounded-full bg-penny/30 blur-2xl motion-safe:animate-[penny-pulse-glow_3.6s_ease-in-out_infinite] motion-reduce:hidden"
        />
        <span
          aria-hidden
          className="absolute -inset-2 rounded-full bg-penny/40 blur-lg motion-safe:animate-[penny-pulse-glow_4.8s_ease-in-out_infinite] motion-reduce:hidden"
        />
        <div className="relative">
          <PennyAvatar size={56} active />
        </div>
      </div>
      <h2 className="penny-text text-[18px] font-bold tracking-tight">Hi! I’m Penny</h2>
      <p className="mt-1 max-w-[16rem] text-[13px] leading-snug text-muted">
        Pick a topic to see what I can do, or just type your question.
      </p>

      {/* 2×2 capability bento */}
      <div className="mt-4 grid w-full grid-cols-2 gap-2.5">
        {CATEGORIES.map((cat, i) => {
          const Icon = cat.icon
          const isOpen = expanded === cat.key
          return (
            <button
              key={cat.key}
              type="button"
              onClick={() => setExpanded(isOpen ? null : cat.key)}
              aria-expanded={isOpen}
              style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'backwards' }}
              className={`group relative overflow-hidden rounded-2xl border bg-white p-3 text-left transition-all duration-200 motion-safe:animate-[penny-fadeup_360ms_ease-out] hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 ${
                isOpen
                  ? 'border-penny/70 shadow-penny-glow ring-1 ring-penny/40'
                  : 'border-rule/60 shadow-card hover:border-penny/50'
              }`}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-gradient-to-br from-penny/[0.10] to-transparent opacity-90"
              />
              <div className="relative flex items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-penny-gradient text-navy shadow-sm">
                  <Icon size={15} aria-hidden />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-navy">{cat.title}</div>
                  <div className="truncate text-[10px] leading-tight text-muted">{cat.blurb}</div>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Expanded suggestion pills */}
      {active && (
        <div className="mt-3 flex w-full flex-wrap justify-center gap-2 motion-safe:animate-[penny-fadeup_240ms_ease-out]">
          {active.prompts.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPick(p)}
              className="rounded-full border border-rule/70 bg-white px-3 py-1.5 text-[12.5px] text-navy transition-colors hover:border-penny/70 hover:text-penny"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {!active && (
        <p className="mt-4 text-[10px] text-muted/80">
          Tip: attach a trial balance or budget · tap the mic to speak
        </p>
      )}
    </div>
  )
}
