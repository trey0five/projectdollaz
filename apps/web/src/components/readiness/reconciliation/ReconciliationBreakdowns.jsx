import ByProgramDonut from './ByProgramDonut.jsx'
import ByMonthBars from './ByMonthBars.jsx'
import { Section } from '../../ui/surface/index.js'

/** Side-by-side per-program split + per-month bars, as Sections on the ground. */
export default function ReconciliationBreakdowns({ result }) {
  return (
    <div className="grid grid-cols-1 gap-x-10 gap-y-6 lg:grid-cols-2">
      <Section label="By program" className="!mt-0 min-w-0">
        <ByProgramDonut byProgram={result.byProgram} totalDisbursed={result.totalDisbursed} />
      </Section>
      <Section label="By month" className="!mt-0 min-w-0">
        <ByMonthBars byMonth={result.byMonth} />
      </Section>
    </div>
  )
}
