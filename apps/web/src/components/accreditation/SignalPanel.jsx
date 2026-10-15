// ─────────────────────────────────────────────────────────────────────────────
// SignalPanel — Phase B: the screen that stops the Standard Drawer looking like a
// portal.
//
// An accreditation portal asks you to type an assertion into a box. KYRO already
// holds the school's operating numbers, so when a standard is about "equitable
// allocation of fiscal resources" the drawer can show the actual margin, cash
// days, reserve months and cost per pupil — with the period they describe — right
// beside the rubric pips. Hence the subtitle, which is the product claim in one
// line: YOU DIDN'T ENTER THESE FOR ACCREDITATION.
//
// Every number is server-computed and server-banded; this component formats and
// lays out, nothing more. The honesty contract it enforces:
//   · a metric with no value shows its REASON verbatim and no value, no band, no
//     chip — never a zero, never the last period's figure;
//   · a metric whose module the school hasn't licensed says exactly that (and
//     links to Modules) rather than vanishing, because a silently shorter list
//     reads as "there is nothing here";
//   · zero bindings is the COMMON case and must not read as an error;
//   · a failed/loading signals call degrades to one line and NEVER blanks the
//     evidence panel below it.
//
// LINEAGE — a deliberate, documented deviation from Phase H's plan. We do NOT
// mount components/reports/LineageDrawer.jsx here: that drawer is coupled to a
// statement ReportBundle plus the period's import summaries and lives in the
// reports host, so mounting it would cost two extra requests and a cross-module
// dependency to answer a question the /signals payload already answers in full.
// Phase B ships lineage as the inline "Where this comes from" disclosure below;
// Phase H may promote it to a shared drawer.
//
// PREMIUM UI P4 (a2): light, on the ground. The panel is a ledger block — an
// 11px-caps label on a hairline with the period and the "N of M live" count as
// its aside (said once, not per row), then fixed-track ruled rows — Signal |
// Value | Status | Change | source chevron — so stacked figures share one right
// edge. Fixed tracks, not auto table layout: the same panel renders in the
// narrow evidence drawer, where a container query folds status and change under
// the figure. No navy shell, no amber figures.
// ─────────────────────────────────────────────────────────────────────────────
import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, ArrowDownRight, ArrowUpRight, ChevronDown, ExternalLink } from 'lucide-react'
import Pill from '../ui/surface/Pill.jsx'
import { DELTA_TONE } from '../analytics/v2/statusStyle.js'
import {
  deltaTone,
  formatDelta,
  formatMetricValue,
  metricFormat,
  STATUS_LABELS,
} from '../../lib/metricMeta.js'
import { formatDate } from '../../lib/format.js'
import '../../styles/pending/a2-carry.css'

/** Registry status → Pill tone (contextual reads neutral). */
const STATUS_TONE = { good: 'good', watch: 'watch', risk: 'risk' }

function SignalStatus({ status }) {
  return (
    <Pill variant="status" tone={STATUS_TONE[status] ?? 'neutral'}>
      {STATUS_LABELS[status] ?? STATUS_LABELS.neutral}
    </Pill>
  )
}

function SignalDelta({ delta, format, goodDirection }) {
  const text = formatDelta(delta, format)
  if (text == null) return null
  const tone = deltaTone(delta, goodDirection)
  const Arrow = Number(delta) > 0 ? ArrowUpRight : Number(delta) < 0 ? ArrowDownRight : null
  return (
    <Pill
      variant="status"
      tone={DELTA_TONE[tone] ?? 'neutral'}
      title="Change vs the prior period"
      aria-label={`Change vs prior period ${text}`}
    >
      {Arrow ? <Arrow size={10} aria-hidden className="shrink-0 text-ink2" /> : null}
      <span className="tabular-nums">{text}</span>
    </Pill>
  )
}

function Shell({ children, aside = null }) {
  return (
    <div className="a2-sig mb-4" data-testid="signal-panel">
      <div className="sec-head !mb-1">
        <h3 className="sec-label inline-flex items-center gap-1.5">
          <Activity size={12} aria-hidden />
          Operational signals
        </h3>
        <span className="sec-rule" aria-hidden="true" />
        {aside ? <div className="sec-aside inline-flex items-center gap-2">{aside}</div> : null}
      </div>
      <p className="text-[12px] text-ink2">You didn&apos;t enter these for accreditation.</p>
      {children}
    </div>
  )
}

/** The "Where this comes from" block — formula, description, lineage. Opened
 *  from the row's chevron; spans the whole row under the figures. */
function hasProvenance(signal) {
  return Boolean(signal.formula || signal.description || signal.lineage)
}

function Provenance({ signal, id }) {
  const { formula, description, lineage } = signal
  return (
    <div id={id} className="a2-sig-src space-y-1 border-l-2 border-hair pl-2.5">
      {formula ? (
        <p className="text-[12px] leading-relaxed text-ink2">
          <span className="font-semibold text-ink">Formula:</span> {formula}
        </p>
      ) : null}
      {description ? (
        <p className="text-[12px] leading-relaxed text-ink2">{description}</p>
      ) : null}
      {lineage ? (
        <p className="text-[12px] leading-relaxed text-ink2">
          Saved statements for {lineage.periodLabel} (period ending {lineage.periodEndDate}) · data
          as of {formatDate(String(lineage.dataAsOf).slice(0, 10))}
        </p>
      ) : null}
    </div>
  )
}

