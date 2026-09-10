// ─────────────────────────────────────────────────────────────────────────────
// ByGradeChart — the latest roster's headcount by grade (the /summary or
// /snapshot byGrade map) as columns on the shared ColumnChart primitive, in the
// enrollment module hue. Grades render in the canonical GRADE_KEYS order; grades
// with no students are omitted.
// ─────────────────────────────────────────────────────────────────────────────
import ColumnChart from '../analytics/charts/ColumnChart.jsx'
import { moduleHue } from '../module/moduleAnatomy.js'

const ENROLL_HUE = moduleHue('enrollment')

// The canonical enrollment grid order (mirrors @finrep/analytics GRADE_KEYS). Kept
// local so the web bundle never imports the analytics package just for a label list.
const GRADE_KEYS = ['PK3', 'PK4', 'K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']
const GRADE_LABEL = { PK3: 'PK3', PK4: 'PK4', K: 'K' }

export default function ByGradeChart({ byGrade }) {
  const rows = GRADE_KEYS.map((g) => ({ grade: g, count: Number(byGrade?.[g] ?? 0) })).filter(
    (r) => r.count > 0,
  )

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-rule/60 bg-cream/50 px-6 py-10 text-center">
        <p className="font-serif text-[16px] italic text-muted">No enrollment by grade yet.</p>
        <p className="mt-1 text-[13px] text-muted">
          Upload a roster or enter a snapshot to see the grade breakdown.
        </p>
      </div>
    )
  }

  const total = rows.reduce((s, r) => s + r.count, 0)

  return (
    <div className="rounded-2xl border-2 border-rule/50 bg-white p-5 shadow-card">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="font-serif text-lg font-bold text-navy">Enrollment by grade</h3>
        <span className="text-[13px] text-muted">{total.toLocaleString('en-US')} students</span>
      </div>
      <ColumnChart
        rows={rows.map((r) => ({ id: r.grade, label: GRADE_LABEL[r.grade] ?? r.grade, value: r.count }))}
        color={ENROLL_HUE}
        showValues="all"
        height={180}
        ariaLabel="Enrollment by grade"
      />
    </div>
  )
}
