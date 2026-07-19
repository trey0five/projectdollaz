// TrustBar — a slim strip near the foot of the public homepage that surfaces the
// platform's security posture (FERPA, encryption, hosting). The FERPA badge links
// to the Privacy page, which explains the shared-responsibility model honestly.
import { Link } from 'react-router-dom'
import { ShieldCheck, Lock, Server } from 'lucide-react'
import { TRUST } from './landingContent.js'

const ICONS = { shield: ShieldCheck, lock: Lock, server: Server }
const FOCUS_RING = 'outline-none focus-visible:ring-2 focus-visible:ring-gold/60'

export default function TrustBar() {
  return (
    <section aria-label="Security & compliance" className="border-t border-white/10 bg-navy-deep/60">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
          {TRUST.heading}
        </p>
        <ul className="mt-5 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
          {TRUST.items.map(({ icon, label, to }) => {
            const Icon = ICONS[icon] ?? ShieldCheck
            const inner = (
              <span className="flex items-center gap-2 rounded-full border border-gold/30 bg-white/[0.03] px-4 py-2 text-[13px] font-semibold text-gold-light">
                <Icon size={15} className="text-gold" />
                {label}
              </span>
            )
            return (
              <li key={label}>
                {to ? (
                  <Link to={to} className={`rounded-full transition-opacity hover:opacity-90 ${FOCUS_RING}`}>
                    {inner}
                  </Link>
                ) : (
                  inner
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
