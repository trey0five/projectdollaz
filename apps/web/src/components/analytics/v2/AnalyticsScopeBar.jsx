// ─────────────────────────────────────────────────────────────────────────────
// AnalyticsScopeBar — the persistent SCOPE axis (whose numbers): 🏫 My school ·
// ⇄ Compare · ⛪ Diocese, plus a school-year picker and a chip row. School scope =
// single-select chips; Compare = multi-select (min 1); Diocese = chips hidden. Chip
// colour follows the roster INDEX (seriesColor) so it matches the charts' per-school
// hue and never shifts on re-sort. A single-school org hides Compare + Diocese
// (handled by the parent passing only ['school']).
// ─────────────────────────────────────────────────────────────────────────────
import { useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { seriesColor } from '../charts/palette.js'

const SCOPE_META = {
  school: { icon: '🏫', label: 'My school' },
  compare: { icon: '⇄', label: 'Compare' },
  diocese: { icon: '⛪', label: 'Diocese' },
}

export default function AnalyticsScopeBar({
  scopes,
  scope,
  onScope,
  roster,
  school,
  onSchool,
  selectedSchools,
  onToggleSchool,
  fyOptions,
  fiscalYearStart,
  onFy,
}) {
  const reduce = useReducedMotion()
  const rosterIndex = (id) => roster.findIndex((r) => r.id === id)
  const tabRefs = useRef([])

  // Roving-tabindex arrow-key nav across the scope tabs (mirrors AnalyticsSubTabs).
  const onScopeKeyDown = (e, i) => {
    let next = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % scopes.length
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + scopes.length) % scopes.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = scopes.length - 1
    if (next == null) return
    e.preventDefault()
    onScope(scopes[next])
    tabRefs.current[next]?.focus()
  }

  return (
    <div className="card-soft mb-4 overflow-hidden">
      {/* Scope buttons + year picker */}
      <div className="flex flex-wrap items-center gap-2 border-b border-rule/50 px-3 py-2.5 sm:px-4">
        <div role="tablist" aria-label="Scope" className="av2-chiprow">
          {scopes.map((key, i) => {
            const active = key === scope
            const m = SCOPE_META[key]
            return (
              <button
                key={key}
                ref={(el) => (tabRefs.current[i] = el)}
                role="tab"
                aria-selected={active}
                aria-controls="av2-panel"
                tabIndex={active ? 0 : -1}
                onClick={() => onScope(key)}
                onKeyDown={(e) => onScopeKeyDown(e, i)}
                className={`relative flex shrink-0 items-center gap-1.5 rounded-[11px] px-3.5 py-2 text-[13.5px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold/50 ${
                  active ? 'text-navy' : 'text-muted hover:bg-cream/70'
                }`}
              >
                {active &&
                  (reduce ? (
                    <span className="absolute inset-0 -z-10 rounded-[11px] bg-gold/15" />
                  ) : (
                    <motion.span layoutId="av2-scope-pill" className="absolute inset-0 -z-10 rounded-[11px] bg-gold/15" />
                  ))}
                <span aria-hidden>{m.icon}</span>
                {m.label}
              </button>
            )
          })}
        </div>
        <span className="flex-1" />
        {fyOptions.length > 0 && (
          <label className="flex items-center gap-2 text-[12.5px] text-muted">
            <span className="hidden sm:inline">School year</span>
            <select
              value={fiscalYearStart ?? ''}
              onChange={(e) => onFy(e.target.value || null)}
              className="rounded-lg border border-rule/60 bg-white px-2.5 py-1.5 text-[13px] font-semibold text-navy outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
            >
              {fyOptions.map((o) => (
                <option key={o.label} value={o.start}>
                  FY{o.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Chip row — school (single) / compare (multi). Diocese hides it. */}
      {scope !== 'diocese' && roster.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2.5 sm:px-4">
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
            {scope === 'compare' ? 'Compare' : 'School'}
          </span>
          <div className="av2-chiprow">
            {roster.map((r) => {
              const idx = rosterIndex(r.id)
              const color = seriesColor(idx < 0 ? 0 : idx)
              const on =
                scope === 'compare' ? selectedSchools.includes(r.id) : school === r.id
              return (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    scope === 'compare' ? onToggleSchool(r.id) : onSchool(r.id)
                  }
                  className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                    on
                      ? 'border-navy/30 bg-white text-navy shadow-card'
                      : 'border-rule/60 text-muted hover:border-navy/30 hover:text-navy'
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: on ? color : '#C4CCDF' }}
                  />
                  {r.name}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
