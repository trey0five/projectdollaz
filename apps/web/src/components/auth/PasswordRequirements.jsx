// Live password-strength rules (ported from smartbot, restyled for finrep's
// cream/navy aesthetic). Each rule is GRAY before typing, then GREEN when met /
// RED when not, with a smooth color transition. `allRequirementsMet` gates submit.
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
      className={`mt-2 space-y-1 rounded-lg px-3 py-2 ${
        glass ? 'border border-white/10 bg-white/[0.05]' : 'bg-navy/[0.04]'
      }`}
    >
      {requirements.map((req) => {
        const met = req.test(password)
        let color = glass ? 'text-white/45' : 'text-muted'
        let Icon = Circle
        if (typing) {
          if (met) {
            color = glass ? 'text-emerald-300' : 'text-emerald-600'
            Icon = Check
          } else {
            color = glass ? 'text-red-300' : 'text-danger'
            Icon = X
          }
        }
        return (
          <li
            key={req.label}
            className={`flex items-center text-[14px] ${color} transition-colors duration-200`}
          >
            <Icon className="mr-1.5 h-3.5 w-3.5 shrink-0" />
            {req.label}
          </li>
        )
      })}
    </ul>
  )
}
