// ─────────────────────────────────────────────────────────────────────────────
// OnFilePanel — "Already on file", at the top of Finance → Add data.
//
// Owner, 2026-10-25: "I can't see the data that was already added. What
// happens when the user wants to delete data and add new data?" So the upload
// step opens on what the school already has, one row per fiscal year (newest
// first): the trial balance (or the half of one), monthly numbers as "8 of 12
// months", and the budget, each with Replace and Remove. Remove always asks
// first (RemoveDataDialog) and can be undone; "Recently removed" keeps the last
// 30 days, with Restore.
//
// Viewers see the same rows without any buttons. A failed load never blocks the
// drop zone below.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import Section from '../ui/surface/Section.jsx'
import Pill from '../ui/surface/Pill.jsx'
import Button from '../ui/surface/Button.jsx'
import RemoveDataDialog from './RemoveDataDialog.jsx'
import { financeFilesApi } from '../../lib/api.js'
import { halfLabel, monthShort, shortDate, yearHeading } from '../../lib/financeInventory.js'
import { recentlyRemovedRow, restoredToast } from '../../lib/removalCopy.js'
import { afterFinanceChange, restoreErrorText } from '../../lib/financeRemoval.js'
import { usePersistence } from '../../context/PersistenceContext.jsx'
import { useAuth } from '../../context/AuthContext.jsx'

const VISIBLE_YEARS = 3
const STATUS_MS = 3500

const HALF_PILL = {
  pl: 'Profit and Loss only',
  bs: 'Balance Sheet only',
  full: 'Profit and Loss + Balance Sheet',
}
const BUDGET_KIND = {
  spread: 'Month by month',
  driver: 'Built with the guided setup',
  lines: 'Annual, by category',
  totals: 'Totals only',
}
const ROLE_TITLE = {
  cy: 'Trial balance',
  py: 'Last year’s trial balance (for comparison)',
  audit: 'Audited figures',
}

function fileDetail(tb) {
  if (tb.source === 'quickbooks') return `From QuickBooks · synced ${shortDate(tb.uploadedAt)}`
  const by = tb.uploadedBy?.name ? ` by ${tb.uploadedBy.name}` : ''
  return `${tb.sourceName} · uploaded ${shortDate(tb.uploadedAt)}${by}`
}

