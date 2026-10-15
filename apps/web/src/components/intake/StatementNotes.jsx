// ─────────────────────────────────────────────────────────────────────────────
// StatementNotes — the lines under a file card's chips (#40 / #41 / #32).
//
//   • half a trial balance: "Income statement only — add a Balance Sheet…"
//   • a workbook with more statements than one picture: which KYRO used + "Open Add years"
//   • a merged P&L + Balance Sheet: "combined", and the balancing line's amount
//   • why two halves were kept apart, with "Combine anyway"
//   • "Read with your columns · Change" / "Wrong numbers? Change columns"
//   • the accounts KYRO numbered itself (re-keyable), and the parser's notes
//
// Every line comes from lib/statementNotes.js (pure), so what is said is
// tested; this file only lays it out. Actions are optional props: the read-only
// report mount renders the lines with no buttons.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronDown, Hash, Info, Pencil } from 'lucide-react'
import {
  statementLines,
  numberedAccounts,
  numberedSummary,
  notesSummary,
  visibleWarnings,
  OPEN_ADD_YEARS_EVENT,
} from '../../lib/statementNotes.js'

const LINK = 'font-semibold text-ink underline decoration-hair underline-offset-2 hover:decoration-ink'

function Disclosure({ id, label, icon, open, onToggle, cta, children }) {
  const Icon = icon
  const reduce = useReducedMotion()
  return (
    <div className="text-[12.5px] text-ink2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={id}
        className="inline-flex items-start gap-1.5 text-left hover:text-ink"
      >
        <Icon size={13} className="mt-[2px] shrink-0" aria-hidden="true" />
        <span>
          {label}
          {cta ? <span className={`ml-1 ${LINK}`}>{cta}</span> : null}
        </span>
        <ChevronDown
          size={13}
          className={`mt-[2px] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-1.5 border-l-2 border-hair pl-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function NumberRow({ entry, editable, onSave }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState(null)
  const sectionLabel = entry.section === 'revenue' ? 'Income' : 'Expense'
  const tag = entry.source === 'user' ? 'your number' : entry.source === 'remembered' ? 'same as last time' : null

  const save = () => {
    const msg = onSave(entry.acct, value.trim())
    if (msg) setError(msg)
    else {
      setError(null)
      setEditing(false)
    }
  }

  return (
    <li className="py-1" data-testid="numbered-row">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 truncate font-medium text-ink">{entry.name}</span>
        <span className="text-ink2">· {sectionLabel} ·</span>
        <span className="font-mono tabular-nums text-ink">{entry.acct}</span>
        {tag && <span className="text-[11.5px] italic text-ink2">{tag}</span>}
        {editable && !editing && (
          <button
            type="button"
            aria-label={`Change the number for ${entry.name}`}
            onClick={() => {
              setValue(String(entry.acct))
              setError(null)
              setEditing(true)
            }}
            className="rounded p-0.5 text-ink2 hover:bg-ground hover:text-ink"
          >
            <Pencil size={12} aria-hidden="true" />
          </button>
        )}
      </div>
      {editing && (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input
            type="text"
            inputMode="numeric"
            aria-label={`New number for ${entry.name}`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') setEditing(false)
            }}
            className="w-28 rounded-md border border-hair bg-white px-2 py-1 font-mono text-[13px] text-ink outline-none ring-[#2563EB]/40 focus-visible:ring-2"
          />
          <button type="button" className="btn btn-primary btn-sm" onClick={save}>
            Save number
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setEditing(false)
              setError(null)
            }}
          >
            Cancel
          </button>
          {error && (
            <p role="alert" className="basis-full text-[12.5px] font-medium text-[rgb(var(--c-watch))]">
              {error}
            </p>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * Props: file (FileEntry), canEdit, and optional actions —
 * onCombine(partnerId), onChangeColumns(), onRenumber(fromAcct, to) → string|null,
 * onAddHalf(role, fileList) — the other statement half, into THIS file's slot.
 */
export default function StatementNotes({ file, canEdit = false, onCombine, onChangeColumns, onRenumber, onAddHalf }) {
  const halfInputRef = useRef(null)
  const halfRoleRef = useRef(null)
  const [openNumbers, setOpenNumbers] = useState(false)
  const [openNotes, setOpenNotes] = useState(false)
  const lines = statementLines(file)
  const numbered = numberedAccounts(file)
  const numberedText = numberedSummary(file)
  const notesText = notesSummary(file)
  if (lines.length === 0 && !numberedText && !notesText) return null

  const editable = !!(canEdit && !file.fromHistory && onRenumber)
  const warnings = visibleWarnings(file)

  const runAction = (a) => {
    if (!a) return
    if (a.kind === 'combine') onCombine?.(a.partnerId)
    if (a.kind === 'columns') onChangeColumns?.()
    // The trial-balance step (TrialBalanceModalBody) owns its tabs; ask it.
    if (a.kind === 'addYears') window.dispatchEvent(new CustomEvent(OPEN_ADD_YEARS_EVENT))
    if (a.kind === 'addHalf') {
      halfRoleRef.current = a.role ?? file.role ?? null
      halfInputRef.current?.click()
    }
  }
  const actionable = (a) =>
    !!a &&
    canEdit &&
    ((a.kind === 'combine' && onCombine) ||
      (a.kind === 'columns' && onChangeColumns) ||
      a.kind === 'addYears' ||
      (a.kind === 'addHalf' && onAddHalf))

  return (
    <div className="flex flex-col gap-1.5" data-testid="statement-notes">
      {onAddHalf && canEdit ? (
        <input
          ref={halfInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          data-testid="add-half-input"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => {
            const role = halfRoleRef.current ?? file.role ?? null
            if (role && e.target.files?.length) onAddHalf(role, e.target.files)
            halfRoleRef.current = null
            e.target.value = ''
          }}
        />
      ) : null}
      {lines.map((l) => (
        <p
          key={l.key}
          className={`text-[12.5px] leading-snug ${
            l.tone === 'watch' ? 'font-medium text-ink' : l.tone === 'faint' ? 'text-ink2' : 'text-ink2'
          }`}
        >
          {l.tone === 'watch' && (
            <span
              aria-hidden="true"
              className="mr-1.5 inline-block h-1.5 w-1.5 translate-y-[-1px] rounded-full bg-[rgb(var(--c-watch))]"
            />
          )}
          {l.text}
          {actionable(l.action) && (
            <>
              {' '}
              {l.key === 'layout' && l.text !== 'Wrong numbers?' ? '· ' : ''}
              <button type="button" className={LINK} onClick={() => runAction(l.action)}>
                {l.action.label}
              </button>
            </>
          )}
        </p>
      ))}

      {numberedText && (
        <Disclosure
          id={`${file.id}-numbers`}
          label={numberedText}
          cta="See numbers"
          icon={Hash}
          open={openNumbers}
          onToggle={() => setOpenNumbers((v) => !v)}
        >
          <ul className="divide-y divide-hair">
            {numbered.map((s, i) => (
              <NumberRow
                key={`${s.section}-${s.acct}-${i}`}
                entry={s}
                editable={editable}
                onSave={(from, to) => onRenumber(file.id, from, to)}
              />
            ))}
          </ul>
        </Disclosure>
      )}

      {notesText && (
        <Disclosure
          id={`${file.id}-notes`}
          label={notesText}
          icon={Info}
          open={openNotes}
          onToggle={() => setOpenNotes((v) => !v)}
        >
          <ul className="list-disc space-y-1 pl-4 text-ink">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Disclosure>
      )}
    </div>
  )
}