/** The ledger's column heads — one row, the same tracks as every signal row. */
function SignalHead() {
  return (
    <div className="a2-sig-row a2-sig-head" aria-hidden="true">
      <span>Signal</span>
      <span className="a2-sig-num">Value</span>
      <span>Status</span>
      <span>Change</span>
      <span />
    </div>
  )
}

const DASH = <span className="font-sans text-[13px] font-normal text-ink2">—</span>

function SignalRow({ signal }) {
  const fmt = metricFormat(signal.key, signal.unit)
  const live = signal.available === true && signal.value != null
  const un = signal.unavailable ?? null
  const [open, setOpen] = useState(false)
  const srcId = useId()
  const withSrc = hasProvenance(signal)

  return (
    <li className="a2-sig-row" data-live={live ? 'true' : 'false'}>
      <span className="a2-sig-label min-w-0">
        <span className="block text-[13px] font-semibold text-ink">{signal.label}</span>
        {/* No value → the server's reason, verbatim. No number, no band, no chip. */}
        {!live && un ? (
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] leading-relaxed text-ink2">
            <span>{un.message}</span>
            {un.reason === 'module_not_licensed' ? (
              <Link to="/settings/billing#modules" className="dt-link">
                Modules <ExternalLink size={11} aria-hidden />
              </Link>
            ) : null}
          </span>
        ) : null}
        {!live && !un ? (
          <span className="mt-0.5 block text-[12px] text-ink2">No value for this period yet.</span>
        ) : null}
      </span>
      <span className="a2-sig-num font-serif text-[20px] font-medium leading-none tabular-nums text-ink">
        {live ? formatMetricValue(signal.value, fmt) : DASH}
      </span>
      <span className="a2-sig-cell">{live ? <SignalStatus status={signal.status} /> : DASH}</span>
      <span className="a2-sig-cell">
        {live && signal.periodOverPeriodDelta != null ? (
          <SignalDelta
            delta={signal.periodOverPeriodDelta}
            format={fmt}
            goodDirection={signal.goodDirection}
          />
        ) : (
          DASH
        )}
      </span>
      <span className="a2-sig-cell">
        {withSrc ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={srcId}
            aria-label={`Where ${signal.label} comes from`}
            title="Where this comes from"
            className="a2-sig-toggle"
          >
            <ChevronDown
              size={14}
              aria-hidden
              className={`transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </button>
        ) : null}
      </span>
      {withSrc && open ? <Provenance signal={signal} id={srcId} /> : null}
    </li>
  )
}

// ═════════════════════════════════════════════════════════════════════════════

export default function SignalPanel({
  rows = [],
  boundKeys = [],
  period = null,
  loading = false,
  error = '',
  notLicensed = false,
  /**
   * WHOSE signals are these? Phase E hoists this panel onto the whole-school
   * Signals tab, where `boundKeys` is every signal the school has rather than one
   * standard's binding — and the empty-state sentence still said "this standard",
   * with no standard anywhere on the screen. One prop, one sentence; the drawer's
   * copy is byte-identical.
   */
  scope = 'standard',
}) {
  const bound = boundKeys.length

  // THE COMMON CASE, and it must not read as a failure: most standards are judged
  // on the rubric and the evidence, full stop.
  if (bound === 0 && !loading) {
    return (
      <Shell>
        <p className="mt-2 text-[13px] leading-relaxed text-ink2">
          {scope === 'school'
            ? 'No operating signal is bound to any of your standards yet — they are judged on your rubric scores and your evidence.'
            : "No operating signal is bound to this standard — it's judged on your rubric score and your evidence."}
        </p>
      </Shell>
    )
  }

  if (loading && rows.length === 0) {
    return (
      <Shell>
        <div className="mt-2 h-[34px] rounded-lg bg-ink/[0.04] motion-safe:animate-pulse" aria-hidden />
      </Shell>
    )
  }

  // Never blanks the evidence panel below — one honest line and move on.
  if (notLicensed || (error && rows.length === 0)) {
    return (
      <Shell>
        <p className="mt-2 text-[13px] text-ink2">
          Operating signals are unavailable right now.
        </p>
      </Shell>
    )
  }

  const live = rows.filter((s) => s.available === true).length

  return (
    <Shell
      aside={
        <>
          {/* The period, said ONCE for every figure below it. */}
          {period?.label ? (
            <span className="text-[12px] font-medium normal-case tracking-normal text-ink2">
              as of {period.label}
            </span>
          ) : null}
          <Pill variant="count">
            {live} of {bound} live
          </Pill>
        </>
      }
    >
      {rows.length === 0 ? (
        <p className="mt-2 text-[13px] text-ink2">
          {bound} signal{bound === 1 ? '' : 's'} bound · values unavailable right now.
        </p>
      ) : (
        <div className="mt-2">
          <SignalHead />
          <ul className="a2-rows a2-rows-tight a2-rows-open">
            {rows.map((s) => (
              <SignalRow key={s.key} signal={s} />
            ))}
          </ul>
        </div>
      )}
    </Shell>
  )
}
