// ─────────────────────────────────────────────────────────────────────────────
// _ui.jsx — shared, data-dense primitives for the admin console. ui.v2 tokens
// only (navy ink, sky/coral/muted/danger accents, serif headings, tabular nums).
// No external deps. Kept deliberately small so every admin page reads the same.
// ─────────────────────────────────────────────────────────────────────────────
import { CheckCircle2, AlertCircle, ShieldCheck, ShieldOff } from 'lucide-react'
import { MODULE_META } from '../../lib/modules.js'

// Per-section accent hues — the single source shared by the sidebar, the page
// headers and the section cards/tables so a section reads one consistent colour.
export const SECTION_TONE = {
  overview: ['#2563EB', '#3b82f6'],
  geography: ['#06b6d4', '#22d3ee'],
  users: ['#8b5cf6', '#a78bfa'],
  organizations: ['#6366f1', '#818cf8'],
  messages: ['#FF6B5E', '#ff9182'],
  admins: ['#f59e0b', '#fbbf24'],
}

// ── Cards ────────────────────────────────────────────────────────────────────
// StatCard — a colorful metric tile. `tone` is a [hue, hue2] pair that paints a
// gradient icon chip, a tinted top hairline and a faint corner glow so the row of
// cards reads as a vibrant dashboard rather than flat white boxes. `icon` is a
// lucide component. Both are optional (falls back to a plain blue-accented card).
export function StatCard({ label, value, sub, accent, icon: Icon, tone }) {
  const [hue, hue2] = tone || ['#2563EB', '#3b82f6']
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-white p-5 shadow-card transition-transform duration-200 hover:-translate-y-0.5">
      <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg,${hue},${hue2})` }} />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-[0.10]"
        style={{ background: `radial-gradient(circle,${hue},transparent 70%)` }}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
          <div className="mt-1 font-serif text-3xl tabular-nums text-ink">{value}</div>
          {sub != null && (
            <div className={`mt-1 text-xs ${accent === 'up' ? 'text-emerald-600' : 'text-muted'}`}>
              {sub}
            </div>
          )}
        </div>
        {Icon && (
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
            style={{ background: `linear-gradient(135deg,${hue},${hue2})`, boxShadow: `0 8px 18px -8px ${hue}` }}
          >
            <Icon size={19} />
          </span>
        )}
      </div>
    </div>
  )
}

// SectionCard — optional `tone` ([hue, hue2]) paints a gradient top hairline and
// a faint header wash so the card belongs to its section's colour, matching the
// sidebar + page header. Omit tone for a plain white card.
export function SectionCard({ title, subtitle, right, children, className = '', tone }) {
  const [hue, hue2] = tone || []
  return (
    <section
      className={`relative overflow-hidden rounded-2xl border border-border bg-white shadow-card ${className}`}
    >
      {tone && (
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-1"
          style={{ background: `linear-gradient(90deg,${hue},${hue2})` }}
        />
      )}
      {(title || right) && (
        <header
          className="flex items-start justify-between gap-3 border-b border-rule px-5 py-4"
          style={tone ? { background: `linear-gradient(180deg,${hue}0f,transparent)` } : undefined}
        >
          <div className="min-w-0">
            {title && <h2 className="font-serif text-lg text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  )
}

// ── Table shell ──────────────────────────────────────────────────────────────
// `tone` ([hue, …]) tints the sticky header row and colours its labels in the
// section hue; omit it for the neutral slate header.
export function Table({ head, children, tone }) {
  const [hue] = tone || []
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="sticky top-0 text-left text-[11px] font-semibold uppercase tracking-wide">
          <tr
            className={tone ? '' : 'bg-section text-muted'}
            style={tone ? { backgroundColor: `${hue}14`, color: hue } : undefined}
          >
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-3 py-2.5 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">{children}</tbody>
      </table>
    </div>
  )
}

// ── Badges ───────────────────────────────────────────────────────────────────
export function VerifiedBadge({ verified, at }) {
  if (verified) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
        title={at ? `Verified ${new Date(at).toLocaleString()}` : 'Verified (date unknown)'}
      >
        <CheckCircle2 size={12} /> Verified
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700"
      title="Email not verified"
    >
      <AlertCircle size={12} /> Pending
    </span>
  )
}

const ROLE_STYLES = {
  owner: 'bg-navy text-white',
  accountant: 'bg-sky/20 text-navy',
  viewer: 'border border-border text-muted',
}
export function RoleBadge({ role }) {
  const cls = ROLE_STYLES[role] || 'border border-border text-muted'
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${cls}`}>
      {role}
    </span>
  )
}

export function StatusBadge({ status }) {
  const active = status === 'active'
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
        active ? 'bg-emerald-50 text-emerald-700' : 'bg-section text-muted'
      }`}
    >
      {status}
    </span>
  )
}

export function MfaBadge({ on }) {
  return on ? (
    <span className="inline-flex items-center gap-1 text-emerald-600" title="MFA enabled">
      <ShieldCheck size={15} />
      <span className="text-xs">On</span>
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-muted" title="MFA off">
      <ShieldOff size={15} />
      <span className="text-xs">Off</span>
    </span>
  )
}

// ── Module chips (renders {key,label}; prefers the local MODULE_META label) ────
export function ModuleChips({ modules = [], max = 5 }) {
  if (!modules.length) return <span className="text-muted">—</span>
  const shown = modules.slice(0, max)
  const extra = modules.length - shown.length
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((m) => (
        <span
          key={m.key}
          className="rounded-md bg-sky/15 px-1.5 py-0.5 text-[11px] font-medium text-navy"
          title={MODULE_META[m.key]?.description || undefined}
        >
          {MODULE_META[m.key]?.label ?? m.label ?? m.key}
        </span>
      ))}
      {extra > 0 && (
        <span className="rounded-md bg-section px-1.5 py-0.5 text-[11px] font-medium text-muted">
          +{extra}
        </span>
      )}
    </div>
  )
}

// ── Async states ─────────────────────────────────────────────────────────────
export function LoadState({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-navy motion-reduce:animate-none" />
      {label}
    </div>
  )
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="rounded-xl border border-danger/30 bg-danger/5 px-5 py-8 text-center">
      <p className="text-sm text-danger">{message || 'Something went wrong.'}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink hover:bg-section"
        >
          Retry
        </button>
      )}
    </div>
  )
}

export function EmptyState({ label = 'Nothing here yet.' }) {
  return <div className="py-12 text-center text-sm text-muted">{label}</div>
}

// ── Formatting helpers ───────────────────────────────────────────────────────
export function fmtDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function relTime(iso) {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  const s = Math.round((Date.now() - then) / 1000)
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d}d ago`
  const mo = Math.round(d / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.round(mo / 12)}y ago`
}