export default function OnFilePanel({ schoolId, canEdit = false, onFile, onReplace, onManageMonths }) {
  const { data, loading, error, reload } = onFile || {}
  const persistence = usePersistence()
  const { user } = useAuth()
  const [expanded, setExpanded] = useState(false)
  const [removeTarget, setRemoveTarget] = useState(null)
  const [swap, setSwap] = useState(null) // { entry, current }
  const [restoringId, setRestoringId] = useState(null)
  const [status, setStatus] = useState(null) // { text, tone }
  const statusTimer = useRef(null)

  useEffect(() => () => window.clearTimeout(statusTimer.current), [])

  const flash = (text, tone = 'ok') => {
    window.clearTimeout(statusTimer.current)
    setStatus({ text, tone })
    statusTimer.current = window.setTimeout(() => setStatus(null), tone === 'ok' ? STATUS_MS : 6000)
  }

  const years = Array.isArray(data?.years) ? data.years : []
  const removed = canEdit && Array.isArray(data?.recentlyRemoved) ? data.recentlyRemoved : []
  const shown = expanded ? years : years.slice(0, VISIBLE_YEARS)
  const hiddenCount = years.length - VISIBLE_YEARS

  const restore = async (entry) => {
    if (entry.conflict) {
      setSwap({ entry, current: entry.conflict })
      return
    }
    setRestoringId(entry.id)
    try {
      await financeFilesApi.restore(schoolId, entry.id, {})
    } catch (e) {
      setRestoringId(null)
      if (e?.response?.status === 409 && e?.response?.data?.code === 'SLOT_FILLED') {
        setSwap({ entry, current: e.response.data.current || null })
        return
      }
      flash(restoreErrorText(e, entry), 'error')
      return
    }
    setRestoringId(null)
    flash(restoredToast(entry))
    await afterFinanceChange(persistence)
  }

  const aside = years.length ? (
    <Pill variant="count">{`${years.length} year${years.length === 1 ? '' : 's'}`}</Pill>
  ) : null

  return (
    <Section label="Already on file" aside={aside} className="!mt-0" data-testid="on-file-panel">
      {loading && !data ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading what's already on file">
          <div className="h-10 animate-pulse rounded-lg bg-ground" />
          <div className="h-10 animate-pulse rounded-lg bg-ground" />
        </div>
      ) : error && !data ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13.5px] text-ink2">We couldn’t load what’s already on file.</p>
          <Button size="sm" variant="secondary" onClick={() => reload?.()}>
            Try again
          </Button>
        </div>
      ) : years.length === 0 ? (
        <p className="text-[13.5px] text-ink2" data-testid="on-file-empty">
          Nothing on file yet. Files you add show up here, one row per year.
        </p>
      ) : (
        <div className="space-y-3">
          {shown.map((y) => (
            <YearBlock
              key={y.periodId}
              year={y}
              canEdit={canEdit}
              onReplace={onReplace}
              onManageMonths={onManageMonths}
              onRemove={setRemoveTarget}
            />
          ))}
          {hiddenCount > 0 && (
            <button type="button" className="dt-link text-[13px]" onClick={() => setExpanded((v) => !v)}>
              {expanded ? 'Show fewer' : `Show ${hiddenCount} more year${hiddenCount === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      )}

      {removed.length > 0 && (
        <details className="mt-4 border-t border-hair pt-3" data-testid="recently-removed">
          <summary className="cursor-pointer text-[13px] font-semibold text-ink">
            Recently removed ({removed.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {removed.map((e) => (
              <li
                key={e.id}
                className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                data-testid="removed-row"
              >
                <span className="min-w-0 text-[13px] text-ink2">{recentlyRemovedRow(e, user?.id ?? null)}</span>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={restoringId != null}
                    onClick={() => void restore(e)}
                    icon={restoringId === e.id ? <Loader2 size={13} className="animate-spin" /> : null}
                  >
                    Restore
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-ink2">Kept for 30 days, then erased for good.</p>
        </details>
      )}

      {status && (
        <p
          role="status"
          className={`mt-3 text-[13px] font-medium ${status.tone === 'error' ? 'text-ink' : 'text-[rgb(var(--c-module))]'}`}
        >
          {status.text}
        </p>
      )}

      {removeTarget && (
        <RemoveDataDialog open schoolId={schoolId} target={removeTarget} onClose={() => setRemoveTarget(null)} />
      )}
      {swap && (
        <RemoveDataDialog
          open
          mode="swap"
          schoolId={schoolId}
          entry={swap.entry}
          current={swap.current}
          onRemoved={() => flash(restoredToast(swap.entry))}
          onClose={() => setSwap(null)}
        />
      )}
    </Section>
  )
}

function ItemRow({ title, pill, detail, note, actions, testId }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between" data-testid={testId}>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-medium text-ink">
          {title}
          {pill ? <Pill>{pill}</Pill> : null}
        </p>
        {detail ? <p className="break-words text-[12.5px] text-ink2">{detail}</p> : null}
        {note ? <p className="mt-0.5 text-[12.5px] font-medium text-[rgb(var(--c-watch))]">{note}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}

function YearBlock({ year, canEdit, onReplace, onManageMonths, onRemove }) {
  const S = year.shortLabel
  const tbs = Array.isArray(year.trialBalances) ? year.trialBalances : []
  const hasCy = tbs.some((t) => t.role === 'cy')
  const missing = [
    !hasCy && 'trial balance',
    !year.monthly && 'monthly numbers',
    !year.budget && 'budget',
  ].filter(Boolean)

  return (
    <div className="space-y-2.5 border-t border-hair pt-3" data-testid="on-file-year" data-period={year.periodId}>
      <h3 className="text-[14px] font-semibold text-ink">{yearHeading(year)}</h3>

      {tbs.map((tb) => {
        const word = tb.role === 'cy' ? halfLabel(tb.half === 'full' ? null : tb.half) || 'trial balance' : null
        const what =
          tb.role === 'cy' ? `the ${S} ${word}` : tb.role === 'py' ? `last year’s trial balance saved with ${S}` : `the audited figures saved with ${S}`
        return (
          <ItemRow
            key={tb.role}
            testId={`on-file-tb-${tb.role}`}
            title={ROLE_TITLE[tb.role] || 'Trial balance'}
            pill={tb.role === 'cy' ? HALF_PILL[tb.half] : null}
            detail={fileDetail(tb)}
            note={
              tb.hiddenHalf
                ? `An earlier ${halfLabel(tb.hiddenHalf.half)} (${shortDate(tb.hiddenHalf.uploadedAt)}) was replaced by this file and isn’t used.`
                : null
            }
            actions={
              canEdit ? (
                <>
                  {tb.role === 'cy' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-label={`Replace ${what}`}
                      onClick={() => onReplace?.({ kind: 'trial_balance', periodId: year.periodId, shortLabel: S })}
                    >
                      Replace
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="quiet"
                    aria-label={`Remove ${what}`}
                    onClick={() => onRemove({ kind: 'trial_balance', importId: tb.importId })}
                  >
                    Remove
                  </Button>
                </>
              ) : null
            }
          />
        )
      })}

      {year.monthly && (
        <ItemRow
          testId="on-file-monthly"
          title="Monthly numbers"
          detail={monthlyDetail(year.monthly)}
          actions={
            canEdit ? (
              <>
                <Button
                  size="sm"
                  variant="quiet"
                  aria-label={`Manage ${S} months`}
                  onClick={() => onManageMonths?.(year.periodId)}
                >
                  Manage months
                </Button>
                <Button
                  size="sm"
                  variant="quiet"
                  aria-label={`Remove all ${S} monthly numbers`}
                  onClick={() =>
                    onRemove({
                      kind: 'monthly',
                      periodId: year.periodId,
                      monthKeys: (year.monthly.months || []).map((m) => m.monthKey),
                    })
                  }
                >
                  Remove all
                </Button>
              </>
            ) : null
          }
        />
      )}

      {year.budget && (
        <ItemRow
          testId="on-file-budget"
          title="Budget"
          detail={`${BUDGET_KIND[year.budget.kind] || 'Budget'} · saved ${shortDate(year.budget.updatedAt)}${
            year.budget.updatedBy?.name ? ` by ${year.budget.updatedBy.name}` : ''
          }`}
          actions={
            canEdit ? (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label={`Replace the ${S} budget`}
                  onClick={() => onReplace?.({ kind: 'budget', periodId: year.periodId, shortLabel: S })}
                >
                  Replace
                </Button>
                <Button
                  size="sm"
                  variant="quiet"
                  aria-label={`Remove the ${S} budget`}
                  onClick={() => onRemove({ kind: 'budget', periodId: year.periodId })}
                >
                  Remove
                </Button>
              </>
            ) : null
          }
        />
      )}

      {missing.length > 0 && (
        <p className="text-[12.5px] text-ink2" data-testid="on-file-missing">
          Not added: {missing.join(', ')}
        </p>
      )}
    </div>
  )
}

function monthlyDetail(monthly) {
  const months = (monthly.months || []).map((m) => m.monthKey).sort()
  const total = monthly.total || 12
  const count = monthly.count ?? months.length
  if (!months.length) return `${count} of ${total} months`
  const first = monthShort(months[0])
  const last = monthShort(months[months.length - 1])
  return `${count} of ${total} months · ${first === last ? first : `${first} – ${last}`}`
}
