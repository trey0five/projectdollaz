// QuestionGroup — the Charts view groups its charts by the QUESTION they answer
// ("How's the money?", "How do we compare?") rather than a flat grid, so a new
// user reads intent before charts. Premium UI P3: a `Section` whose label row
// IS the question (11px caps + hairline); the charts inside are their own
// Sections on the ground, so the group adds rhythm, not a box.
import { Section } from '../../ui/surface/index.js'

export default function QuestionGroup({ title, children }) {
  return (
    <Section label={title} className="first:mt-2">
      {children}
    </Section>
  )
}
