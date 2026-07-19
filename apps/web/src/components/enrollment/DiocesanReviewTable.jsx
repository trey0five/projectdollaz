// ─────────────────────────────────────────────────────────────────────────────
// DiocesanReviewTable — the match-review step for a diocesan enrollment import.
// Each file row is name-matched by the server; this table lets the reviewer:
//   • see the confidence tier (green high/alias · amber review · red unmatched)
//   • override the school with an inline picker (seeded from the row's own
//     candidates first, then every school in the org)
//   • skip a row, and toggle "remember this name → learn alias" (default-on for
//     review-tier confirms)
//   • preview the row's grade + demographic breakdown (expandable)
//   • see a "will supersede manual (was N)" reconciliation hint (Decision C)
// A school already claimed by ANOTHER row is disabled in this row's picker
// (alreadyMatchedRowId guard) so two file rows can never route to one school.
// The table scrolls inside its OWN overflow-x container. Navy/gold theme.
// ─────────────────────────────────────────────────────────────────────────────
import { Fragment, useState } from 'react'
import { ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, HelpCircle, XCircle } from 'lucide-react'
import { Select } from '../ui/EntityFormModal.jsx'
import { RACE_LABELS, GENDER_LABELS, ETHNICITY_LABELS } from '../../lib/demographicVocab.js'

const pctOf = (c) => `${Math.round((Number(c) || 0) * 100)}%`

