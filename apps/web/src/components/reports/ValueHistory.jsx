// ─────────────────────────────────────────────────────────────
// "How this line / metric changed" — the value-versioning audit trail.
//
// A read-only section, sibling to the transaction drill, shown in BOTH
// LineageDrawer (statement line) and MetricDrawer (metric). Lazy behind a gold
// button exactly like the drill (idle → loading skeleton → done/empty), so
// nothing fetches until the user asks. On `done` it renders:
//   • a header `first → latest` (gold figures) + the reused analytics DeltaChip
//     over `netChange`, colored by the metric's goodDirection (NOT hardcoded
//     green-up; a plain statement line passes 'neutral');
//   • a tiny gold-on-navy Sparkline over `result.sparkline`;
//   • a version list newest→oldest, each row = the value (tabular-nums) + a
//     signed Δ chip + "by {source label} · {actor} · {date}" with a per-trigger
//     icon; absent versions render muted italic; a single-version chain shows
//     the "first snapshot" empty state; a `collapsed` footnote hides unchanged
//     syncs.
//
// Screen-only (`no-print`), reduced-motion safe, overflow-safe on mobile. Owns
// its own useValueHistory hook + a render-phase reset guard keyed on `swapKey`
// (the same setState-in-effect-free pattern the drawers use for the drill), so
// swapping the selected line/metric never shows the previous one's history.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react'
import {
  History,
  Loader2,
  ArrowRight,
  RefreshCw,
  Clock,
  FileText,
  Shuffle,
  Trash2,
  RotateCcw,
} from 'lucide-react'
import { formatMetricValue } from '@finrep/analytics'
import { formatShortDate } from '../../lib/format.js'
import { useValueHistory } from '../../hooks/useValueHistory.js'
import DeltaChip from '../analytics/DeltaChip.jsx'
import Sparkline from './Sparkline.jsx'

// Per-trigger lucide icon. `scheduled_sync` earns its own Clock so a nightly run
// reads distinctly from a hand-clicked QuickBooks sync (RefreshCw) — the whole
// point of the stamped trigger. Anything unresolved falls back to a plain dot.
const TRIGGER_ICON = {
  quickbooks_sync: RefreshCw,
  scheduled_sync: Clock,
  upload: FileText,
  remap: Shuffle,
  data_removed: Trash2,
  data_restored: RotateCcw,
}

function TriggerIcon({ trigger }) {
  const Icon = TRIGGER_ICON[trigger]
  if (!Icon) {
    return <span className="mt-1.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-ink2/50" aria-hidden />
  }
  return <Icon size={13} className="mt-0.5 shrink-0 text-ink2" aria-hidden />
}

/** "by {label} · {actor} · {date}" — em-dash for a missing actor. */
function attributionLine(source, at) {
  const label = source?.label || 'Earlier version'
  const actor = source?.actorName || '—'
  return `${label} · ${actor} · ${formatShortDate((at || '').slice(0, 10))}`
}

export default function ValueHistory({
  schoolId,
  periodId,
  enabled,
  selection, // the API selection body: { metricKey } | { statement, variant, lineKey }
  swapKey, // stable per selected line/metric; a change resets the section
  noun = 'line', // "line" | "metric" — the button/label wording
  goodDirection = 'neutral', // metric goodDirection; 'neutral' for plain lines
}) {
  const { status, result, run, reset } = useValueHistory(schoolId, periodId)

  // Reset whenever the selection swaps — render-phase guard (not an effect), the
  // same pattern the drawers use for the drill. Keeps it setState-in-effect-free.
  const [prevSwapKey, setPrevSwapKey] = useState(swapKey)
  if (swapKey !== prevSwapKey) {
    setPrevSwapKey(swapKey)
    reset()
  }

  if (!enabled) return null

  const unit = result?.unit ?? 'currency'
  const fmtVal = (v) => (v == null ? '—' : formatMetricValue(v, unit))

  return (
    <div className="no-print">
      <div className="sec-head">
        <h3 className="sec-label">History — how it changed</h3>
        <span className="sec-rule" aria-hidden="true" />
      </div>

      {status === 'idle' && (
        <button type="button" onClick={() => run(selection)} className="btn btn-secondary w-full">
          <History size={14} aria-hidden="true" />
          How this {noun} changed
        </button>
      )}

      {status === 'loading' && (
        <div aria-busy="true">
          <p className="mb-3 flex items-center gap-2 text-small font-semibold text-ink">
            <Loader2 size={14} aria-hidden="true" className="animate-spin text-ink2" />
            Tracing how this number moved…
          </p>
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-8 animate-pulse rounded-[4px] bg-ground" />
            ))}
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="b2-callout b2-watch flex-col !gap-1" role="alert">
          <p className="font-semibold">Couldn&apos;t load the history.</p>
          <button type="button" onClick={() => run(selection)} className="dt-link">
            Try again
          </button>
        </div>
      )}

      {status === 'done' && result && (
        <HistoryBody
          result={result}
          noun={noun}
          unit={unit}
          goodDirection={goodDirection}
          fmtVal={fmtVal}
        />
      )}
    </div>
  )
}

function HistoryBody({ result, noun, unit, goodDirection, fmtVal }) {
  const versions = Array.isArray(result.versions) ? result.versions : []
  // ≤1 kept version → this period has only its first snapshot; there is nothing
  // to compare against yet. The timely, common case for a freshly-onboarded school.
  const isEmpty = versions.length <= 1

  return (
    <div className="space-y-3">
      {/* header: first → latest + net-change chip */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {!isEmpty && result.first != null && (
          <>
            <span className="font-serif text-[17px] font-medium tabular-nums text-ink2">
              {fmtVal(result.first)}
            </span>
            <ArrowRight size={15} className="text-ink2" aria-hidden />
          </>
        )}
        <span className="font-serif text-[26px] font-medium leading-none tabular-nums text-ink">
          {fmtVal(result.latest)}
        </span>
        {!isEmpty && (
          <DeltaChip delta={result.netChange} format={unit} goodDirection={goodDirection} />
        )}
      </div>

      {!isEmpty && <Sparkline values={result.sparkline} />}

      {isEmpty ? (
        <p className="text-small italic text-ink2">
          {result.collapsed > 0
            ? `Value held steady across ${result.collapsed + 1} snapshots — no change to report.`
            : 'No prior versions yet — this is the first snapshot for this period.'}
        </p>
      ) : (
        <ul className="border-t border-hair">
          {versions.map((v) => (
            <li key={v.snapshotId} className="flex items-start gap-2.5 border-b border-hair py-2">
              <TriggerIcon trigger={v.source?.trigger} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  {v.absent ? (
                    <span className="text-small italic text-ink2">
                      {noun === 'metric'
                        ? 'metric not available in this version'
                        : 'line not present in this version'}
                    </span>
                  ) : (
                    <span className="font-semibold tabular-nums text-ink">{fmtVal(v.value)}</span>
                  )}
                  {!v.absent && v.delta != null && (
                    <DeltaChip delta={v.delta} format={unit} goodDirection={goodDirection} />
                  )}
                </div>
                <p className="mt-0.5 truncate text-[12px] text-ink2" title={v.source?.sourceName || ''}>
                  by {attributionLine(v.source, v.at)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* The empty state already explains a steady value; only footnote when a list is shown. */}
      {!isEmpty && result.collapsed > 0 && (
        <p className="text-[12px] italic text-ink2">
          {result.collapsed} unchanged{' '}
          {result.collapsed === 1 ? 'sync' : 'syncs'} hidden
        </p>
      )}
    </div>
  )
}
