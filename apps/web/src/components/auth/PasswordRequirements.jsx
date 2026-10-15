// Live password-strength rules (ported from smartbot, restyled for finrep's
// surfaces). Each rule's ICON is grey before typing, then a good check when met /
// a risk cross when not; the rule text stays ink. `allRequirementsMet` gates submit.
import { Check, X, Circle } from 'lucide-react'

const requirements = [
  { label: 'At least 10 characters', test: (p) => p.length >= 10 },
  { label: 'One uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'One number', test: (p) => /[0-9]/.test(p) },
  {
    label: 'One special character (!@#$%^&*)',
    test: (p) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p),
  },
]

export function allRequirementsMet(password) {
  return requirements.every((r) => r.test(password))
}

export default function PasswordRequirements({ password, glass = false }) {
  const typing = password.length > 0
  return (
    <ul
      className={`mt-2 space-y-1 rounded-md px-3 py-2 ${
        glass ? 'border border-white/10 bg-white/[0.05]' : 'border border-hair/10 bg-ground'
      }`}
    >
      {requirements.map((req) => {
        const met = req.test(password)
        // Status = the icon's mark + ink text (the words never change colour).
        const color = glass ? 'text-white/70' : 'text-ink2'
        let iconColor = glass ? 'text-white/40' : 'text-ink2/60'
        let Icon = Circle
        if (typing) {
          if (met) {
            iconColor = glass ? 'text-emerald-300' : 'text-good'
            Icon = Check
          } else {
            iconColor = glass ? 'text-red-300' : 'text-risk'
            Icon = X
          }
        }
        return (
          <li
            key={req.label}
            className={`flex items-center text-[14px] ${color} transition-colors duration-200`}
          >
            <Icon aria-hidden="true" className={`mr-1.5 h-3.5 w-3.5 shrink-0 ${iconColor} transition-colors duration-200`} />
            {req.label}
          </li>
        )
      })}
    </ul>
  )
}
