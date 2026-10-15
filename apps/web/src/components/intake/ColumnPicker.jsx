// ─────────────────────────────────────────────────────────────────────────────
// ColumnPicker — "Show KYRO where your numbers are" (#32).
//
// When KYRO can't read a trial balance on its own, the person sees the top of
// their own file, KYRO's best guess pre-selected, and four plain selects: which
// row holds the column names, and which columns hold the account numbers, the
// names and the amounts (a column of amounts is greyed out for the account
// numbers). Every change re-reads the file LIVE with the real
// parser (ingest with `columns`) — pure and synchronous, inside a useMemo, no
// effect — and the line under the table says what that read produced, or why
// not. Nothing is applied until somebody presses "Use these columns": the guess
// is a proposal, never an import.
//
// The preview stays in the browser. It is never sent to the API, never logged,
// never shown to KYRO chat.
// ─────────────────────────────────────────────────────────────────────────────
import { useId, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, ChevronDown, Columns3 } from 'lucide-react'
import '../../styles/pending/c1-flows.css'
import {
  columnsHoldingAmounts,
  ingest,
  previewFile,
  statementLabel,
  unassignedNumericColumns,
} from '@finrep/ingestion'
import { failureFromError, failureText } from '../../lib/ingestFailure.js'
import { fmt } from '../../lib/format.js'
import { validateDataset } from '@finrep/engine'

/** "$7,371,775" — whole dollars when whole. */
const fmtMoney = (n) =>
  `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: Number.isInteger(n) ? 0 : 2 })}`

const FEW_ROWS = 10
const DC = 'dc' // the "Debit and credit columns…" amounts option

/**
 * The shared Aurora form select (field-plain field-select + a ChevronDown), the
 * same control the review popup and the record forms use — so the two intake
 * surfaces look like one product. Still a native select: keyboard-native and
 * it fits a phone.
 */
function PickerSelect({ children, ...rest }) {
  return (
    <div className="relative w-full min-w-0">
      <select {...rest} className="field-plain field-select w-full min-w-0 text-ink">
        {children}
      </select>
      <ChevronDown
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 mt-[3px] -translate-y-1/2 text-ink2"
      />
    </div>
  )
}

/** A complete, well-formed choice from a (possibly partial) one. */
export function normalizeChoice(c, sheet = null) {
  const n = (v) => (Number.isInteger(v) ? v : -1)
  const amount = n(c?.amount)
  const debit = amount >= 0 ? -1 : n(c?.debit)
  const credit = amount >= 0 ? -1 : n(c?.credit)
  return {
    sheet: c?.sheet ?? sheet ?? null,
    headerRow: Number.isInteger(c?.headerRow) ? c.headerRow : -1,
    acct: n(c?.acct),
    desc: n(c?.desc),
    amount,
    debit,
    credit,
  }
}

/**
 * Columns that hold numbers and aren't already the account numbers or names —
 * 'money', and also whole-dollar 'acct'-looking or mixed columns with amounts
 * in them (unlabelled debit/credit columns read as 'acct'). Uses the preview's
 * `numeric` flag when it has one.
 */
export function numberColumns(cols, choice) {
  return (cols || []).filter(
    (c) =>
      c.index !== choice.acct &&
      c.index !== choice.desc &&
      !c.budgetish &&
      (c.numeric === true || c.kind === 'money' || ((c.kind === 'acct' || c.kind === 'mixed') && (c.nonZeroMoney ?? 0) > 0)),
  )
}

/**
 * A column that holds amounts, never account numbers — the parser's own rule
 * (columnHoldsAmounts: its header names money, or its numbers are not account
 * numbers). `flags` = that rule re-run at the header row the person chose
 * (columnsHoldingAmounts); without them, the preview's flag for its guessed
 * header row. NOT budgetish: on a budget report an "Acct" column is flagged
 * budgetish too, and it is the account numbers.
 */
