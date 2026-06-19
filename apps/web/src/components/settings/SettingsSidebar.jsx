// Responsive settings nav. Desktop (sm+): a vertical list of NavLinks with a
// gold active indicator. Mobile (<sm): a native <select> that navigates on
// change (mirrors the app's existing mobile dropdown pattern). Both deep-link
// to nested /settings/* routes so a hard refresh lands on the right section.
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { User, Users, Building2, Briefcase, CreditCard, CalendarClock, Plug } from 'lucide-react'

const NAV = [
  { to: 'account', label: 'My Account', Icon: User },
  { to: 'members', label: 'Members & Roles', Icon: Users },
  { to: 'school', label: 'School', Icon: Building2 },
  { to: 'organization', label: 'Organization', Icon: Briefcase },
  { to: 'reports', label: 'Board Reports', Icon: CalendarClock },
  { to: 'integrations', label: 'Integrations', Icon: Plug },
  { to: 'billing', label: 'Billing', Icon: CreditCard },
]

export default function SettingsSidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const current = NAV.find((n) => location.pathname.endsWith(`/${n.to}`))?.to || 'account'

  return (
    <>
      {/* Mobile: select */}
      <div className="mb-5 sm:hidden">
        <select
          value={current}
          onChange={(e) => navigate(`/settings/${e.target.value}`)}
          aria-label="Settings section"
          className="min-h-[44px] w-full rounded-lg border-2 border-border bg-white px-4 py-2 text-[15px] font-semibold text-navy outline-none focus:border-gold"
        >
          {NAV.map((n) => (
            <option key={n.to} value={n.to}>
              {n.label}
            </option>
          ))}
        </select>
      </div>

      {/* Desktop: vertical nav */}
      <nav className="hidden shrink-0 sm:block sm:w-60">
        <ul className="space-y-1">
          {/* eslint-disable-next-line no-unused-vars -- Icon is rendered as <Icon /> below */}
          {NAV.map(({ to, label, Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `flex min-h-[44px] items-center gap-3 rounded-lg border-l-[3px] px-4 py-2.5 text-[14px] font-semibold transition-colors ${
                    isActive
                      ? 'border-gold bg-gold/10 text-white'
                      : 'border-transparent text-white/70 hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                <Icon size={17} />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </>
  )
}
