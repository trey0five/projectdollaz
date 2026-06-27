// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 — Cash & Investments Summary editor. A user-maintained list of bank /
// investment accounts grouped by net-asset restriction (Unrestricted /
// Temporarily / Permanently Restricted). Each account: institution · description
// · vehicle/type · maturity · rate (PERCENT, e.g. 4.25) · balance · insured ·
// uninsured · comment. Add / remove / reorder; per-group sub-tables.
//
// AUTOSAVE INVARIANT (mirrors ForecastWorkspace/CapitalScheduleWorkspace EXACTLY
// — the no-op-PUT bug-fix): ONE normalized baseline object feeds BOTH the `rows`
// state seed AND setBaseline; `dirty` is a pure render derivation. Opening writes
// nothing.
//
// interestRate is a PERCENT number (4.25 = 4.25%), NOT a fraction — settled
// contract; entered + stored + printed as a percent. The server sums
// balance/insured/uninsured INDEPENDENTLY and never enforces insured+uninsured =
// balance; we show a SOFT hint when they diverge but never block the save.
//
// React-Compiler safety: hooks at top level; row/header components at MODULE
// scope; the seed runs in the microtask-deferred sync-on-key effect.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Banknote, Plus, Trash2, ArrowUp, ArrowDown, Clock, AlertTriangle } from 'lucide-react'
import { useCashSchedule } from '../../../hooks/useSchedules.js'
import { useAutosave } from '../../../hooks/useAutosave.js'
import { schedulesApi } from '../../../lib/api.js'
import { CASH_RESTRICTIONS, CASH_RESTRICTION_LABELS } from './scheduleEnums.js'
import { ScheduleSaveBar } from './CapitalScheduleWorkspace.jsx'

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `a-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

const toNum = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const nonNeg = (v) => Math.max(0, toNum(v))
// interestRate is bounded to 4 decimal places by the DTO (@IsNumber maxDecimalPlaces:4);
// round here so a typed/pasted value like 4.12345 can never 400 the autosave PUT.
const rate4 = (v) => Math.round(nonNeg(v) * 1e4) / 1e4

function money(n) {
  const r = Math.round(toNum(n))
  return Math.abs(r).toLocaleString('en-US')
}

// Normalize a stored/echoed account into the editor's canonical shape. SAME
// normalizer feeds both the state seed and the autosave baseline.
function normalizeAccounts(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map((a) => ({
    id: typeof a?.id === 'string' && a.id ? a.id : newId(),
    restriction: CASH_RESTRICTIONS.includes(a?.restriction) ? a.restriction : 'unrestricted',
    institution: typeof a?.institution === 'string' ? a.institution : '',
    accountDescription: typeof a?.accountDescription === 'string' ? a.accountDescription : '',
    vehicle: typeof a?.vehicle === 'string' ? a.vehicle : '',
    maturity: typeof a?.maturity === 'string' ? a.maturity : '',
    interestRate: rate4(a?.interestRate),
    balance: nonNeg(a?.balance),
    insuredPortion: nonNeg(a?.insuredPortion),
    uninsuredPortion: nonNeg(a?.uninsuredPortion),
    comment: typeof a?.comment === 'string' ? a.comment : '',
  }))
}

const inputCls =
  'rounded-md border border-rule bg-white px-2 py-1 text-[12px] text-ink outline-none focus:border-gold focus:ring-1 focus:ring-gold/40 disabled:opacity-50'

// ── Editable account row (module scope) ──────────────────────────────────────
function CashRow({ row, index, count, disabled, onChange, onRemove, onMove }) {
  const mismatch =
    Math.round(toNum(row.insuredPortion) + toNum(row.uninsuredPortion)) !==
    Math.round(toNum(row.balance))
  return (
    <tr className="border-t border-rule/50 align-top hover:bg-gold/[0.04]">
      <td className="px-1.5 py-1.5">
        <input
          type="text"
          disabled={disabled}
          value={row.institution}
          placeholder={disabled ? '' : 'Bank / firm…'}
          onChange={(e) => onChange(row.id, 'institution', e.target.value.slice(0, 200))}
          className={`${inputCls} w-[130px]`}
        />
      </td>
      <td className="px-1.5 py-1.5">
        <input
          type="text"
          disabled={disabled}
          value={row.accountDescription}
          placeholder={disabled ? '' : 'Account…'}
          onChange={(e) => onChange(row.id, 'accountDescription', e.target.value.slice(0, 200))}
          className={`${inputCls} w-[130px]`}
        />
      </td>
      <td className="px-1.5 py-1.5">
        <input
          type="text"
          disabled={disabled}
          value={row.vehicle}
          placeholder={disabled ? '' : 'CD / Checking…'}
          onChange={(e) => onChange(row.id, 'vehicle', e.target.value.slice(0, 200))}
          className={`${inputCls} w-[100px]`}
        />
      </td>
      <td className="px-1.5 py-1.5">
        <input
          type="text"
          disabled={disabled}
          value={row.maturity}
          placeholder={disabled ? '' : 'YYYY-MM-DD'}
          onChange={(e) => onChange(row.id, 'maturity', e.target.value.slice(0, 40))}
          className={`${inputCls} w-[100px]`}
        />
      </td>
      <td className="px-1.5 py-1.5">
        <input
          type="number"
          step="0.01"
          min="0"
          disabled={disabled}
          value={row.interestRate}
          onChange={(e) => onChange(row.id, 'interestRate', rate4(e.target.value))}
          title="Annual rate as a percent (e.g. 4.25 = 4.25%)"
          className={`${inputCls} w-[68px] text-right tabular-nums`}
        />
      </td>
      <td className="px-1.5 py-1.5">
        <input
          type="number"
          min="0"
          disabled={disabled}
          value={row.balance}
          onChange={(e) => onChange(row.id, 'balance', nonNeg(e.target.value))}
          className={`${inputCls} w-[110px] text-right tabular-nums ${
            mismatch ? 'border-amber-400' : ''
          }`}
        />
      </td>
      <td className="px-1.5 py-1.5">
        <input
          type="number"
          min="0"
          disabled={disabled}
          value={row.insuredPortion}
          onChange={(e) => onChange(row.id, 'insuredPortion', nonNeg(e.target.value))}
          className={`${inputCls} w-[110px] text-right tabular-nums`}
        />
      </td>
      <td className="px-1.5 py-1.5">
        <input
          type="number"
          min="0"
          disabled={disabled}
          value={row.uninsuredPortion}
          onChange={(e) => onChange(row.id, 'uninsuredPortion', nonNeg(e.target.value))}
          className={`${inputCls} w-[110px] text-right tabular-nums`}
        />
      </td>
      <td className="px-1.5 py-1.5">
        <input
          type="text"
          disabled={disabled}
          value={row.comment}
          placeholder={disabled ? '' : 'Comment…'}
          onChange={(e) => onChange(row.id, 'comment', e.target.value.slice(0, 500))}
          className={`${inputCls} w-full min-w-[120px]`}
        />
      </td>
      <td className="px-1.5 py-1.5">
        {!disabled && (
          <div className="flex items-center justify-end gap-0.5">
            <button
              type="button"
              onClick={() => onMove(row.id, -1)}
              disabled={index === 0}
              title="Move up"
              className="rounded p-1 text-muted hover:bg-navy/[0.06] hover:text-navy disabled:opacity-30"
            >
              <ArrowUp size={14} />
            </button>
            <button
              type="button"
              onClick={() => onMove(row.id, 1)}
              disabled={index === count - 1}
              title="Move down"
              className="rounded p-1 text-muted hover:bg-navy/[0.06] hover:text-navy disabled:opacity-30"
            >
              <ArrowDown size={14} />
            </button>
            <button
              type="button"
              onClick={() => onRemove(row.id)}
              title="Remove account"
              className="rounded p-1 text-muted hover:bg-rose-50 hover:text-rose-600"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </td>
    </tr>
  )
}

// ── Group subtotal row (module scope) ────────────────────────────────────────
function CashSubtotalRow({ balance, insured, uninsured }) {
  return (
    <tr className="border-t border-rule bg-cream/60">
      <td
        colSpan={5}
        className="px-1.5 py-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-navy"
      >
        Subtotal
      </td>
      <td className="px-1.5 py-2 text-right text-[13px] font-semibold tabular-nums text-navy">
        {money(balance)}
      </td>
      <td className="px-1.5 py-2 text-right text-[13px] tabular-nums text-emerald-700">
        {money(insured)}
      </td>
      <td className="px-1.5 py-2 text-right text-[13px] tabular-nums text-rose-700">
        {money(uninsured)}
      </td>
      <td />
      <td />
    </tr>
  )
}

function AddRowButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gold/50 bg-gold/[0.04] px-3 py-1.5 text-[12.5px] font-semibold text-gold transition-colors hover:bg-gold/10"
    >
      <Plus size={14} /> Add account
    </button>
  )
}

export default function CashScheduleWorkspace({ schoolId, periodId, canEdit }) {
  const { accounts: savedAccounts, updatedAt, loading, refetch } = useCashSchedule(
    schoolId,
    periodId,
  )

  const [rows, setRows] = useState([])
  const seedKeyRef = useRef(`${schoolId}:${periodId}`)
  const touchedRef = useRef(false)
  const [baseline, setBaseline] = useState('')

  const draftKey = useMemo(() => JSON.stringify(rows), [rows])

  useEffect(() => {
    let cancelled = false
    const key = `${schoolId}:${periodId}`
    Promise.resolve().then(() => {
      if (cancelled) return
      const seed = () => {
        const norm = normalizeAccounts(savedAccounts)
        setRows(norm)
        setBaseline(JSON.stringify(norm))
      }
      if (key !== seedKeyRef.current) {
        seedKeyRef.current = key
        touchedRef.current = false
        seed()
      } else if (!touchedRef.current && !loading) {
        seed()
      }
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, periodId, savedAccounts, loading])

  const onChange = useCallback((id, field, value) => {
    touchedRef.current = true
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
  }, [])

  const onAdd = useCallback((restriction) => {
    touchedRef.current = true
    setRows((cur) => [
      ...cur,
      {
        id: newId(),
        restriction,
        institution: '',
        accountDescription: '',
        vehicle: '',
        maturity: '',
        interestRate: 0,
        balance: 0,
        insuredPortion: 0,
        uninsuredPortion: 0,
        comment: '',
      },
    ])
  }, [])

  const onRemove = useCallback((id) => {
    touchedRef.current = true
    setRows((cur) => cur.filter((r) => r.id !== id))
  }, [])

  const onMove = useCallback((id, dir) => {
    touchedRef.current = true
    setRows((cur) => {
      const idx = cur.findIndex((r) => r.id === id)
      if (idx < 0) return cur
      const restriction = cur[idx].restriction
      let j = idx + dir
      while (j >= 0 && j < cur.length && cur[j].restriction !== restriction) j += dir
      if (j < 0 || j >= cur.length) return cur
      const next = cur.slice()
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next
    })
  }, [])

  const dirty = canEdit && baseline !== '' && draftKey !== baseline

  const doSave = useCallback(async () => {
    if (!schoolId || !periodId) return
    const body = {
      accounts: rows.map((r) => ({
        id: r.id,
        restriction: r.restriction,
        institution: r.institution,
        accountDescription: r.accountDescription,
        vehicle: r.vehicle,
        maturity: r.maturity ?? '',
        interestRate: rate4(r.interestRate),
        balance: nonNeg(r.balance),
        insuredPortion: nonNeg(r.insuredPortion),
        uninsuredPortion: nonNeg(r.uninsuredPortion),
        comment: r.comment ?? '',
      })),
    }
    await schedulesApi.saveCash(schoolId, periodId, body)
    await refetch()
    setBaseline(JSON.stringify(rows))
  }, [schoolId, periodId, rows, refetch])

  const { saving, error: saveError, saveNow } = useAutosave({
    enabled: canEdit,
    dirty,
    signal: draftKey,
    save: doSave,
  })

  const byGroup = useMemo(() => {
    const map = { unrestricted: [], temporarily_restricted: [], permanently_restricted: [] }
    for (const r of rows) (map[r.restriction] || (map[r.restriction] = [])).push(r)
    return map
  }, [rows])

  const grand = useMemo(() => {
    let balance = 0
    let insured = 0
    let uninsured = 0
    for (const r of rows) {
      balance += toNum(r.balance)
      insured += toNum(r.insuredPortion)
      uninsured += toNum(r.uninsuredPortion)
    }
    return { balance, insured, uninsured }
  }, [rows])

  const anyMismatch = useMemo(
    () =>
      rows.some(
        (r) =>
          Math.round(toNum(r.insuredPortion) + toNum(r.uninsuredPortion)) !==
          Math.round(toNum(r.balance)),
      ),
    [rows],
  )

  if (loading) {
    return (
      <div className="card-soft animate-pulse px-6 py-14 text-center">
        <p className="font-serif text-base italic text-muted">Loading cash & investments…</p>
      </div>
    )
  }

  const renderGroup = (restriction) => {
    const groupRows = byGroup[restriction] || []
    let bal = 0
    let ins = 0
    let unins = 0
    for (const r of groupRows) {
      bal += toNum(r.balance)
      ins += toNum(r.insuredPortion)
      unins += toNum(r.uninsuredPortion)
    }
    return (
      <div key={restriction} className="card-soft overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 border-b border-rule bg-navy-gradient px-4 py-2.5">
          <h4 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-gold-light">
            {CASH_RESTRICTION_LABELS[restriction]}
          </h4>
          {canEdit && <AddRowButton onClick={() => onAdd(restriction)} />}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-cream">
                {['Institution', 'Account', 'Type', 'Maturity'].map((h) => (
                  <th
                    key={h}
                    className="px-1.5 py-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted"
                  >
                    {h}
                  </th>
                ))}
                {['Rate %', 'Balance', 'Insured', 'Uninsured'].map((h) => (
                  <th
                    key={h}
                    className="px-1.5 py-2 text-right text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted"
                  >
                    {h}
                  </th>
                ))}
                <th className="px-1.5 py-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-gold">
                  Comment
                </th>
                <th className="px-1.5 py-2" />
              </tr>
            </thead>
            <tbody>
              {groupRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-[12.5px] italic text-muted">
                    No accounts yet — add one.
                  </td>
                </tr>
              ) : (
                groupRows.map((r, i) => (
                  <CashRow
                    key={r.id}
                    row={r}
                    index={i}
                    count={groupRows.length}
                    disabled={!canEdit}
                    onChange={onChange}
                    onRemove={onRemove}
                    onMove={onMove}
                  />
                ))
              )}
              {groupRows.length > 0 && (
                <CashSubtotalRow balance={bal} insured={ins} uninsured={unins} />
              )}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <motion.div
      key="cash"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-5"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-gradient text-gold-light">
          <Banknote size={20} />
        </span>
        <div className="flex-1">
          <h3 className="font-serif text-lg font-semibold text-navy">Cash &amp; Investments Summary</h3>
          <p className="text-[13px] text-muted">
            List bank and investment accounts with insured vs. uninsured exposure. Rates are entered as
            a percent (e.g. 4.25). Totals are computed in the board packet.
          </p>
        </div>
        {updatedAt && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-navy/[0.06] px-2.5 py-1 text-[11px] font-medium text-muted">
            <Clock size={12} /> Saved{' '}
            {new Date(updatedAt).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </span>
        )}
      </div>

      {anyMismatch && (
        <div className="card-soft border-amber-300 bg-amber-50/60 px-4 py-2.5">
          <p className="flex items-start gap-2 text-[12.5px] text-amber-800">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>
              On one or more accounts, insured + uninsured doesn&rsquo;t equal the balance. That&rsquo;s
              fine for overlapping coverage or estimates — it won&rsquo;t block saving.
            </span>
          </p>
        </div>
      )}

      {CASH_RESTRICTIONS.map((r) => renderGroup(r))}

      <div className="card-soft flex flex-wrap items-center justify-between gap-4 border-gold/40 bg-gold/[0.06] px-4 py-3">
        <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-navy">
          Total Cash &amp; Investments
        </span>
        <div className="flex flex-wrap items-center gap-6 text-[14px] tabular-nums">
          <span className="text-navy">
            <span className="mr-1.5 text-[11px] uppercase tracking-[0.06em] text-muted">Balance</span>
            <span className="font-semibold">{money(grand.balance)}</span>
          </span>
          <span className="text-emerald-700">
            <span className="mr-1.5 text-[11px] uppercase tracking-[0.06em] text-muted">
              Total insured
            </span>
            <span className="font-semibold">{money(grand.insured)}</span>
          </span>
          <span className="text-rose-700">
            <span className="mr-1.5 text-[11px] uppercase tracking-[0.06em] text-muted">
              Total uninsured
            </span>
            <span className="font-semibold">{money(grand.uninsured)}</span>
          </span>
        </div>
      </div>

      <ScheduleSaveBar
        canEdit={canEdit}
        saving={saving}
        saveError={saveError}
        dirty={dirty}
        savedAt={updatedAt}
        onSave={saveNow}
        label="cash & investments"
      />
    </motion.div>
  )
}
