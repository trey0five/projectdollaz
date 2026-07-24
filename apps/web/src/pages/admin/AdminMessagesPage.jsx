// ─────────────────────────────────────────────────────────────────────────────
// AdminMessagesPage — the admin "Messages" tab: compose a message into user inboxes,
// either broadcast to Everyone (target:'all') or to one Specific user (debounced
// user picker → target:'users', userIds:[id]). The `target` is always FLAT, matching
// the frozen contract. A broadcast requires an explicit confirm checkbox (it hits
// every user) before Send enables. Admin-gated route (class-level AdminGuard on the
// server); available to any admin, not just the super-admin.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { Search, Send, Users, User as UserIcon, X } from 'lucide-react'
import { adminApi, apiErrorMessage } from '../../lib/api.js'
import { SectionCard } from './_ui.jsx'
import AdminToast from '../../components/admin/AdminToast.jsx'

const LABEL_MAX = 80
const SUBJECT_MAX = 200
const BODY_MAX = 5000

function UserPicker({ selected, onSelect, onClear }) {
  const [raw, setRaw] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (selected) return undefined
    const q = raw.trim()
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!q) {
      setResults([])
      return undefined
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await adminApi.users({ search: q, page: 1, pageSize: 8 })
        setResults(res.data.users || [])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [raw, selected])

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-section px-3 py-2">
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-ink">{selected.name}</span>
          <span className="block truncate text-xs text-muted">{selected.email}</span>
        </span>
        <button
          type="button"
          onClick={onClear}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted hover:bg-white hover:text-ink"
          aria-label="Clear selected user"
        >
          <X size={14} />
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="Search a user by name or email…"
          className="w-full rounded-lg border border-border bg-white py-2 pl-8 pr-3 text-sm text-ink outline-none placeholder:text-muted focus:border-navy"
        />
      </div>
      {raw.trim() && (
        <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-border">
          {loading ? (
            <div className="px-3 py-3 text-xs text-muted">Searching…</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-3 text-xs text-muted">No users match.</div>
          ) : (
            <ul className="divide-y divide-rule">
              {results.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => onSelect({ id: u.id, name: u.name, email: u.email })}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-cream"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">{u.name}</span>
                      <span className="block truncate text-xs text-muted">{u.email}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export default function AdminMessagesPage() {
  const [audience, setAudience] = useState('all') // 'all' | 'users'
  const [selected, setSelected] = useState(null)
  const [senderLabel, setSenderLabel] = useState('KYRO Team')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [confirmAll, setConfirmAll] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState(null)
  const [totalUsers, setTotalUsers] = useState(null)

  // Fetch the user count once for the broadcast confirm label ("ALL N users").
  useEffect(() => {
    let alive = true
    adminApi
      .users({ page: 1, pageSize: 1 })
      .then((res) => {
        if (alive) setTotalUsers(res.data?.total ?? null)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const audienceReady = audience === 'all' ? confirmAll : !!selected
  const canSubmit = subject.trim() && body.trim() && audienceReady && !busy

  const reset = () => {
    setSubject('')
    setBody('')
    setConfirmAll(false)
    // Keep senderLabel + selected user so a follow-up message is quick.
  }

  const submit = async () => {
    if (!canSubmit) return
    setError('')
    setBusy(true)
    try {
      const payload = {
        ...(audience === 'all' ? { target: 'all' } : { target: 'users', userIds: [selected.id] }),
        subject: subject.trim(),
        body: body.trim(),
        ...(senderLabel.trim() ? { senderLabel: senderLabel.trim() } : {}),
      }
      const res = await adminApi.sendMessage(payload)
      const sent = res.data?.sent ?? 0
      setToast({ ok: true, message: `Sent to ${sent} user${sent === 1 ? '' : 's'}.` })
      reset()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not send the message.'))
    } finally {
      setBusy(false)
    }
  }

  const inputCls =
    'w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-navy'

  const segBtn = (val, label, icon) => (
    <button
      type="button"
      onClick={() => {
        setAudience(val)
        setError('')
      }}
      className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors ${
        audience === val ? 'bg-navy text-white' : 'text-muted hover:text-ink'
      }`}
    >
      {icon} {label}
    </button>
  )

  return (
    <>
      <SectionCard title="Messages" subtitle="Send a message to one user's inbox or broadcast to everyone.">
        <div className="mx-auto max-w-2xl">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
            Audience
          </label>
          <div className="mb-4 flex gap-1 rounded-xl border border-border bg-section p-1">
            {segBtn('all', 'Everyone', <Users size={15} />)}
            {segBtn('users', 'Specific user', <UserIcon size={15} />)}
          </div>

          {audience === 'users' ? (
            <div className="mb-4">
              <UserPicker
                selected={selected}
                onSelect={setSelected}
                onClear={() => setSelected(null)}
              />
            </div>
          ) : (
            <label className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-300/50 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-800">
              <input
                type="checkbox"
                checked={confirmAll}
                onChange={(e) => setConfirmAll(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-coral"
              />
              <span>
                This sends to <strong>ALL{totalUsers != null ? ` ${totalUsers.toLocaleString()}` : ''} users</strong>.
                I understand and want to broadcast.
              </span>
            </label>
          )}

          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
            From (sender label)
          </label>
          <input
            value={senderLabel}
            maxLength={LABEL_MAX}
            onChange={(e) => setSenderLabel(e.target.value)}
            placeholder="KYRO Team"
            className={inputCls}
          />

          <label className="mb-1 mt-4 block text-[11px] font-semibold uppercase tracking-wide text-muted">
            Subject
          </label>
          <input
            value={subject}
            maxLength={SUBJECT_MAX}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className={inputCls}
          />

          <label className="mb-1 mt-4 block text-[11px] font-semibold uppercase tracking-wide text-muted">
            Message
          </label>
          <textarea
            value={body}
            maxLength={BODY_MAX}
            rows={7}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message…"
            className={`${inputCls} resize-y`}
          />
          <div className="mt-1 text-right text-[11px] text-muted tabular-nums">
            {body.length}/{BODY_MAX}
          </div>

          {error && (
            <p className="mt-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-[13px] text-danger">
              {error}
            </p>
          )}

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 rounded-lg bg-coral px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send size={15} /> {busy ? 'Sending…' : 'Send message'}
            </button>
          </div>
        </div>
      </SectionCard>

      <AdminToast toast={toast} onDismiss={() => setToast(null)} />
    </>
  )
}
