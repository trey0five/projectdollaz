// ─────────────────────────────────────────────────────────────────────────────
// AdminSourceBadge — how an admin got their access, per the frozen AdminRow.source:
//   • superadmin → navy "Super-admin" (the bootstrap founder; never revocable)
//   • db         → coral "Granted" (DB isAdmin flag; the ONLY revocable source)
//   • env        → slate "Allowlist" (ADMIN_EMAILS env; not DB-revocable)
// ui.v2 tokens only; matches the admin _ui.jsx badge family.
// ─────────────────────────────────────────────────────────────────────────────
import { ShieldCheck, UserCheck, ListChecks } from 'lucide-react'

const STYLES = {
  superadmin: {
    label: 'Super-admin',
    Icon: ShieldCheck,
    cls: 'bg-navy text-white',
    title: 'The bootstrap founder account — always an admin, never revocable.',
  },
  db: {
    label: 'Granted',
    Icon: UserCheck,
    cls: 'bg-coral/15 text-coral',
    title: 'Granted in-app by a super-admin. Revocable here.',
  },
  env: {
    label: 'Allowlist',
    Icon: ListChecks,
    cls: 'bg-section text-muted',
    title: 'From the ADMIN_EMAILS environment allowlist — managed by ops, not revocable here.',
  },
}

export default function AdminSourceBadge({ source }) {
  const s = STYLES[source] || STYLES.env
  const { Icon } = s
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${s.cls}`}
      title={s.title}
    >
      <Icon size={12} /> {s.label}
    </span>
  )
}
