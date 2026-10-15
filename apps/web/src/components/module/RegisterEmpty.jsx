// ─────────────────────────────────────────────────────────────────────────────
// RegisterEmpty — the designed empty state for a Records table: ONE line, an
// optional short second line, and ONE button that is the register's OWN New
// action (the same handler as the strip's "+ New"). The handler arrives by
// context from DomainCommandCenter / ModuleRegister, so a page's table just
// says what is missing:
//
//   if (campaigns.length === 0)
//     return <RegisterEmpty icon={HeartHandshake} text="No campaigns yet." actionLabel="Add a campaign" />
//
// A viewer (no onNew) gets the line with no button — never a button that does
// nothing.
// ─────────────────────────────────────────────────────────────────────────────
import { createContext, useContext } from 'react'
import { Plus } from 'lucide-react'
import { AuroraEmpty, AuroraLightButton } from '../ui/aurora/index.js'

export const RegisterNewContext = createContext(null)

export default function RegisterEmpty({ icon = null, text, sub = null, actionLabel = 'Add the first one' }) {
  const onNew = useContext(RegisterNewContext)
  return (
    <AuroraEmpty
      icon={icon}
      text={text}
      sub={sub}
      action={
        onNew ? (
          <AuroraLightButton variant="ghost" onClick={onNew} icon={<Plus size={15} aria-hidden="true" />}>
            {actionLabel}
          </AuroraLightButton>
        ) : null
      }
    />
  )
}
