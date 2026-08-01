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
// Dark surface: this renders inside the navy evidence panel, so it is styled
// white/amber on navy (StatusChip's light chip vocabulary is unreadable there —
// the status pill below is the same semantics in the dark palette this page
// already uses for assurance gates).
// ─────────────────────────────────────────────────────────────────────────────
import { Link } from 'react-router-dom'
import { Activity, ExternalLink } from 'lucide-react'
import DeltaChip from '../analytics/DeltaChip.jsx'
import { formatMetricValue, metricFormat, STATUS_LABELS } from '../../lib/metricMeta.js'
import { formatDate } from '../../lib/format.js'

// The dark status vocabulary already in use on this page (assurance gates):
// emerald = on track, amber = watch, red = at risk, white/40 = contextual.
const DARK_STATUS = {
  good: { dot: '#34d399', cls: 'border-emerald-400/35 bg-emerald-400/10 text-emerald-300' },
  watch: { dot: '#fbbf24', cls: 'border-[#F59E0B]/40 bg-[#F59E0B]/12 text-[#fde68a]' },
  risk: { dot: '#f87171', cls: 'border-red-400/35 bg-red-400/10 text-red-300' },
  neutral: { dot: '#94a3b8', cls: 'border-white/15 bg-white/5 text-white/55' },
}

function SignalStatus({ status }) {
  const meta = DARK_STATUS[status] ?? DARK_STATUS.neutral
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] ${meta.cls}`}
    >
      <span
        aria-hidden
        className="inline-block h-[6px] w-[6px] rounded-full"
        style={{ backgroundColor: meta.dot }}
      />
      {STATUS_LABELS[status] ?? STATUS_LABELS.neutral}
    </span>
  )
}

function Shell({ children, aside = null }) {
  return (
    <div className="mb-3 rounded-xl border border-white/10 bg-navy/50 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">
            <Activity size={12} aria-hidden />
            Operational signals
          </p>
          <p className="mt-0.5 text-[12px] text-white/40">
            You didn&apos;t enter these for accreditation.
          </p>
        </div>
        {aside}
      </div>
      {children}
    </div>
  )
}

/** The "Where this comes from" disclosure — formula, description, lineage. */
function Provenance({ signal }) {
  const { formula, description, lineage } = signal
  if (!formula && !description && !lineage) return null
  return (
    <details className="mt-1.5">
      <summary className="cursor-pointer list-none text-[11.5px] font-semibold text-white/45 transition hover:text-[#fde68a]">
        Where this comes from
      </summary>
      <div className="mt-1.5 space-y-1 border-l-2 border-white/10 pl-2.5">
        {formula ? (
          <p className="text-[11.5px] leading-relaxed text-white/55">
            <span className="font-semibold text-white/70">Formula:</span> {formula}
          </p>
        ) : null}
        {description ? (
          <p className="text-[11.5px] leading-relaxed text-white/45">{description}</p>
        ) : null}
        {lineage ? (
          <p className="text-[11.5px] leading-relaxed text-white/45">
            Saved statements for {lineage.periodLabel} (period ending {lineage.periodEndDate}) · data
            as of {formatDate(String(lineage.dataAsOf).slice(0, 10))}
          </p>
        ) : null}
      </div>
    </details>
  )
}

function SignalRow({ signal, periodLabel }) {
  const fmt = metricFormat(signal.key, signal.unit)
  const live = signal.available === true && signal.value != null
  const un = signal.unavailable ?? null

  return (
    <li className="border-t border-white/10 py-2.5 first:border-t-0 first:pt-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="min-w-0 text-[12.5px] font-semibold text-white/75">{signal.label}</span>
        {live ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-serif text-[22px] font-semibold leading-none text-[#fbbf24]">
              {formatMetricValue(signal.value, fmt)}
            </span>
            <SignalStatus status={signal.status} />
            {signal.periodOverPeriodDelta != null ? (
              <DeltaChip
                delta={signal.periodOverPeriodDelta}
                format={fmt}
                goodDirection={signal.goodDirection}
                onDark
              />
            ) : null}
            {periodLabel ? (
              <span className="text-[11.5px] text-white/40">as of {periodLabel}</span>
            ) : null}
          </span>
        ) : null}
      </div>

      {/* No value → the server's reason, verbatim. No number, no band, no chip. */}
      {!live && un ? (
        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] leading-relaxed text-white/45">
          <span>{un.message}</span>
          {un.reason === 'module_not_licensed' ? (
            <Link
              to="/settings/billing#modules"
              className="inline-flex items-center gap-1 rounded-md border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[#fde68a] hover:bg-[#F59E0B]/20"
            >
              Modules <ExternalLink size={11} aria-hidden />
            </Link>
          ) : null}
        </p>
      ) : null}
      {!live && !un ? (
        <p className="mt-0.5 text-[12px] text-white/40">No value for this period yet.</p>
      ) : null}

      <Provenance signal={signal} />
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
        <p className="mt-2 text-[12.5px] leading-relaxed text-white/45">
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
        <div className="mt-2 h-[34px] rounded-lg bg-white/5 motion-safe:animate-pulse" aria-hidden />
      </Shell>
    )
  }

  // Never blanks the evidence panel below — one honest line and move on.
  if (notLicensed || (error && rows.length === 0)) {
    return (
      <Shell>
        <p className="mt-2 text-[12.5px] text-white/45">
          Operating signals are unavailable right now.
        </p>
      </Shell>
    )
  }

  const live = rows.filter((s) => s.available === true).length

  return (
    <Shell
      aside={
        <span className="shrink-0 rounded-full border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-2.5 py-1 text-[11.5px] font-semibold text-[#fde68a]">
          {live} of {bound} live
        </span>
      }
    >
      {rows.length === 0 ? (
        <p className="mt-2 text-[12.5px] text-white/45">
          {bound} signal{bound === 1 ? '' : 's'} bound · values unavailable right now.
        </p>
      ) : (
        <ul className="mt-2">
          {rows.map((s) => (
            <SignalRow key={s.key} signal={s} periodLabel={period?.label ?? null} />
          ))}
        </ul>
      )}
    </Shell>
  )
}
