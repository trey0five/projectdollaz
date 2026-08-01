// ─────────────────────────────────────────────────────────────────────────────
// ReadinessTrendStrip — Phase A: the school's RECORDED readiness over time.
//
// Deliberately reports OBSERVED CHANGE and nothing more. There is no forecast, no
// smoothing, no statistic: the server hands back the points it actually recorded,
// a change summary it is willing to stand behind, the exact four-way decomposition
// of that change, and any structural BREAKS in the series. Where the server says
// it cannot report a direction, this renders its reason verbatim — no arrow, no
// direction word, no shading of the truth.
//
// Rendering contract:
//   · one series only (a school on two frameworks picks; series are never merged)
//   · breaks render as GAPS, never as a continuous line across them
//   · the board-meeting marker answers "what changed since the board last met?"
//   · demoData renders a hard, unmissable DEMO DATA chip
//   · inline SVG only — no chart library — and the draw-in is motion-safe
//
// It lives inside the dark navy readiness hero, so it is styled dark-on-navy in
// the module's amber hue, matching ProvenancePair directly above it.
// ─────────────────────────────────────────────────────────────────────────────
import { useId, useMemo } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, History, Landmark, Minus } from 'lucide-react'

const AMBER = '#fbbf24'

// ── Geometry (viewBox units; the SVG scales to its container width) ──────────
const VB_W = 720
const VB_H = 120
const PAD_L = 38
const PAD_R = 10
const PAD_T = 12
const PAD_B = 20

