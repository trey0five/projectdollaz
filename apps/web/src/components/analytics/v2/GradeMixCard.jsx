// ─────────────────────────────────────────────────────────────────────────────
// GradeMixCard — the grade-mix SHARE distribution of a school's latest enrollment
// snapshot, rendered as a BarList (skewed mixes = BarList, not donuts). Shares
// come from the frozen-contract `gradeMixShares` (web mirror in
// lib/demographicVocab); the raw count rides the value gutter. Grades render in
// the canonical grid order; empty grades are dropped. Navy/gold theme utilities.
// (Distinct from ByGradeChart, which shows raw headcount bars — this is the
// share view used in the diocesan-import + analytics mix surfaces.)
// ─────────────────────────────────────────────────────────────────────────────
import { LayoutGrid } from 'lucide-react'
import BarList from '../charts/BarList.jsx'
import { CATEGORICAL_LIGHT } from './chartPalette.js'
import { GRADE_KEYS, gradeMixShares } from '../../../lib/demographicVocab.js'

const GRADE_LABEL = { PK3: 'PK3', PK4: 'PK4', K: 'K' }
const pct = (share) => `${Math.round((Number(share) || 0) * 100)}%`

export default function GradeMixCard({ byGrade, title = 'Grade mix' }) {
  const shares = gradeMixShares(byGrade)
  const rows = GRADE_KEYS.map((g, i) => ({
    id: g,
    label: GRADE_LABEL[g] ?? g,
    color: CATEGORICAL_LIGHT[i % CATEGORICAL_LIGHT.length],
    value: shares[g] ?? 0,
    formatted: pct(shares[g]),
    share: `${Number(byGrade?.[g] ?? 0).toLocaleString('en-US')}`,
    raw: Number(byGrade?.[g] ?? 0),
  })).filter((r) => r.raw > 0)

  if (!rows.length) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-rule/60 bg-cream/50 px-6 py-10 text-center">
        <p className="font-serif text-[16px] italic text-muted">No grade breakdown yet.</p>
      </div>
    )
  }

  const total = rows.reduce((s, r) => s + r.raw, 0)

  return (
    <div className="rounded-2xl border-2 border-rule/50 bg-white p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold/15 text-gold">
            <LayoutGrid size={18} />
          </span>
          <h3 className="font-serif text-lg font-bold text-navy">{title}</h3>
        </div>
        <span className="text-[13px] text-muted">{total.toLocaleString('en-US')} students</span>
      </div>
      <BarList rows={rows} sortDesc={false} formatter={pct} />
    </div>
  )
}