export function isAmountsColumn(col, flags = null) {
  if (!col) return false
  if (Array.isArray(flags) && flags.length > col.index) return flags[col.index] === true
  return col.holdsAmounts === true
}

/** What a trial-balance read is off by (0 when it balances, or for a statement). */
export function readImbalance(result) {
  if (!result || result.metadata?.statement) return 0
  const v = validateDataset(result.rows || [])
  const d = Math.abs(Number(v?.difference) || 0)
  return d < 1 ? 0 : d
}

const colLabel = (col, withHeader = true) =>
  `Column ${col.letter}${withHeader && col.header ? ` — “${col.header}”` : ''}`

/** What the live read says, as data (the component renders it). */
export function readWithChoice(fileName, bytes, choice, memory) {
  if (!bytes) return null
  try {
    const result = ingest(fileName, bytes, { columns: choice, memory })
    return { ok: true, result }
  } catch (e) {
    return { ok: false, failure: failureFromError(e) }
  }
}

export default function ColumnPicker({
  fileName,
  bytes,
  preview,
  initial = null,
  memory = null,
  onApply,
  onCancel,
}) {
  const reduce = useReducedMotion()
  const uid = useId()
  const [current, setCurrent] = useState(preview)
  const [choice, setChoice] = useState(() =>
    normalizeChoice(initial ?? preview?.guess, preview?.sheet ?? null),
  )
  const [moreRows, setMoreRows] = useState(false)
  // "Debit and credit columns…" is a MODE the person chose, not something
  // derived from the picks: a file whose debit/credit columns couldn't be
  // guessed used to snap straight back to "Pick a column…" with no boxes.
  const [dcMode, setDcMode] = useState(() => {
    const c = initial ?? preview?.guess
    return !(Number.isInteger(c?.amount) && c.amount >= 0) && ((c?.debit ?? -1) >= 0 || (c?.credit ?? -1) >= 0)
  })

  const live = useMemo(
    () => readWithChoice(fileName, bytes, choice, memory),
    [fileName, bytes, choice, memory],
  )

  // The account-number test depends on the header row: re-judge every column
  // whenever the person moves it (the preview's flags are for its guess only).
  const amountFlags = useMemo(() => {
    if (!current || !bytes || choice.headerRow === current.guess?.headerRow) return null
    try {
      return columnsHoldingAmounts(fileName, bytes, { sheet: current.sheet ?? null, headerRow: choice.headerRow })
    } catch {
      return null
    }
  }, [fileName, bytes, current, choice.headerRow])

  if (!current) return null
  const cols = current.columns || []
  const amountMode = dcMode ? DC : choice.amount >= 0 ? String(choice.amount) : ''
  const rows = current.rows || []
  const shown = moreRows ? rows : rows.slice(0, FEW_ROWS)
  const headerOptions = Array.from({ length: Math.max(rows.length, choice.headerRow + 1) }, (_, i) => i)

  const set = (patch) => setChoice((prev) => normalizeChoice({ ...prev, ...patch }, current.sheet))

  const onSheet = (name) => {
    // A handler, not an effect: re-preview the chosen sheet and start from its guess.
    const next = previewFile(fileName, bytes, { sheet: name })
    if (!next) return
    setCurrent(next)
    setChoice(normalizeChoice(next.guess, next.sheet))
    setDcMode(!(next.guess?.amount >= 0) && (next.guess?.debit >= 0 || next.guess?.credit >= 0))
    setMoreRows(false)
  }

  const numbers = numberColumns(cols, choice)
  const onAmount = (v) => {
    if (v === DC) {
      setDcMode(true)
      // Prefer the guess, then the column already picked as Amounts (usually
      // the debits), then the other number columns in order.
      // Prefer the guess, then the parser's suggested debit/credit pair (from
      // the headers, else the content), then the column already picked as
      // Amounts (usually the debits), then any other number column in order.
      const sug = current.suggestedDebitCredit ?? null
      const pool = [
        ...(choice.amount >= 0 ? [choice.amount] : []),
        ...numbers.map((c) => c.index).filter((i) => i !== choice.amount),
      ]
      const debit =
        current.guess?.debit >= 0 ? current.guess.debit : sug?.debit >= 0 ? sug.debit : pool[0] ?? -1
      const credit =
        current.guess?.credit >= 0
          ? current.guess.credit
          : sug?.credit >= 0 && sug.credit !== debit
            ? sug.credit
            : pool.find((i) => i !== debit) ?? -1
      set({ amount: -1, debit, credit })
    } else {
      setDcMode(false)
      set({ amount: Number(v), debit: -1, credit: -1 })
    }
  }
  // Amounts = one column, and ANOTHER number column sits unused: half the
  // books may be in it (unlabelled debit C + credit D read as C only).
  // The parser's own rule when it has one (skips used, budget and net-of-pair
  // columns); else the same judgement from the column kinds.
  const strayNumbers = (() => {
    if (dcMode || choice.amount < 0) return []
    if (typeof unassignedNumericColumns === 'function' && cols.some((c) => typeof c.numeric === 'boolean')) {
      const idx = new Set(unassignedNumericColumns(current, choice).map((w) => w.column))
      return cols.filter((c) => idx.has(c.index))
    }
    return numbers.filter((c) => c.index !== choice.amount && !c.budgetish)
  })()
  const takeAsCredits = (col) => {
    setDcMode(true)
    set({ amount: -1, debit: choice.amount, credit: col.index })
  }

  // One column, one job: an option another question already uses is greyed
  // out and says which ("Column B · used for Names"). The amounts question
  // owns amount/debit/credit together (switching modes clears the others).
  const JOB = { acct: 'Account numbers', desc: 'Names', amount: 'Amounts', debit: 'Debit', credit: 'Credit' }
  const OWN = { acct: ['acct'], desc: ['desc'], amount: ['amount', 'debit', 'credit'], debit: ['debit'], credit: ['credit'] }
  const usedFor = (i, self) => {
    for (const k of Object.keys(JOB)) {
      if (OWN[self].includes(k)) continue
      if (choice[k] >= 0 && choice[k] === i) return JOB[k]
    }
    return null
  }
  const colOption = (c, self, suffix = '') => {
    const by = usedFor(c.index, self)
    // A column of amounts is never the account numbers (the parser refuses it
    // as 'acct-is-money'): greyed out and labelled, like a used column.
    const amounts = self === 'acct' && !by && isAmountsColumn(c, amountFlags)
    return (
      <option key={c.index} value={String(c.index)} disabled={!!by || amounts}>
        {colLabel(c)}
        {suffix}
        {by ? ` · used for ${by}` : ''}
        {amounts ? ' · amounts' : ''}
      </option>
    )
  }

  const tagOf = (i) => {
    if (i === choice.acct) return 'Account'
    if (i === choice.desc) return 'Name'
    if (i === choice.amount) return 'Amount'
    if (i === choice.debit) return 'Debit'
    if (i === choice.credit) return 'Credit'
    return null
  }

  const ok = !!live?.ok
  const result = ok ? live.result : null
  const offBy = ok ? readImbalance(result) : 0
  const readAs = result?.metadata?.statement ? statementLabel(result.metadata.statement) : 'a trial balance'
  const sample = ok ? result.rows.slice(0, 3) : []
  const remembers = ok ? !!result.metadata?.layout?.signature : !!current.signature

  return (
    <motion.section
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 0.8, 0.2, 1] }}
      aria-labelledby={`${uid}-title`}
      className="w-full min-w-0 border-t-2 border-[rgb(var(--c-watch))] pt-3"
      data-testid="column-picker"
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex shrink-0 text-ink2">
          <Columns3 size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id={`${uid}-title`} className="text-[15px] font-semibold text-ink">
            Show KYRO where your numbers are
          </h3>
          <p className="truncate text-[13px] text-ink2" title={fileName}>
            {fileName}
          </p>
        </div>
      </div>

      {/* The four questions (plus Sheet for a workbook). Native selects: keyboard-
          native and they fit a phone. */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {current.sheets?.length > 1 && (
          <label className="flex min-w-0 flex-col gap-1 text-[12.5px] font-medium text-ink2 sm:col-span-2 lg:col-span-4">
            Sheet
            <PickerSelect
              value={current.sheet ?? ''}
              onChange={(e) => onSheet(e.target.value)}
            >
              {current.sheets.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </PickerSelect>
          </label>
        )}
        <label className="flex min-w-0 flex-col gap-1 text-[12.5px] font-medium text-ink2">
          Column names are in
          <PickerSelect
            value={String(choice.headerRow)}
            onChange={(e) => set({ headerRow: Number(e.target.value) })}
          >
            {headerOptions.map((i) => (
              <option key={i} value={String(i)}>
                Row {i + 1}
              </option>
            ))}
            <option value="-1">No header row</option>
          </PickerSelect>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-[12.5px] font-medium text-ink2">
          Account numbers
          <PickerSelect
            value={String(choice.acct)}
            onChange={(e) => set({ acct: Number(e.target.value) })}
          >
            {cols.map((c) => colOption(c, 'acct'))}
            {(current.readsAsStatement || choice.acct === -1) && (
              <option value="-1">None — KYRO numbers them</option>
            )}
          </PickerSelect>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-[12.5px] font-medium text-ink2">
          Names
          <PickerSelect
            value={String(choice.desc)}
            onChange={(e) => set({ desc: Number(e.target.value) })}
          >
            {cols.map((c) => colOption(c, 'desc'))}
            <option value="-1">None</option>
          </PickerSelect>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-[12.5px] font-medium text-ink2">
          Amounts
          <PickerSelect value={amountMode} onChange={(e) => onAmount(e.target.value)}>
            {amountMode === '' && (
              <option value="" disabled>
                Pick a column…
              </option>
            )}
            {cols.map((c) => colOption(c, 'amount', c.budgetish ? ' (budget)' : ''))}
            <option value={DC}>Debit and credit columns…</option>
          </PickerSelect>
        </label>
        {amountMode === DC && (
          <>
            <label className="flex min-w-0 flex-col gap-1 text-[12.5px] font-medium text-ink2">
              Debit
              <PickerSelect
                value={String(choice.debit)}
                onChange={(e) => set({ amount: -1, debit: Number(e.target.value) })}
              >
                <option value="-1" disabled>
                  Pick a column…
                </option>
                {cols.map((c) => colOption(c, 'debit', c.budgetish ? ' (budget)' : ''))}
              </PickerSelect>
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-[12.5px] font-medium text-ink2">
              Credit
              <PickerSelect
                value={String(choice.credit)}
                onChange={(e) => set({ amount: -1, credit: Number(e.target.value) })}
              >
                <option value="-1" disabled>
                  Pick a column…
                </option>
                {cols.map((c) => colOption(c, 'credit', c.budgetish ? ' (budget)' : ''))}
              </PickerSelect>
            </label>
          </>
        )}
      </div>

      {/* The top of their own file. Scrolls inside itself so a wide export never
          scrolls the page sideways on a phone. */}
      <div className="mt-3 max-w-full overflow-x-auto rounded-[6px] border border-hair">
        <table className="min-w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="bg-ground">
              <th scope="col" className="w-9 border-b border-hair px-1.5 py-1 text-right font-medium text-ink2">
                <span className="sr-only">Row</span>
              </th>
              {cols.map((c) => {
                const tag = tagOf(c.index)
                return (
                  <th
                    key={c.index}
                    scope="col"
                    className={`whitespace-nowrap border-b border-hair px-2 py-1 text-left font-semibold text-ink2 ${
                      tag ? 'outline outline-2 -outline-offset-2 outline-[rgb(var(--c-ink))]' : ''
                    }`}
                  >
                    {c.letter}
                    {tag && (
                      <span className="ml-1.5 rounded-[4px] bg-ink px-1 py-px text-[10.5px] font-semibold uppercase tracking-[0.06em] text-white">
                        {tag}
                      </span>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, r) => {
              const isHeader = r === choice.headerRow
              return (
                <tr
                  key={r}
                  className={isHeader ? 'bg-[rgb(var(--c-watch)/0.12)] font-semibold' : r < choice.headerRow ? 'text-ink2' : ''}
                >
                  <th scope="row" className="border-b border-hair px-1.5 py-1 text-right font-medium tabular-nums text-ink2">
                    {r + 1}
                  </th>
                  {cols.map((c) => {
                    const tag = tagOf(c.index)
                    const numeric = c.kind === 'money' || c.kind === 'acct'
                    return (
                      <td
                        key={c.index}
                        className={`max-w-[16rem] truncate whitespace-nowrap border-b border-hair px-2 py-1 text-ink ${
                          numeric && !isHeader ? 'font-mono tabular-nums' : ''
                        } ${tag ? 'bg-ink/[0.03]' : ''}`}
                      >
                        {row[c.index] ?? ''}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {rows.length > FEW_ROWS && (
        <button
          type="button"
          onClick={() => setMoreRows((v) => !v)}
          className="mt-1.5 text-[12.5px] font-semibold text-ink2 hover:underline"
        >
          {moreRows ? 'Show fewer rows' : 'Show more rows'}
        </button>
      )}

      {/* The live read. */}
      <div aria-live="polite" className="mt-3">
        {ok ? (
          <div className="b2-callout" data-tone={offBy ? 'watch' : 'good'} data-testid="picker-live">
            {offBy ? <AlertTriangle size={15} aria-hidden="true" /> : <CheckCircle2 size={15} aria-hidden="true" />}
            <div className="min-w-0">
              <p className="font-semibold">
                {result.rows.length} account{result.rows.length === 1 ? '' : 's'} · read as {readAs}
              </p>
              {offBy ? (
                <p className="mt-0.5 font-medium text-ink" data-testid="picker-offby">
                  Debits and credits are {fmtMoney(offBy)} apart — is a column missing?
                </p>
              ) : null}
              {strayNumbers.length > 0 && (
                <p className="mt-1 flex flex-wrap items-center gap-x-2 text-ink" data-testid="picker-stray">
                  <span>
                    Column {strayNumbers[0].letter} also has numbers — is it your credits?
                  </span>
                  <button
                    type="button"
                    className="font-semibold underline decoration-hair underline-offset-2 hover:decoration-ink"
                    onClick={() => takeAsCredits(strayNumbers[0])}
                  >
                    Use {colLabel(cols.find((c) => c.index === choice.amount) ?? { letter: '?' }, false)} as debits and {colLabel(strayNumbers[0], false)} as credits
                  </button>
                </p>
              )}
              {sample.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-ink2">
                  {sample.map((r, i) => (
                    <li key={`${r.acct}-${i}`} className="flex min-w-0 gap-2">
                      <span className="font-mono tabular-nums">{r.acct}</span>
                      <span className="min-w-0 truncate">{r.desc}</span>
                      <span className="ml-auto font-mono tabular-nums">{fmt(r.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : live ? (
          <div className="b2-callout" data-tone="watch" data-testid="picker-live">
            <AlertTriangle size={15} aria-hidden="true" />
            <p className="min-w-0">
              {live.failure.reason}
              {live.failure.ask && <span className="font-semibold"> {live.failure.ask}</span>}
            </p>
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!ok}
          title={ok ? undefined : failureText(live?.failure)}
          onClick={() => {
            if (ok) onApply?.(choice)
          }}
        >
          Use these columns
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onCancel?.()}>
          Cancel
        </button>
        {remembers && (
          <p className="text-[12.5px] text-ink2 sm:ml-auto">
            KYRO will remember this for files laid out the same way.
          </p>
        )}
      </div>
    </motion.section>
  )
}
