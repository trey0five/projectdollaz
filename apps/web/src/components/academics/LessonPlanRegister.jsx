// ─────────────────────────────────────────────────────────────────────────────
// LessonPlanRegister — the classroom register. Small on purpose: a list
// teachers keep current beats a workflow nobody finishes.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { CalendarDays, Plus, Trash2 } from 'lucide-react'
import { academicsApi } from '../../lib/api.js'
import RegisterEmpty from '../module/RegisterEmpty.jsx'

// Status → the Pill's 2px mark tone; the word is always printed.
const STATUS_TONE = {
  draft: 'neutral',
  planned: 'hue',
  delivered: 'good',
  reviewed: 'good',
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
      <div className="panel panel-attention panel-body">
        <p className="text-[12.5px] font-semibold text-danger">{error}</p>
        <button
          type="button"
          onClick={load}
          className="btn btn-secondary btn-sm mt-3"
        >
          Try again
        </button>
      </div>
    )
  }

  if (rows.length === 0) {
    // One line + the register's own "+ New" (RegisterEmpty reads it from the
    // ModuleRegister shell; a viewer sees the line and no button).
    return <RegisterEmpty icon={CalendarDays} text="No lesson plans yet." actionLabel="Add a lesson plan" />
  }

  return (
    <div className="border-t border-hair">
      {rows.map((r, i) => (
        <motion.div
          key={r.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.03, duration: 0.3 }}
          className="flex h-9 items-center gap-3 border-b border-hair"
        >
          <span className={`pill pill-status tone-${STATUS_TONE[r.status] ?? STATUS_TONE.draft}`}>
            <i className="pill-mark" aria-hidden="true" />
            {r.status}
          </span>
          <span className="flex-1 truncate text-[13.5px] font-medium text-navy">{r.title}</span>
          {r.subject ? <span className="text-[11.5px] text-muted">{r.subject}</span> : null}
          {r.gradeLevel ? <span className="text-[11px] text-muted">Gr {r.gradeLevel}</span> : null}
          {r.weekOf ? (
            <span className="text-[10.5px] text-muted">{String(r.weekOf).slice(0, 10)}</span>
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
