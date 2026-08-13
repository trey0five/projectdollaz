// ─────────────────────────────────────────────────────────────────────────────
// LessonPlanRegister — the classroom register. Small on purpose: a list
// teachers keep current beats a workflow nobody finishes.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { CalendarDays, Plus, Trash2 } from 'lucide-react'
import { academicsApi } from '../../lib/api.js'

const HUE = '#0D9488'
const STATUS_TONE = {
  draft: 'bg-navy/[0.06] text-navy/70',
  planned: 'bg-sky-500/12 text-sky-700',
  delivered: 'bg-emerald-500/12 text-emerald-700',
  reviewed: 'bg-violet-500/12 text-violet-700',
}

export default function LessonPlanRegister({ schoolId, canEdit }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!schoolId) return
    try {
      const res = await academicsApi.lessonPlans(schoolId)
      setRows(res.data ?? res)
    } catch (e) {
      setError(e?.response?.data?.message ?? 'Could not load lesson plans.')
    } finally {
      setLoading(false)
    }
  }, [schoolId])

  useEffect(() => {
    load()
  }, [load])

  const remove = async (id) => {
    await academicsApi.removeLessonPlan(schoolId, id)
    load()
  }

  if (loading) return <p className="text-[13px] text-muted">Loading…</p>

  // BEFORE the empty state, not after it. A failed load also produces zero rows,
  // and the early return below sits above the only place `error` is rendered —
  // so "we could not reach the server" was displayed as "you have not added
  // anything yet", which invites the reader to add a duplicate.
  if (error) {
    return (
      <div className="rounded-2xl border border-danger/25 bg-white p-6">
        <p className="text-[12.5px] font-semibold text-danger">{error}</p>
        <button
          type="button"
          onClick={load}
          className="mt-3 rounded-xl border border-navy/15 px-4 py-2 text-[12px] font-semibold text-navy"
        >
          Try again
        </button>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-navy/20 bg-white p-10 text-center">
        <CalendarDays size={20} className="mx-auto mb-2" style={{ color: HUE }} />
        <p className="font-serif text-[17px] font-semibold text-navy">No lesson plans yet</p>
        <p className="mt-1 text-[12.5px] text-muted">Add one from the Add data tab.</p>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => (
        <motion.div
          key={r.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.03, duration: 0.3 }}
          className="flex items-center gap-3 rounded-xl border border-navy/10 bg-white px-4 py-2.5"
        >
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_TONE[r.status] ?? STATUS_TONE.draft}`}>
            {r.status}
          </span>
          <span className="flex-1 truncate text-[13.5px] font-medium text-navy">{r.title}</span>
          {r.subject ? <span className="text-[11.5px] text-muted">{r.subject}</span> : null}
          {r.gradeLevel ? <span className="font-mono text-[11px] text-muted">Gr {r.gradeLevel}</span> : null}
          {r.weekOf ? (
            <span className="font-mono text-[10.5px] text-muted">{String(r.weekOf).slice(0, 10)}</span>
          ) : null}
          {canEdit ? (
            <button type="button" onClick={() => remove(r.id)} className="text-muted hover:text-danger" aria-label="Delete">
              <Trash2 size={14} />
            </button>
          ) : null}
        </motion.div>
      ))}
      {error ? <p className="text-[12.5px] text-danger">{error}</p> : null}
    </div>
  )
}
