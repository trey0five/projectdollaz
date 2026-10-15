// QuestionGroup — the Charts view groups its charts by the QUESTION they answer
// ("How's the money?", "How do we compare?") rather than a flat grid, so a new
// user reads intent before charts. Aurora (2026-10-15): the question IS the
// section strip (medallion, serif title, coloured rule); the charts inside are
// white chart cards (styled by the Finance sub-page sheet).
import { BarChart3, Building2, ClipboardList, GraduationCap, Scale, Users, Wallet } from 'lucide-react'
import { AuroraSection } from '../../ui/aurora/index.js'

const ICON_RULES = [
  [/money|revenue|spend/i, Wallet],
  [/enrol/i, GraduationCap],
  [/staff/i, Users],
  [/plan/i, ClipboardList],
  [/compare|peer/i, Scale],
  [/system|school/i, Building2],
]

const SUBTITLE = {
  "How's the money?": 'Where it comes from and where it goes',
  "How's enrollment?": 'Students, and who gets aid',
  "How's staffing?": 'Teachers and staff',
  "What's the plan?": 'Budget, forecast and the year ahead',
  'How do we compare?': 'Your schools side by side',
}

export default function QuestionGroup({ title, subtitle = undefined, first = false, children }) {
  const Icon = ICON_RULES.find(([re]) => re.test(title))?.[1] ?? BarChart3
  return (
    <AuroraSection icon={Icon} title={title.replace("'", '’')} subtitle={subtitle ?? SUBTITLE[title] ?? null} first={first}>
      {children}
    </AuroraSection>
  )
}
