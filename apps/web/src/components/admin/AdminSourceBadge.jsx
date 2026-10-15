// ─────────────────────────────────────────────────────────────────────────────
// AdminSourceBadge — how an admin got their access, per the frozen AdminRow.source:
//   • superadmin → navy "Super-admin" (the bootstrap founder; never revocable)
//   • db         → coral "Granted" (DB isAdmin flag; the ONLY revocable source)
//   • env        → slate "Allowlist" (ADMIN_EMAILS env; not DB-revocable)
// One Pill shape (surface.css .pill); the revocable source carries the mark.
// ─────────────────────────────────────────────────────────────────────────────
import { ShieldCheck, UserCheck, ListChecks } from 'lucide-react'

const STYLES = {
  superadmin: {
    label: 'Super-admin',
    Icon: ShieldCheck,
    tone: 'neutral',
    title: 'The bootstrap founder account — always an admin, never revocable.',
  },
  db: {
    label: 'Granted',
    Icon: UserCheck,
    tone: 'hue',
    title: 'Granted in-app by a super-admin. Revocable here.',
  },
  env: {
    label: 'Allowlist',
    Icon: ListChecks,
    tone: null,
    title: 'From the ADMIN_EMAILS environment allowlist — managed by ops, not revocable here.',
  },
}

export default function AdminSourceBadge({ source }) {
  const s = STYLES[source] || STYLES.env
  const { Icon } = s
  return (
    // One Pill shape for every source (Premium UI §2.4); only the revocable
    // "Granted" source carries a hue mark — colour never fills the badge.
    <span className={`pill ${s.tone ? `pill-status tone-${s.tone}` : ''}`} title={s.title}>
      {s.tone === 'hue' ? <i className="pill-mark bg-coral" aria-hidden="true" /> : null}
      <Icon size={12} aria-hidden="true" /> {s.label}
    </span>
  )
}