/** "Aug 14, 2026" from a yyyy-mm-dd string (UTC-safe — no timezone drift). */
function longDate(iso) {
  if (!iso) return null
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** "Aug 14" — the compact axis form. */
function axisDate(iso) {
  if (!iso) return null
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** Whole days since the epoch for a yyyy-mm-dd string (UTC, no drift). */
function dayNumber(iso) {
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00.000Z`)
  const t = d.getTime()
  return Number.isNaN(t) ? null : Math.round(t / 86400000)
}

const signed = (n) => (n > 0 ? `+${n}` : String(n))

// ── Shell ────────────────────────────────────────────────────────────────────
function Shell({ children, aside = null }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-navy/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">
          <History size={12} aria-hidden />
          Recorded readiness
        </p>
        {aside}
      </div>
      {children}
    </div>
  )
}

/**
 * EXPORTED so the whole accreditation page speaks ONE provenance vocabulary.
 * Phase E's surfaces (the early-warning rail, the domain bands, the signal
 * roster) render findings derived from the same series this strip marks — a page
 * that stamps DEMO DATA on the readiness trend and leaves a demo-seeded finding
 * beside it unmarked is telling a reader two different things about one dataset.
 */
export function DemoChip() {
  return (
    <span className="inline-flex items-center rounded-full bg-[#F59E0B] px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-navy">
      Demo data
    </span>
  )
}

/** Multi-framework schools choose which series they are looking at. */
function SeriesSelector({ series, seriesKey, onSeriesKeyChange }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {series.map((s) => {
        const active = s.seriesKey === seriesKey
        return (
          <button
            key={s.seriesKey}
            type="button"
            onClick={() => onSeriesKeyChange?.(s.seriesKey)}
            aria-pressed={active}
            title={`${s.name} · ${s.leafCount} standards · ${s.pointCount} readings`}
            className={`rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition ${
              active
                ? 'border-[#F59E0B] bg-[#F59E0B]/20 text-[#fde68a]'
                : 'border-white/15 bg-white/5 text-white/60 hover:border-[#F59E0B]/50 hover:text-white'
            }`}
          >
            {s.accreditor ?? s.name}
          </button>
        )
      })}
    </div>
  )
}

// ── The chart ────────────────────────────────────────────────────────────────
function Chart({ points, breaks, boardMarker, reduce }) {
  const uid = useId().replace(/:/g, '')

  const geo = useMemo(() => {
    const rows = points
      .map((p) => ({ ...p, x: dayNumber(p.date) }))
      .filter((p) => p.x != null && Number.isFinite(p.readinessPct))
    if (rows.length === 0) return null

    const xMin = rows[0].x
    const xMax = rows[rows.length - 1].x
    const xSpan = xMax - xMin || 1
    const vals = rows.map((r) => r.readinessPct)
    let lo = Math.min(...vals)
    let hi = Math.max(...vals)
    // Pad the value window, but never invent range beyond 0–100, and keep a
    // minimum span so a 1-point move is not drawn as a cliff.
    const MIN_SPAN = 8
    if (hi - lo < MIN_SPAN) {
      const mid = (hi + lo) / 2
      lo = mid - MIN_SPAN / 2
      hi = mid + MIN_SPAN / 2
    }
    lo = Math.max(0, Math.floor(lo - 3))
    hi = Math.min(100, Math.ceil(hi + 3))
    if (hi <= lo) hi = lo + 1

    const X = (d) => PAD_L + ((VB_W - PAD_L - PAD_R) * (d - xMin)) / xSpan
    const Y = (v) =>
      PAD_T + (VB_H - PAD_T - PAD_B) * (1 - (Math.min(Math.max(v, lo), hi) - lo) / (hi - lo))

    // Breaks slice the series: a reading either side of a break is measuring a
    // different thing, so the line must not join across it.
    const cuts = (breaks ?? [])
      .map((b) => dayNumber(b.date))
      .filter((d) => d != null && d > xMin && d <= xMax)
      .sort((a, b) => a - b)
    const segments = []
    let current = []
    for (const r of rows) {
      if (cuts.some((c) => c === r.x || (current.length && current[current.length - 1].x < c && r.x >= c))) {
        if (current.length) segments.push(current)
        current = [r]
      } else {
        current.push(r)
      }
    }
    if (current.length) segments.push(current)

    return { rows, X, Y, lo, hi, xMin, xMax, segments, cuts }
  }, [points, breaks])

  if (!geo) return null
  const { rows, X, Y, lo, hi, segments } = geo
  const last = rows[rows.length - 1]
  const showDots = rows.length <= 40
  const boardX = boardMarker?.available && boardMarker.since ? dayNumber(boardMarker.since) : null
  const boardInRange = boardX != null && boardX >= geo.xMin && boardX <= geo.xMax

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      className="mt-3 w-full"
      role="img"
      // The plotted line is blended readiness, but a screen-reader user must not
      // receive that figure ALONE — it is the one number Phase A exists to stop
      // standing on its own. The pair travels with it, as it does everywhere else.
      aria-label={
        `Recorded readiness from ${longDate(rows[0].date)} to ${longDate(last.date)}: ` +
        `${rows[0].readinessPct}% to ${last.readinessPct}%; ` +
        `documented ${rows[0].selfScoredPct}% to ${last.selfScoredPct}%, ` +
        `defensible ${rows[0].verifiedPct}% to ${last.verifiedPct}%`
      }
    >
      <defs>
        <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={AMBER} stopOpacity="0.26" />
          <stop offset="100%" stopColor={AMBER} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* value window — labelled, so the zoomed y-axis can never mislead */}
      {[hi, lo].map((v) => (
        <g key={v}>
          <line
            x1={PAD_L}
            y1={Y(v)}
            x2={VB_W - PAD_R}
            y2={Y(v)}
            stroke="#ffffff"
            strokeOpacity={0.08}
            strokeWidth={1}
          />
          <text
            x={PAD_L - 6}
            y={Y(v)}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize={10}
            fill="#ffffff"
            fillOpacity={0.4}
          >
            {v}%
          </text>
        </g>
      ))}

      {/* board-meeting marker — "since your last board meeting" */}
      {boardInRange ? (
        <g>
          <line
            x1={X(boardX)}
            y1={PAD_T - 4}
            x2={X(boardX)}
            y2={VB_H - PAD_B}
            stroke="#ffffff"
            strokeOpacity={0.45}
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />
          <circle cx={X(boardX)} cy={PAD_T - 4} r={3} fill="#ffffff" fillOpacity={0.6} />
          <title>{`Since ${boardMarker.label ?? 'your last board meeting'} — ${longDate(boardMarker.since)}`}</title>
        </g>
      ) : null}

      {/* structural breaks — the line stops, it does not bridge */}
      {(breaks ?? []).map((b) => {
        const bx = dayNumber(b.date)
        if (bx == null || bx < geo.xMin || bx > geo.xMax) return null
        return (
          <g key={`${b.date}-${b.kind}`}>
            <line
              x1={X(bx)}
              y1={PAD_T - 4}
              x2={X(bx)}
              y2={VB_H - PAD_B}
              stroke={AMBER}
              strokeOpacity={0.55}
              strokeWidth={1.5}
              strokeDasharray="2 5"
            />
            <rect
              x={X(bx) - 3.5}
              y={PAD_T - 7.5}
              width={7}
              height={7}
              transform={`rotate(45 ${X(bx)} ${PAD_T - 4})`}
              fill={AMBER}
              fillOpacity={0.9}
            />
            <title>{b.detail}</title>
          </g>
        )
      })}

      {/* the readings, one path per comparable segment */}
      {segments.map((seg, i) => {
        if (seg.length === 1) {
          return (
            <circle
              key={`seg-${i}`}
              cx={X(seg[0].x)}
              cy={Y(seg[0].readinessPct)}
              r={3}
              fill={AMBER}
            />
          )
        }
        // STEP, NOT A RAMP. The capture dedupes on a payload hash, so the record
        // is event-sampled: a school that scored standards on 5 Sep and again on
        // 12 Dec has no rows in between because nothing changed. Joining those
        // two readings with a straight line would draw fourteen weeks of steady
        // improvement that provably did not happen. A held value until the next
        // recorded reading is the honest rendering of an event-sampled record.
        const d = seg
          .map((r, j) =>
            j === 0
              ? `M${X(r.x)} ${Y(r.readinessPct)}`
              : `H${X(r.x)} V${Y(r.readinessPct)}`,
          )
          .join(' ')
        const areaD = `${d} L ${X(seg[seg.length - 1].x)} ${VB_H - PAD_B} L ${X(seg[0].x)} ${VB_H - PAD_B} Z`
        return (
          <g key={`seg-${i}`}>
            <path d={areaD} fill={`url(#${uid}-fill)`} stroke="none" />
            <motion.path
              d={d}
              fill="none"
              stroke={AMBER}
              strokeWidth={2.25}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={reduce ? { duration: 0 } : { duration: 0.9, ease: 'easeOut' }}
            />
          </g>
        )
      })}

      {/* per-reading dots (only when the series is sparse enough to read; the
          latest reading is drawn separately below, so it is excluded here to
          avoid stacking two tooltips on one point) */}
      {showDots
        ? rows.slice(0, -1).map((r) => (
            <circle key={r.date} cx={X(r.x)} cy={Y(r.readinessPct)} r={2.5} fill={AMBER} fillOpacity={0.75}>
              <title>
                {`${longDate(r.date)} — readiness ${r.readinessPct}% · documented ${r.selfScoredPct}% · defensible ${r.verifiedPct}%`}
              </title>
            </circle>
          ))
        : null}

      {/* the latest reading */}
      <circle
        cx={X(last.x)}
        cy={Y(last.readinessPct)}
        r={4}
        fill={AMBER}
        stroke="#0f1f3d"
        strokeWidth={2}
      >
        <title>
          {`${longDate(last.date)} — readiness ${last.readinessPct}% · documented ${last.selfScoredPct}% · defensible ${last.verifiedPct}%`}
        </title>
      </circle>

      {/* date axis ends */}
      <text x={PAD_L} y={VB_H - 6} fontSize={10} fill="#ffffff" fillOpacity={0.4}>
        {axisDate(rows[0].date)}
      </text>
      <text
        x={VB_W - PAD_R}
        y={VB_H - 6}
        textAnchor="end"
        fontSize={10}
        fill="#ffffff"
        fillOpacity={0.4}
      >
        {axisDate(last.date)}
      </text>
    </svg>
  )
}

