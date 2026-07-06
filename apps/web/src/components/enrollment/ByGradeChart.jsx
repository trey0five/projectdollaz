// ─────────────────────────────────────────────────────────────────────────────
// ByGradeChart — a simple, dependency-free horizontal bar chart of the latest
// roster's headcount by grade (the /summary or /snapshot byGrade map). Pure SVG-
// free CSS bars so it never pulls a chart lib into the bundle. Grades render in the
// canonical GRADE_KEYS order; grades with no students are omitted. Navy/gold theme.
// ─────────────────────────────────────────────────────────────────────────────

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

  const max = Math.max(...rows.map((r) => r.count))
  const total = rows.reduce((s, r) => s + r.count, 0)

  return (
    <div className="rounded-2xl border-2 border-rule/50 bg-white p-5 shadow-card">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="font-serif text-lg font-bold text-navy">Enrollment by grade</h3>
        <span className="text-[13px] text-muted">{total.toLocaleString('en-US')} students</span>
      </div>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.grade} className="flex items-center gap-3">
            <span className="w-9 shrink-0 text-right text-[12.5px] font-semibold text-muted">
              {GRADE_LABEL[r.grade] ?? r.grade}
            </span>
            <div className="relative h-5 flex-1 overflow-hidden rounded-md bg-section">
              <div
                className="h-full rounded-md bg-gold-gradient"
                style={{ width: `${Math.max(4, (r.count / max) * 100)}%` }}
              />
            </div>
            <span className="w-10 shrink-0 text-right text-[13px] font-semibold text-navy">
              {r.count}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
