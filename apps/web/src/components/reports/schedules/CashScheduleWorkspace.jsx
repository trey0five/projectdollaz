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
import { motion, useReducedMotion } from 'framer-motion'
import { Banknote, Trash2, ArrowUp, ArrowDown, AlertTriangle } from 'lucide-react'
import { useCashSchedule } from '../../../hooks/useSchedules.js'
import { useAutosave } from '../../../hooks/useAutosave.js'
import { schedulesApi } from '../../../lib/api.js'
import { CASH_RESTRICTIONS, CASH_RESTRICTION_LABELS } from './scheduleEnums.js'
import { ScheduleSaveBar, ScheduleHeading, AddRowButton } from './CapitalScheduleWorkspace.jsx'
import { Section, StatStrip, Stat } from '../../ui/surface/index.js'
import { statMoney } from '../../budget/StatFigure.jsx'

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
  'h-7 rounded-[4px] border border-hair/[0.18] bg-white px-2 text-[12px] text-ink outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/25 disabled:opacity-50'

// ── Editable account row (module scope) ──────────────────────────────────────
function CashRow({ row, index, count, disabled, onChange, onRemove, onMove }) {
  const mismatch =
    Math.round(toNum(row.insuredPortion) + toNum(row.uninsuredPortion)) !==
    Math.round(toNum(row.balance))
  return (
    <tr>
      <td className="py-1">
        <input
          type="text"
          disabled={disabled}
          value={row.institution}
          placeholder={disabled ? '' : 'Bank / firm…'}
          onChange={(e) => onChange(row.id, 'institution', e.target.value.slice(0, 200))}
          className={`${inputCls} w-[130px]`}
        />
      </td>
      <td className="py-1">
        <input
          type="text"
          disabled={disabled}
          value={row.accountDescription}
          placeholder={disabled ? '' : 'Account…'}
          onChange={(e) => onChange(row.id, 'accountDescription', e.target.value.slice(0, 200))}
          className={`${inputCls} w-[130px]`}
        />
      </td>
      <td className="py-1">
        <input
          type="text"
          disabled={disabled}
          value={row.vehicle}
          placeholder={disabled ? '' : 'CD / Checking…'}
          onChange={(e) => onChange(row.id, 'vehicle', e.target.value.slice(0, 200))}
          className={`${inputCls} w-[100px]`}
        />
      </td>
      <td className="py-1">
        <input
          type="text"
          disabled={disabled}
          value={row.maturity}
          placeholder={disabled ? '' : 'YYYY-MM-DD'}
          onChange={(e) => onChange(row.id, 'maturity', e.target.value.slice(0, 40))}
          className={`${inputCls} w-[100px]`}
        />
      </td>
      <td className="py-1">
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
      <td className="py-1">
        <input
          type="number"
          min="0"
          disabled={disabled}
          value={row.balance}
          onChange={(e) => onChange(row.id, 'balance', nonNeg(e.target.value))}
          className={`${inputCls} w-[110px] text-right tabular-nums ${
            mismatch ? '!border-watch' : ''
          }`}
        />
      </td>
      <td className="py-1">
        <input
          type="number"
          min="0"
          disabled={disabled}
          value={row.insuredPortion}
          onChange={(e) => onChange(row.id, 'insuredPortion', nonNeg(e.target.value))}
          className={`${inputCls} w-[110px] text-right tabular-nums`}
        />
      </td>
      <td className="py-1">
        <input
          type="number"
          min="0"
          disabled={disabled}
          value={row.uninsuredPortion}
          onChange={(e) => onChange(row.id, 'uninsuredPortion', nonNeg(e.target.value))}
          className={`${inputCls} w-[110px] text-right tabular-nums`}
        />
      </td>
      <td className="py-1">
        <input
          type="text"
          disabled={disabled}
          value={row.comment}
          placeholder={disabled ? '' : 'Comment…'}
          onChange={(e) => onChange(row.id, 'comment', e.target.value.slice(0, 500))}
          className={`${inputCls} w-full min-w-[120px]`}
        />
      </td>
      <td className="py-1">
        {!disabled && (
          <div className="dt-actions flex items-center justify-end gap-0.5">
            <button
              type="button"
              onClick={() => onMove(row.id, -1)}
              disabled={index === 0}
              title="Move up"
              className="rounded-[4px] p-1 text-ink2 hover:bg-ink/[0.05] hover:text-ink disabled:opacity-30"
            >
              <ArrowUp size={14} />
            </button>
            <button
              type="button"
              onClick={() => onMove(row.id, 1)}
              disabled={index === count - 1}
              title="Move down"
              className="rounded-[4px] p-1 text-ink2 hover:bg-ink/[0.05] hover:text-ink disabled:opacity-30"
            >
              <ArrowDown size={14} />
            </button>
            <button
              type="button"
              onClick={() => onRemove(row.id)}
              title="Remove account"
              className="rounded-[4px] p-1 text-ink2 hover:bg-ink/[0.05] hover:text-ink"
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
    <tr className="dt-subtotal">
      <td colSpan={5} className="text-[11px] font-semibold uppercase tracking-[0.06em]">
        Subtotal
      </td>
      <td className="dt-num font-semibold">{money(balance)}</td>
      <td className="dt-num">{money(insured)}</td>
      <td className="dt-num">
        {uninsured > 0 ? <i className="mark tone-watch mr-1.5" aria-label="uninsured exposure" /> : null}
        {money(uninsured)}
      </td>
      <td />
      <td />
    </tr>
  )
}

export default function CashScheduleWorkspace({ schoolId, periodId, canEdit }) {
  const reduce = useReducedMotion()
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
      <div className="b2-note" aria-busy="true">
        <p>Loading cash &amp; investments…</p>
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
      <Section
        key={restriction}
        label={CASH_RESTRICTION_LABELS[restriction]}
        aside={canEdit ? <AddRowButton onClick={() => onAdd(restriction)} label="Add account" /> : null}
      >
        <div className="dt-wrap">
          <table className="dt">
            <thead>
              <tr>
                {['Institution', 'Account', 'Type', 'Maturity'].map((h) => (
                  <th key={h} scope="col">
                    {h}
                  </th>
                ))}
                {['Rate %', 'Balance', 'Insured', 'Uninsured'].map((h) => (
                  <th key={h} scope="col" className="dt-num">
                    {h}
                  </th>
                ))}
                <th scope="col">Comment</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {groupRows.length === 0 ? (
                <tr className="dt-empty">
                  <td colSpan={10}>No accounts yet — add one.</td>
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
      </Section>
    )
  }

  return (
    <motion.div
      key="cash"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <ScheduleHeading
        icon={Banknote}
        title="Cash & Investments Summary"
        savedAt={updatedAt}
        body="List bank and investment accounts with insured vs. uninsured exposure. Rates are entered as a percent (e.g. 4.25). Totals are computed in the board packet."
      />

      {anyMismatch && (
        <p className="b2-callout mt-4" data-tone="watch">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>
            On one or more accounts, insured + uninsured doesn&rsquo;t equal the balance. That&rsquo;s
            fine for overlapping coverage or estimates — it won&rsquo;t block saving.
          </span>
        </p>
      )}

      {CASH_RESTRICTIONS.map((r) => renderGroup(r))}

      <Section label="Total cash & investments">
        <StatStrip cols={3} className="stats-compact">
          <Stat label="Balance" value={statMoney(grand.balance)} />
          <Stat label="Total insured" value={statMoney(grand.insured)} />
          <Stat label="Total uninsured" value={statMoney(grand.uninsured)} status={grand.uninsured > 0 ? 'watch' : undefined} />
        </StatStrip>
      </Section>

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
