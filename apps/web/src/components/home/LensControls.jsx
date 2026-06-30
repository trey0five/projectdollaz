// ─────────────────────────────────────────────────────────────────────────────
// LensControls — the Scope × Lens surface chrome shared by HomeBriefing (per-
// school) and OrgBriefing (org). Two pieces:
//   • LensIndicator  — a static navy/gold pill showing the ACTIVE lens the server
//     actually shaped this payload with (driven by response.lens, never local
//     state). Reuses the rotated-gold-diamond + uppercase-tracking idiom.
//   • LensSwitcher   — a "Preview as" segmented control rendered ONLY when the
//     caller may preview more than one lens (availableLenses.length > 1, i.e.
//     owner, or accountant who can preview Board). Selecting a lens re-fetches
//     through ?lens=… ; the server clamps so it can never widen past the ceiling.
// Navy/gold theme, reduced-motion safe (no entrance animation), no-print.
// ─────────────────────────────────────────────────────────────────────────────
import { Crown, Calculator, Users } from 'lucide-react'

const LENS_META = {
  owner: { label: 'Leadership view', short: 'Leadership', Icon: Crown },
  accountant: { label: 'Finance view', short: 'Finance', Icon: Calculator },
  viewer: { label: 'Board view', short: 'Board', Icon: Users },
}

export function LensIndicator({ lens }) {
  const meta = LENS_META[lens]
  if (!meta) return null
  const { label, Icon } = meta
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-navy shadow-[0_0_10px_rgba(184,150,80,0.18)]"
      title={`This briefing is shaped for the ${label}.`}
    >
      <span
        className="h-1.5 w-1.5 rotate-45 rounded-[1px] bg-gold/80 shadow-[0_0_8px_rgba(184,150,80,0.5)]"
        aria-hidden
      />
      <Icon size={13} className="text-gold" aria-hidden />
      {label}
    </span>
  )
}

export function LensSwitcher({ lens, availableLenses = [], onChange }) {
  // Only render when there is genuinely more than one lens to preview.
  if (!availableLenses || availableLenses.length <= 1) return null
  return (
    <div className="no-print inline-flex items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        Preview as
      </span>
      <div className="inline-flex overflow-hidden rounded-full border border-rule bg-white p-0.5 shadow-card">
        {availableLenses.map((l) => {
          const meta = LENS_META[l]
          if (!meta) return null
          const active = l === lens
          const { short, Icon } = meta
          return (
            <button
              key={l}
              type="button"
              onClick={() => onChange?.(l)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold transition-colors ${
                active
                  ? 'bg-navy text-white shadow-sm'
                  : 'text-navy/70 hover:bg-navy/5 hover:text-navy'
              }`}
            >
              <Icon size={13} aria-hidden />
              {short}
            </button>
          )
        })}
      </div>
    </div>
  )
}