// ── The change chip (never rendered when the server withholds a direction) ───
function ChangeChip({ change }) {
  const dir = change?.direction
  const delta = change?.deltaPct
  if (!change?.available || dir === 'insufficient_history' || typeof delta !== 'number') return null
  const Icon = dir === 'improving' ? ArrowUpRight : dir === 'declining' ? ArrowDownRight : Minus
  const word = dir === 'improving' ? 'up' : dir === 'declining' ? 'down' : 'level'
  const abs = Math.abs(delta)
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#F59E0B]/45 bg-[#F59E0B]/12 px-2.5 py-1 text-[12.5px] font-semibold text-[#fde68a]">
      <Icon size={13} aria-hidden />
      {dir === 'flat'
        ? `Level since ${axisDate(change.from)}`
        : `${word[0].toUpperCase()}${word.slice(1)} ${abs} point${abs === 1 ? '' : 's'} since ${axisDate(change.from)}`}
    </span>
  )
}

// ── The exact four-way decomposition of the observed change ──────────────────
// Rendered even when the direction is WITHHELD: a break's decomposition is what
// explains the break (fromScopeChange), so suppressing it would hide the reason.
function DecompositionLine({ decomposition, label = null }) {
  if (!decomposition) return null
  const parts = [
    { key: 'scope', label: 'scope', value: decomposition.fromScopeChange },
    { key: 'scoring', label: 'newly scored', value: decomposition.fromScoring },
    { key: 'improvement', label: 'improvement', value: decomposition.fromImprovement },
    { key: 'evidence', label: 'evidence', value: decomposition.fromEvidence },
  ].filter((p) => typeof p.value === 'number' && p.value !== 0)

  return (
    <div className="mt-2.5">
      {label ? (
        <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/40">
          {label}
        </p>
      ) : null}
      {decomposition.narrative ? (
        <p className="text-[12.5px] leading-relaxed text-white/70">{decomposition.narrative}</p>
      ) : null}
      {parts.length ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {parts.map((p) => (
            <span
              key={p.key}
              className="rounded-md border border-white/12 bg-white/5 px-1.5 py-0.5 text-[11px] font-semibold text-white/60"
            >
              {signed(p.value)} {p.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════

export default function ReadinessTrendStrip({
  series = null, // the /series payload
  seriesKey = null,
  onSeriesKeyChange = null,
  trend = null, // the /trend payload
  loading = false,
  error = '',
  notLicensed = false,
  reduce = false,
}) {
  // ── not licensed — fail-soft, the page gate owns the real message ──────────
  if (notLicensed) {
    return (
      <Shell>
        <p className="mt-2 text-[12.5px] text-white/50">
          Recorded readiness comes with the Accreditation module.
        </p>
      </Shell>
    )
  }

  // ── loading ────────────────────────────────────────────────────────────────
  if (loading && !trend) {
    return (
      <Shell>
        <div className="mt-3 h-[54px] rounded-lg bg-white/5 motion-safe:animate-pulse" aria-hidden />
        <p className="mt-2 text-[12.5px] text-white/45">Loading your recorded readiness…</p>
      </Shell>
    )
  }

  // ── error — never blocks the hero ──────────────────────────────────────────
  if (error && !trend) {
    return (
      <Shell>
        <p className="mt-2 text-[12.5px] text-white/50">{error}</p>
      </Shell>
    )
  }

  const points = trend?.points ?? []
  const demo = trend?.demoData === true || series?.demoData === true
  const list = series?.series ?? []
  const requiresSelection = (trend?.requiresSelection ?? series?.requiresSelection) === true
  const startsAt = trend?.seriesStartsAt ?? series?.seriesStartsAt ?? null
  // The series entry we are looking at, straight from /series — it is NOT window
  // scoped, so it is what tells us whether readings exist outside the window.
  const entry = list.find((s) => s.seriesKey === (trend?.seriesKey ?? seriesKey)) ?? null

  const aside = (
    <div className="flex flex-wrap items-center gap-2">
      {demo ? <DemoChip /> : null}
      {requiresSelection && list.length > 1 ? (
        <SeriesSelector series={list} seriesKey={seriesKey} onSeriesKeyChange={onSeriesKeyChange} />
      ) : null}
    </div>
  )

  // ── nothing to draw ────────────────────────────────────────────────────────
  // TWO DIFFERENT FACTS, never conflated: "we have never recorded a reading" and
  // "we recorded readings, just not inside this window". The second is the
  // ordinary multi-framework case — a series a school stopped using more than a
  // year ago has a real, readable past, and telling its owner that "earlier
  // readiness was not recorded" would be flatly untrue while the same payload
  // reports a first point and a point count.
  if (points.length === 0) {
    // THIS series' own first reading — never the cross-series `startsAt` above,
    // which would let one framework's history vouch for another's.
    const seriesStartsAt = trend?.seriesStartsAt ?? entry?.firstPointAt ?? null
    const recorded =
      (entry?.pointCount ?? 0) > 0 || Boolean(entry?.lastPointAt) || Boolean(seriesStartsAt)
    if (recorded) {
      return (
        <Shell aside={aside}>
          <p className="mt-2 text-[13px] font-semibold text-white/75">
            No readings in this window.
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-white/50">
            {entry?.lastPointAt
              ? `This series was last recorded on ${longDate(entry.lastPointAt)}`
              : 'This series has recorded readings outside the window shown'}
            {seriesStartsAt ? `, and tracking on it began ${longDate(seriesStartsAt)}` : null}
            {entry?.pointCount
              ? ` — ${entry.pointCount} reading${entry.pointCount === 1 ? '' : 's'} in all.`
              : '.'}{' '}
            Nothing has been lost; the window simply does not reach it.
          </p>
        </Shell>
      )
    }
    return (
      <Shell aside={aside}>
        <p className="mt-2 text-[13px] font-semibold text-white/75">
          Tracking starts today — earlier readiness was not recorded.
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-white/50">
          We take one reading a night from here. Readings before today were never taken, so there is
          nothing to fill in behind this — the picture builds forward from your first reading.
        </p>
      </Shell>
    )
  }

  const change = trend?.change ?? null
  const withheld = !change?.available || change?.direction === 'insufficient_history'
  const boardMarker = trend?.boardMarker ?? null
  const breaks = trend?.breaks ?? []
  const selected = entry
  const indexComparable = trend?.indexComparable ?? selected?.indexComparable ?? true

  // A signed point movement IS a direction, whatever the punctuation. So the
  // board delta is shown only when the server was willing to report a direction
  // at all: a break inside the window means the two ends measure different
  // things, and too few/too close readings mean we do not know yet. In either
  // case the chip falls back to the dateline form rather than putting "+4
  // points" on the line above a refusal to say which way things moved.
  const boardDeltaShown =
    boardMarker?.available &&
    typeof boardMarker.deltaPct === 'number' &&
    breaks.length === 0 &&
    change?.available === true &&
    change?.direction !== 'insufficient_history'

  return (
    <Shell aside={aside}>
      {/* headline row: the change the server is willing to stand behind — or its reason */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ChangeChip change={change} />
        {boardMarker?.available && boardMarker.since ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[12px] font-semibold text-white/65"
            title={`Your last board meeting with approved minutes: ${longDate(boardMarker.since)}`}
          >
            <Landmark size={12} aria-hidden />
            {boardDeltaShown
              ? `${signed(boardMarker.deltaPct)} points since ${boardMarker.label ?? 'your last board meeting'}`
              : `Since ${boardMarker.label ?? 'your last board meeting'} · ${axisDate(boardMarker.since)}`}
          </span>
        ) : null}
      </div>

      {withheld && change?.reason ? (
        <p className="mt-2 flex items-start gap-1.5 text-[12.5px] leading-relaxed text-white/60">
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-[#fbbf24]/80" aria-hidden />
          <span>{change.reason}</span>
        </p>
      ) : null}

      <Chart points={points} breaks={breaks} boardMarker={boardMarker} reduce={reduce} />

      {/* breaks, spelled out — a gap in the line always carries its reason in text */}
      {breaks.length ? (
        <ul className="mt-2 space-y-1">
          {breaks.map((b) => (
            <li
              key={`${b.date}-${b.kind}`}
              className="flex items-start gap-1.5 text-[12px] leading-relaxed text-white/55"
            >
              <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rotate-45 bg-[#fbbf24]" aria-hidden />
              <span>
                <span className="text-white/70">{axisDate(b.date)}:</span> {b.detail} Readings either
                side of this are not comparable.
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* The heading names the real cause. `withheld` covers three cases — too
          few readings, too short a span, and a comparability break — and only
          the last of them has a break to be either side of. Announcing one that
          the server never reported would invent the very thing this strip is
          built to surface. */}
      <DecompositionLine
        decomposition={trend?.decomposition}
        label={
          breaks.length > 0
            ? 'What moved either side of the break'
            : withheld
              ? 'What moved between these readings'
              : null
        }
      />

      {/* the honest footer: when tracking began, how much we have, and the caveat */}
      <p className="mt-3 border-t border-white/10 pt-2.5 text-[11.5px] leading-relaxed text-white/40">
        {startsAt ? `Tracking since ${longDate(startsAt)}. ` : null}
        {points.length} reading{points.length === 1 ? '' : 's'} shown
        {selected?.name ? ` · ${selected.name}` : null}
        {indexComparable === false
          ? ' · these standards sit outside a framework, so no accreditation index is projected for them'
          : null}
      </p>
      {trend?.disclaimer ? (
        <p className="mt-1.5 text-[11px] leading-relaxed text-white/30">{trend.disclaimer}</p>
      ) : null}
    </Shell>
  )
}
