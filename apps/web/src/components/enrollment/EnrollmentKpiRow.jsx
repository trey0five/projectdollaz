// ─────────────────────────────────────────────────────────────────────────────
// EnrollmentKpiRow — the sky KPI headline row on the enrollment Overview: Total
// enrolled · Waitlist · Support flags · New this year. In roster mode the values
// come from the FERPA-safe GET students/aggregate `kpis` block (always
// UNFILTERED, true counts — headline KPI totals are exempt from the '<5'
// min-cell display rule by the frozen spec). For SIS/snapshot schools the total
// falls back to the existing summary and roster-only KPIs show as '—'.
// Aggregate counts only — never a name.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Users, Hourglass, LifeBuoy, Sparkles } from 'lucide-react'
import { enrollmentApi } from '../../lib/api.js'

const ENROLL_HUE = '#0EA5E9'

// (props.Icon indirection — the lint config doesn't count a destructured
// component prop's JSX usage.)
function KpiCard(props) {
  const CardIcon = props.Icon
  const { label, value, sub, index } = props
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="kpi-3d relative overflow-hidden rounded-2xl p-4"
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: `linear-gradient(90deg, ${ENROLL_HUE}, ${ENROLL_HUE}55)` }}
      />
      <div className="flex items-center gap-2">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${ENROLL_HUE}14`, color: ENROLL_HUE }}
        >
          <CardIcon size={16} />
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</p>
      </div>
      <p className="mt-2 font-serif text-[28px] font-bold leading-none text-navy">
        {value == null ? '—' : Number(value).toLocaleString('en-US')}
      </p>
      {sub ? <p className="mt-1.5 text-[12px] text-muted">{sub}</p> : null}
    </motion.div>
  )
}

export default function EnrollmentKpiRow({ schoolId, rosterMode, summary }) {
  const roster = rosterMode === 'roster'
  const [kpis, setKpis] = useState(null)

  useEffect(() => {
    if (!schoolId || !roster) return undefined
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      enrollmentApi.students
        .aggregate(schoolId)
        .then((res) => {
          if (!cancelled) setKpis((res.data ?? res)?.kpis ?? null)
        })
        .catch(() => {
          if (!cancelled) setKpis(null)
        })
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, roster])

  // Nothing meaningful to headline yet → stand down quietly.
  if (!roster && summary?.latest?.totalEnrolled == null) return null

  const enrolled = roster ? kpis?.enrolled : summary?.latest?.totalEnrolled
  const rosterOnlySub = roster ? undefined : 'Needs the student roster'

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiCard
        Icon={Users}
        label="Total enrolled"
        value={enrolled}
        sub={roster ? 'Live from your roster' : summary?.latest?.observedOn ? `As of ${summary.latest.observedOn}` : undefined}
        index={0}
      />
      <KpiCard Icon={Hourglass} label="Waitlist" value={roster ? kpis?.waitlist : null} sub={rosterOnlySub} index={1} />
      <KpiCard
        Icon={LifeBuoy}
        label="Support flags"
        value={roster ? kpis?.flagged : null}
        sub={roster ? 'Enrolled with IEP · 504 · ELL' : rosterOnlySub}
        index={2}
      />
      <KpiCard
        Icon={Sparkles}
        label="New this year"
        value={roster ? kpis?.newThisYear : null}
        sub={roster ? 'Enrolled since July 1' : rosterOnlySub}
        index={3}
      />
    </div>
  )
}
