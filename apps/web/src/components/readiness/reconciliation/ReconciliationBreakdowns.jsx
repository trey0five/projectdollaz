import ByProgramDonut from './ByProgramDonut.jsx'
import ByMonthBars from './ByMonthBars.jsx'

/** Side-by-side per-program donut + per-month bars, on-theme cards. */
export default function ReconciliationBreakdowns({ result }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="card-flashy p-5">
        <p className="mb-3 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">
          By program
        </p>
        <ByProgramDonut byProgram={result.byProgram} totalDisbursed={result.totalDisbursed} />
      </div>
      <div className="card-flashy p-5">
        <p className="mb-3 text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">
          By month
        </p>
        <ByMonthBars byMonth={result.byMonth} />
      </div>
    </div>
  )
}
