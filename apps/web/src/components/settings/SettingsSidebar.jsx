// Responsive settings nav. Desktop (sm+): a vertical list of NavLinks with a
// gold active indicator. Mobile (<sm): a native <select> that navigates on
// change (mirrors the app's existing mobile dropdown pattern). Both deep-link
// to nested /settings/* routes so a hard refresh lands on the right section.
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  User,
  Users,
  Building2,
  Briefcase,
  CreditCard,
  CalendarClock,
  Plug,
  Bell,
  Download,
} from 'lucide-react'

const NAV = [
  { to: 'account', label: 'My Account', Icon: User },
  { to: 'members', label: 'Members & Roles', Icon: Users },
  { to: 'school', label: 'School', Icon: Building2 },
  { to: 'organization', label: 'Organization', Icon: Briefcase },
  { to: 'reports', label: 'Board Reports', Icon: CalendarClock },
  { to: 'alerts', label: 'Alerts', Icon: Bell },
  { to: 'integrations', label: 'Integrations', Icon: Plug },
  { to: 'billing', label: 'Billing', Icon: CreditCard },
  // Last, and deliberately not hidden. A school asking "can we get our data
  // out" should find the answer without asking us.
  { to: 'data', label: 'Your Data', Icon: Download },
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
          className="sel h-11 w-full !max-w-none"
        >
          {NAV.map((n) => (
            <option key={n.to} value={n.to}>
              {n.label}
            </option>
          ))}
        </select>
      </div>

      {/* Desktop: vertical nav */}
      <nav className="hidden shrink-0 sm:block sm:w-56" aria-label="Settings sections">
        <ul className="border-t border-hair">
          {/* eslint-disable-next-line no-unused-vars -- Icon is rendered as <Icon /> below */}
          {NAV.map(({ to, label, Icon }) => (
            <li key={to} className="border-b border-hair">
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `flex min-h-[40px] items-center gap-2.5 border-l-2 py-2 pl-3 pr-2 text-[13px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#2563EB]/50 ${
                    isActive
                      ? 'border-[#2563EB] text-ink'
                      : 'border-transparent text-ink2 hover:bg-ink/[0.03] hover:text-ink'
                  }`
                }
              >
                <Icon size={15} aria-hidden="true" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </>
  )
}