// Confidence chip — tier drives the hue; the % is the row's match confidence.
function ConfidenceChip({ tier, confidence }) {
  const map = {
    exact: { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2, label: 'Exact' },
    alias: { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2, label: 'Learned' },
    high: { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2, label: 'High' },
    review: { cls: 'border-gold/50 bg-gold/10 text-amber-700', Icon: HelpCircle, label: 'Review' },
    none: { cls: 'border-danger/30 bg-danger/[0.06] text-danger', Icon: XCircle, label: 'Unmatched' },
  }
  const s = map[tier] || map.none
  const { Icon } = s
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[12.5px] font-bold ${s.cls}`}>
      <Icon size={13} />
      {s.label}
      {Number.isFinite(confidence) && tier !== 'exact' && tier !== 'alias' ? (
        <span className="tabular-nums opacity-70">{pctOf(confidence)}</span>
      ) : null}
    </span>
  )
}

// Inline expanded detail — grade + status + demographic counts (aggregate only).
function RowDetail({ row }) {
  const grades = Object.entries(row.byGrade || {}).filter(([, v]) => Number(v) > 0)
  const status = Object.entries(row.byStatus || {}).filter(([, v]) => Number(v) > 0)
  const dem = row.byDemographics || {}
  const demGroup = (label, obj, labels) => {
    const entries = Object.entries(obj || {}).filter(([, v]) => Number(v) > 0)
    if (!entries.length) return null
    return (
      <div>
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{label}</span>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {entries.map(([k, v]) => (
            <span key={k} className="rounded-md bg-white px-2 py-0.5 text-[12.5px] text-navy shadow-sm">
              {(labels[k] ?? k)}: <b className="tabular-nums">{Number(v).toLocaleString('en-US')}</b>
            </span>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-3 rounded-xl bg-section/70 p-4">
      {status.length > 0 && (
        <div>
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">New / returning</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {status.map(([k, v]) => (
              <span key={k} className="rounded-md bg-white px-2 py-0.5 text-[12.5px] capitalize text-navy shadow-sm">
                {k}: <b className="tabular-nums">{Number(v).toLocaleString('en-US')}</b>
              </span>
            ))}
          </div>
        </div>
      )}
      {grades.length > 0 && (
        <div>
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">By grade</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {grades.map(([g, v]) => (
              <span key={g} className="rounded-md bg-white px-2 py-0.5 text-[12.5px] text-navy shadow-sm">
                {g}: <b className="tabular-nums">{Number(v).toLocaleString('en-US')}</b>
              </span>
            ))}
          </div>
        </div>
      )}
      {demGroup('Gender', dem.gender, GENDER_LABELS)}
      {demGroup('Ethnicity', dem.ethnicity, ETHNICITY_LABELS)}
      {demGroup('Race', dem.race, RACE_LABELS)}
      {Array.isArray(row.warnings) && row.warnings.length > 0 && (
        <ul className="space-y-1">
          {row.warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[12.5px] text-amber-700">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function DiocesanReviewTable({ rows = [], schoolOptions = [], decisions, onRowChange, applied = false }) {
  const [expanded, setExpanded] = useState({})
  const toggle = (id) => setExpanded((e) => ({ ...e, [id]: !e[id] }))

  // Schools claimed by a matched row → disabled in every OTHER row's picker.
  const takenBy = {}
  for (const r of rows) {
    const d = decisions[r.rowId]
    if (d && d.action === 'match' && d.schoolId) takenBy[d.schoolId] = r.rowId
  }

  const optionName = (schoolId) => schoolOptions.find((o) => o.schoolId === schoolId)?.name

  return (
    <div className="overflow-hidden rounded-2xl border-2 border-rule/50 bg-white shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-left">
          <thead>
            <tr className="border-b-2 border-rule/60 bg-section/60 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
              <th className="w-8 px-2 py-3" />
              <th className="px-3 py-3">From file</th>
              <th className="px-3 py-3">Confidence</th>
              <th className="px-3 py-3">Assign to school</th>
              <th className="px-3 py-3 text-right">Students</th>
              <th className="px-3 py-3">Reconcile</th>
              <th className="px-3 py-3 text-center">Skip</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const d = decisions[row.rowId] || {}
              const isSkip = d.action === 'skip'
              const isOpen = !!expanded[row.rowId]
              // Candidate schoolIds first (in ranked order), then the rest of the org.
              const candIds = (row.candidates || []).map((c) => c.schoolId)
              const restOptions = schoolOptions.filter((o) => !candIds.includes(o.schoolId))
              const claimedElsewhere = (sid) => takenBy[sid] && takenBy[sid] !== row.rowId
              const chosenSchool = d.schoolId
              const chosenOpt = schoolOptions.find((o) => o.schoolId === chosenSchool)
              const showManualHint =
                d.action === 'match' && chosenSchool
                  ? (chosenSchool === row.match?.schoolId && row.supersedes?.hasManual) || chosenOpt?.hasManualEntry
                  : false
              const manualTotal = chosenSchool === row.match?.schoolId ? row.supersedes?.manualTotal : undefined

              return (
                <Fragment key={row.rowId}>
                  <tr className={`border-b border-rule/40 align-top ${isSkip ? 'opacity-55' : ''}`}>
                    <td className="px-2 py-3">
                      <button
                        type="button"
                        onClick={() => toggle(row.rowId)}
                        aria-label={isOpen ? 'Hide detail' : 'Show detail'}
                        className="rounded-md p-1 text-muted transition-colors hover:bg-section hover:text-navy"
                      >
                        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-semibold text-navy">{row.sourceName}</div>
                      <div className="text-[12px] text-muted">{row.normalizedName}</div>
                      {Array.isArray(row.warnings) && row.warnings.length > 0 && (
                        <span className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-semibold text-amber-700">
                          <AlertTriangle size={11} /> {row.warnings.length} note{row.warnings.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <ConfidenceChip tier={row.tier} confidence={row.match?.confidence} />
                    </td>
                    <td className="px-3 py-3">
                      {applied ? (
                        <span className="font-semibold text-navy">{optionName(chosenSchool) ?? '—'}</span>
                      ) : (
                        <Select
                          value={isSkip ? '' : chosenSchool || ''}
                          disabled={isSkip}
                          onChange={(e) =>
                            onRowChange(row.rowId, {
                              action: e.target.value ? 'match' : 'unmatch',
                              schoolId: e.target.value || null,
                            })
                          }
                        >
                          <option value="">— choose a school —</option>
                          {candIds.length > 0 && (
                            <optgroup label="Suggested">
                              {row.candidates.map((c) => (
                                <option key={c.schoolId} value={c.schoolId} disabled={claimedElsewhere(c.schoolId)}>
                                  {c.name} · {pctOf(c.confidence)}
                                  {claimedElsewhere(c.schoolId) ? ' (taken)' : ''}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          <optgroup label="All schools">
                            {restOptions.map((o) => (
                              <option key={o.schoolId} value={o.schoolId} disabled={claimedElsewhere(o.schoolId)}>
                                {o.name}
                                {o.hasManualEntry ? ' · has manual' : ''}
                                {claimedElsewhere(o.schoolId) ? ' (taken)' : ''}
                              </option>
                            ))}
                          </optgroup>
                        </Select>
                      )}
                      {!applied && !isSkip && (row.tier === 'review' || row.tier === 'none') && chosenSchool && (
                        <label className="mt-2 flex items-center gap-2 text-[12.5px] text-muted">
                          <input
                            type="checkbox"
                            checked={d.learnAlias ?? true}
                            onChange={(e) => onRowChange(row.rowId, { learnAlias: e.target.checked })}
                            className="h-3.5 w-3.5 rounded border-rule text-gold focus:ring-gold/40"
                          />
                          Remember &ldquo;{row.sourceName}&rdquo; for next time
                        </label>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="font-semibold tabular-nums text-navy">
                        {Number(row.total ?? 0).toLocaleString('en-US')}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {showManualHint ? (
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-gold/40 bg-gold/10 px-2 py-1 text-[12px] font-semibold text-amber-700">
                          <AlertTriangle size={12} /> Supersedes manual
                          {Number.isFinite(manualTotal) ? ` (was ${manualTotal})` : ''}
                        </span>
                      ) : (
                        <span className="text-[13px] text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {applied ? (
                        <span className="text-[13px] text-muted">{isSkip ? 'Skipped' : '—'}</span>
                      ) : (
                        <input
                          type="checkbox"
                          checked={isSkip}
                          onChange={(e) =>
                            onRowChange(
                              row.rowId,
                              e.target.checked
                                ? { action: 'skip' }
                                : { action: chosenSchool ? 'match' : 'unmatch' },
                            )
                          }
                          className="h-4 w-4 rounded border-rule text-gold focus:ring-gold/40"
                          aria-label="Skip this row"
                        />
                      )}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-rule/40">
                      <td />
                      <td colSpan={6} className="px-3 pb-4">
                        <RowDetail row={row} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
