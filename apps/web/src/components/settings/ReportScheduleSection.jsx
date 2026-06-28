// Phase 3 — scheduled board-report delivery config. Owner/accountant set a cadence
// + recipients and enable recurring emails of the board financial summary; a
// "Send test now" button triggers an immediate send. Read-only for viewers.
import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Send } from 'lucide-react'
import { useSchools } from '../../context/SchoolContext.jsx'
import { reportScheduleApi, apiErrorMessage } from '../../lib/api.js'
import { FormError, FormSuccess } from '../auth/fields.jsx'
import SettingsCard from './SettingsCard.jsx'

const labelCls = 'mb-2 block text-[14px] font-semibold uppercase tracking-[0.14em] text-muted'
const inputCls =
  'w-full rounded-lg border-2 border-border bg-white px-4 py-3 text-base text-ink outline-none transition-colors focus:border-gold disabled:cursor-not-allowed disabled:bg-navy/[0.04] disabled:text-muted'

export default function ReportScheduleSection() {
  const { activeId, activeSchool } = useSchools()
  const canEdit = activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'

  const [cadence, setCadence] = useState('monthly')
  const [recipients, setRecipients] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [lastSentAt, setLastSentAt] = useState(null)
  const [busy, setBusy] = useState(false)
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')

  const load = useCallback(async (id) => {
    try {
      const res = await reportScheduleApi.get(id)
      const d = res.data
      setCadence(d.cadence || 'monthly')
      setRecipients(d.recipients || '')
      setEnabled(!!d.enabled)
      setLastSentAt(d.lastSentAt || null)
    } catch {
      // leave defaults
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled && activeId) load(activeId)
    })
    return () => {
      cancelled = true
    }
  }, [activeId, load])

  const save = async () => {
    if (!canEdit || busy) return
    setErr('')
    setOk('')
    setBusy(true)
    try {
      const res = await reportScheduleApi.save(activeId, { cadence, recipients, enabled })
      setLastSentAt(res.data?.lastSentAt || null)
      setOk('Schedule saved.')
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not save the schedule.'))
    } finally {
      setBusy(false)
    }
  }

  const sendTest = async () => {
    if (!canEdit || sending) return
    setErr('')
    setOk('')
    setSending(true)
    try {
      const res = await reportScheduleApi.sendNow(activeId)
      setOk(res.data?.message || 'Sent.')
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not send the test summary.'))
    } finally {
      setSending(false)
    }
  }

  if (!activeSchool) {
    return (
      <SettingsCard title="Board Reports">
        <p className="text-[16px] text-muted">Select a school first.</p>
      </SettingsCard>
    )
  }

  return (
    <SettingsCard
      title="Scheduled board reports"
      description={
        canEdit
          ? 'Email a board financial summary to recipients on a recurring schedule.'
          : 'Read-only — only an owner or accountant can edit.'
      }
    >
      <label className="mb-5 flex items-center gap-3">
        <input
          type="checkbox"
          checked={enabled}
          disabled={!canEdit}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 accent-gold"
        />
        <span className="text-[16px] font-semibold text-navy">Send recurring board summaries</span>
      </label>

      <div className="mb-5">
        <label className={labelCls}>Cadence</label>
        <select
          className={inputCls}
          value={cadence}
          disabled={!canEdit}
          onChange={(e) => setCadence(e.target.value)}
        >
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </div>

      <div className="mb-2">
        <label className={labelCls}>Recipients</label>
        <textarea
          className={`${inputCls} min-h-[80px] resize-y`}
          value={recipients}
          disabled={!canEdit}
          onChange={(e) => setRecipients(e.target.value)}
          placeholder="board@school.org, treasurer@school.org"
        />
        <p className="mt-1.5 text-[14px] text-muted">
          Comma or newline separated. Each email gets the period’s summary plus a link to the full
          board packet.
        </p>
      </div>

      {lastSentAt && (
        <p className="mb-3 text-[14px] text-muted">
          Last sent {new Date(lastSentAt).toLocaleString()}.
        </p>
      )}

      {err && <FormError>{err}</FormError>}
      {ok && <FormSuccess>{ok}</FormSuccess>}

      {canEdit && (
        <div className="mt-3 flex flex-wrap gap-3">
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={save}
            disabled={busy}
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-50 sm:px-8"
          >
            {busy ? 'Saving…' : 'Save schedule'}
          </motion.button>
          <button
            onClick={sendTest}
            disabled={sending}
            className="inline-flex items-center gap-2 rounded-lg border-2 border-border bg-white px-5 py-2.5 text-[15px] font-semibold text-navy transition-all hover:border-gold/50 hover:text-gold disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={15} /> {sending ? 'Sending…' : 'Send test now'}
          </button>
        </div>
      )}
    </SettingsCard>
  )
}
