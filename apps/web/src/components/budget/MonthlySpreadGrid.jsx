// Monthly Spread grid — the saved budget rendered as accounts × (12 months +
// annual), grouped by section (revenue / expense) then by rollup line, with a
// subtotal row per group, a section total, and a Surplus/(Deficit) footer that
// nets revenue against expense per month and for the year.
//
// Read-only for v1: it renders lines.spread verbatim (sign preserved — the
// allowance acct 409 shows negative). Every GL line is shown, including unmapped
// and ancillary accounts (flagged), so nothing is silently dropped. All grouping
// and subtotals are derived AT RENDER from the spread prop (no effects, no
// in-render component definitions — React-Compiler safe).
import { useState, useRef, useLayoutEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Table2, AlertTriangle, Maximize2, UploadCloud, Trash2, Sparkles, FileSpreadsheet, PencilRuler } from 'lucide-react'
import { fmt } from '../../lib/format.js'
import { describeBudgetSource } from './budgetSource.js'
import ReportExpandOverlay from '../reports/ReportExpandOverlay.jsx'
import { Section, Pill, Button } from '../ui/surface/index.js'

// Premium UI P3: the sheet wears the `.dt` table discipline (sticky 11px-caps
// head, 36px hairline rows, `.dt-num` right-aligned tabular money) under a
// Section rule — no card, no navy section bands, no gold total row. Section
// and subtotal rows are ink weight on a hairline; the Surplus line is the
// `.dt-foot` 2px rule.

// Source badge for the spread header. Prefers an explicit `source` prop from the
// parent (which knows the full budget — including driver-built spreads that have
// no fileName); falls back to inferring from the spread itself so the grid stays
// standalone-safe. Pure render helper (no component def in render).
const SOURCE_ICONS = { driver: Sparkles, import: FileSpreadsheet, manual: PencilRuler }
function renderSourceBadge(source) {
  if (!source || source.kind === 'none') return null
  const Icon = SOURCE_ICONS[source.kind] || FileSpreadsheet
  return (
    <Pill>
      <Icon size={11} aria-hidden="true" />
      {source.label}
      {source.fileName ? ` · ${source.fileName}` : ''}
    </Pill>
  )
}

// Fit-to-width: render the (wide) table at natural size and scale it DOWN so the
// ENTIRE sheet — all 12 months + Annual — is visible with no horizontal scroll
// (mirrors the statements page). Module-scope component (React-Compiler safe);
// re-measures on container/content resize. The Expand button zooms back in.
function FitWidth({ children }) {
  const outer = useRef(null)
  const inner = useRef(null)
  const [scale, setScale] = useState(1)
  const [height, setHeight] = useState(undefined)

  useLayoutEffect(() => {
    const measure = () => {
      const o = outer.current
      const i = inner.current
      if (!o || !i) return
      const cw = o.clientWidth
      const nw = i.scrollWidth || i.offsetWidth || 1
      const s = nw > cw ? cw / nw : 1
      setScale(s)
      setHeight(i.offsetHeight * s)
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (outer.current) ro.observe(outer.current)
    if (inner.current) ro.observe(inner.current)
    return () => ro.disconnect()
  }, [children])

  return (
    <div ref={outer} className="overflow-hidden" style={{ height }}>
      <div
        ref={inner}
        className="inline-block origin-top-left will-change-transform"
        style={{ width: 'max-content', transform: `scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  )
}

// Title-case a rollupLine/category key for a group heading (e.g. 'instructional'
// -> 'Instructional', 'studActExp' -> 'Stud Act Exp'). Pure display helper.
function titleizeKey(key) {
  if (!key) return 'Other'
  const spaced = String(key)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

// Money cell — em-dash for blank/zero, accounting parens for negatives (fmt).
function moneyCell(n, opts = {}) {
  const v = n == null ? null : Number(n)
  const isNeg = v != null && v < 0
  return (
    <td className={`dt-num whitespace-nowrap ${opts.bold ? 'font-semibold text-ink' : 'text-ink'} ${isNeg ? 'tone-risk' : ''}`}>
      {fmt(v)}
    </td>
  )
}

// Group the spread accounts into revenue/expense sections, each broken into
// rollup-line groups with per-group + per-section subtotals, plus the unmapped
// /ancillary buckets (kept visible, excluded from section totals + surplus).
function buildModel(spread) {
  const monthKeys = spread.monthKeys || []
  const cols = monthKeys.length
  const zeros = () => Array.from({ length: cols }, () => 0)

  const sections = {
    revenue: { label: 'Operating Revenue', groups: new Map(), total: zeros(), annual: 0 },
    expense: { label: 'Operating Expenditures', groups: new Map(), total: zeros(), annual: 0 },
  }
  const excluded = { label: 'Unmapped & Ancillary', accounts: [], total: zeros(), annual: 0 }

  for (const a of spread.accounts || []) {
    const months = Array.isArray(a.months) ? a.months : []
    const annual =
      a.annual != null
        ? Number(a.annual)
        : months.reduce((s, m) => s + (Number(m) || 0), 0)
    const row = { ...a, months, annual }
    const includable =
      (a.section === 'revenue' || a.section === 'expense') &&
      a.category !== 'unmapped' &&
      a.includedInTotals !== false

    if (!includable) {
      excluded.accounts.push(row)
      for (let i = 0; i < cols; i++) excluded.total[i] += Number(months[i]) || 0
      excluded.annual += annual
      continue
    }

    const sec = sections[a.section]
    const key = a.rollupLine || a.category || 'other'
    if (!sec.groups.has(key)) sec.groups.set(key, { key, accounts: [], total: zeros(), annual: 0 })
    const g = sec.groups.get(key)
    g.accounts.push(row)
    for (let i = 0; i < cols; i++) {
      const v = Number(months[i]) || 0
      g.total[i] += v
      sec.total[i] += v
    }
    g.annual += annual
    sec.annual += annual
  }

  // Surplus/(Deficit) = revenue − expense, per month + annual.
  const surplus = zeros()
  for (let i = 0; i < cols; i++) surplus[i] = sections.revenue.total[i] - sections.expense.total[i]
  const surplusAnnual = sections.revenue.annual - sections.expense.annual

  return { cols, sections, excluded, surplus, surplusAnnual }
}

// ── Render helpers (NOT components — called as {renderX()} with keys) ─────────

function renderAccountRow(a, cols, idx = 0) {
  const flagged = a.category === 'unmapped'
  // Label-only imports carry acct=0 (the label is the identity); show a dash
  // rather than a meaningless "0" in the account column. idx keeps the key unique
  // when two label-only rows share the same name.
  return (
    <tr key={`acct-${a.acct}-${idx}-${a.label}`}>
      <td className="sticky left-0 z-10 whitespace-nowrap bg-ground text-[12px] font-semibold tabular-nums text-ink2">
        {a.acct ? a.acct : '—'}
      </td>
      <td className="sticky left-[64px] z-10 max-w-[260px] truncate bg-ground text-ink">
        {a.label}
        {flagged && (
          <Pill variant="status" tone="watch" className="ml-1.5">
            unmapped
          </Pill>
        )}
      </td>
      {Array.from({ length: cols }, (_, i) => moneyCell(a.months[i]))}
      {moneyCell(a.annual, { bold: true })}
    </tr>
  )
}

function renderSubtotalRow(label, total, annual, cols, opts = {}) {
  return (
    <tr key={`sub-${label}`} className={opts.section ? 'dt-section-total' : 'dt-subtotal'}>
      <td className="sticky left-0 z-10 bg-ground" />
      <td className={`sticky left-[64px] z-10 bg-ground text-[11px] font-semibold uppercase tracking-[0.06em] ${opts.section ? 'text-ink' : 'text-ink2'}`}>
        {label}
      </td>
      {Array.from({ length: cols }, (_, i) => moneyCell(total[i], { bold: true }))}
      {moneyCell(annual, { bold: true })}
    </tr>
  )
}

export default function MonthlySpreadGrid({ spread, source, onReimport, onClear }) {
  const reduce = useReducedMotion()
  const [expanded, setExpanded] = useState(false)
  const [clearConfirm, setClearConfirm] = useState(false)

  if (!spread || !Array.isArray(spread.accounts) || spread.accounts.length === 0) {
    return null
  }

  // Source badge: prefer the parent-supplied source (knows driver origin); else
  // infer from the spread object alone so this grid is standalone-safe.
  const badgeSource = source ?? describeBudgetSource({ lines: { spread } })

  const monthLabels =
    spread.monthLabels && spread.monthLabels.length
      ? spread.monthLabels
      : spread.monthKeys || []
  const model = buildModel(spread)
  const { cols, sections, excluded, surplus, surplusAnnual } = model

  const renderSection = (sec) => {
    if (sec.groups.size === 0) return null
    const groups = Array.from(sec.groups.values()).sort((a, b) => b.annual - a.annual)
    return (
      <tbody key={`section-${sec.label}`}>
        <tr className="dt-section">
          <td colSpan={cols + 3} className="sticky left-0 z-10 bg-ground text-[11px] font-semibold uppercase tracking-[0.08em] text-ink">
            {sec.label}
          </td>
        </tr>
        {groups.map((g) => (
          <SpreadGroupFragment key={g.key} group={g} cols={cols} />
        ))}
        {renderSubtotalRow(`Total ${sec.label}`, sec.total, sec.annual, cols, { section: true })}
      </tbody>
    )
  }

  // The full table (accounts × 12 months + annual). Rendered fresh in both the
  // inline card and the full-screen zoom overlay (returns a new tree each call).
  const renderTable = () => (
    <table className="dt w-max">
      <thead>
        <tr>
          <th className="sticky left-0 z-20">Acct</th>
          <th className="sticky left-[64px] z-20">Description</th>
          {monthLabels.map((m, i) => (
            <th key={`${m}-${i}`} className="dt-num whitespace-nowrap">
              {m}
            </th>
          ))}
          <th className="dt-num whitespace-nowrap text-ink">Annual</th>
        </tr>
      </thead>

      {renderSection(sections.revenue)}
      {renderSection(sections.expense)}

      {/* Surplus / (Deficit) footer — revenue net of expense. */}
      <tfoot>
        <tr className="dt-foot">
          <td className="sticky left-0 z-10 bg-ground" />
          <td className="sticky left-[64px] z-10 bg-ground text-[11px] font-semibold uppercase tracking-[0.08em] text-ink">
            Surplus / (Deficit)
          </td>
          {Array.from({ length: cols }, (_, i) => moneyCell(surplus[i], { bold: true }))}
          {moneyCell(surplusAnnual, { bold: true })}
        </tr>
      </tfoot>
    </table>
  )

  return (
    <>
      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Section
          label="Monthly spread"
          className="!mt-0"
          aside={
            <>
              {onReimport && (
                <Button variant="quiet" size="sm" onClick={onReimport} icon={<UploadCloud size={13} />}>
                  Replace
                </Button>
              )}
              {onClear &&
                (clearConfirm ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-small font-medium tone-risk">Clear this budget?</span>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setClearConfirm(false)
                        onClear()
                      }}
                    >
                      Yes, clear
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setClearConfirm(false)}>
                      Cancel
                    </Button>
                  </span>
                ) : (
                  <Button variant="quiet" size="sm" onClick={() => setClearConfirm(true)} icon={<Trash2 size={13} />}>
                    Clear
                  </Button>
                ))}
              <Button variant="secondary" size="sm" onClick={() => setExpanded(true)} icon={<Maximize2 size={13} />}>
                Expand
              </Button>
            </>
          }
        >
          <p className="mb-3 flex flex-wrap items-center gap-1.5 text-small text-ink2">
            <Table2 size={13} aria-hidden="true" />
            {spread.accounts.length} accounts ·{' '}
            {cols === 0 ? 'annual only' : `${cols} months · annual`}
            {renderSourceBadge(badgeSource)}
            {cols > 0 && (
              <span className="inline-flex items-center gap-1">
                <Maximize2 size={11} aria-hidden="true" /> full year shown — expand to zoom in
              </span>
            )}
          </p>

          <FitWidth>{renderTable()}</FitWidth>

          {excluded.accounts.length > 0 && (
            <p className="mt-3 flex items-center gap-1.5 border-l-2 border-watch pl-3 text-small font-semibold text-ink">
              <AlertTriangle size={13} className="tone-watch" aria-hidden="true" />
              {excluded.accounts.length} account
              {excluded.accounts.length === 1 ? '' : 's'} excluded from totals (unmapped or
              ancillary) — shown for reference, not rolled into the surplus.
            </p>
          )}
        </Section>
      </motion.div>

      {/* Full-screen zoom/pan view (reuses the statements-page lightbox). */}
      <ReportExpandOverlay
        open={expanded}
        title="Monthly Spread"
        onClose={() => setExpanded(false)}
      >
        <div className="panel inline-block p-2">{renderTable()}</div>
      </ReportExpandOverlay>
    </>
  )
}

// A rollup-line group: its account rows then a subtotal. Defined at module scope
// (NOT inside render) so the React Compiler treats it as a stable component; it
// is rendered with a stable key in the map above.
function SpreadGroupFragment({ group, cols }) {
  return (
    <>
      <tr className="dt-group">
        <td className="sticky left-0 z-10 bg-ground" />
        <td className="sticky left-[64px] z-10 bg-ground text-[11px] font-semibold uppercase tracking-[0.08em] text-ink2">
          {titleizeKey(group.key)}
        </td>
        <td colSpan={cols + 1} />
      </tr>
      {group.accounts.map((a, idx) => renderAccountRow(a, cols, idx))}
      {renderSubtotalRow(`Subtotal ${titleizeKey(group.key)}`, group.total, group.annual, cols)}
    </>
  )
}
