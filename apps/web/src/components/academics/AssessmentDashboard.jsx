// ─────────────────────────────────────────────────────────────────────────────
// AssessmentDashboard — the academic command center.
//
// Every number here is computed SERVER-SIDE by the pure assessment layer and
// arrives in one payload, so this file only paints. That is deliberate: a chart
// that does its own arithmetic is a second implementation waiting to disagree
// with the print packet and the assistant.
//
// The reference lines are the point of the whole screen. A percentile of 68
// means nothing until the reader sees the national midpoint at 50 and the
// diocesan average beside it — so both lines are drawn ON the chart rather than
// printed underneath it, and the selected school is the one bar that is lit.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Award,
  ChevronRight,
  Flag,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users2,
} from 'lucide-react'
import { useReducedMotion } from '../analytics/charts/useReducedMotion.js'

const EASE = [0.2, 0.8, 0.2, 1]
const HUE = '#0D9488'

const SUBJECT_LABEL = {
  english: 'English',
  math: 'Math',
  reading: 'Reading',
  science: 'Science',
  erw: 'Reading & Writing',
  language: 'Language',
  socialStudies: 'Social Studies',
}
const label = (s) => SUBJECT_LABEL[s] ?? s

const fmt = (v, digits = 1) =>
  v === null || v === undefined ? '—' : Number(v).toFixed(digits).replace(/\.0$/, '')
const signed = (v, digits = 1) => {
  if (v === null || v === undefined) return '—'
  const r = Number(Number(v).toFixed(digits))
  // A rounded zero is zero — "-0" reads as a deficit that isn't there.
  if (r === 0) return '0'
  return `${r > 0 ? '+' : ''}${r}`
}

const STANDING_TONE = {
  strong: { text: 'text-emerald-700', bg: 'bg-emerald-500/12', ring: 'ring-emerald-500/30', dot: '#059669' },
  below: { text: 'text-rose-700', bg: 'bg-rose-500/12', ring: 'ring-rose-500/30', dot: '#e11d48' },
  average: { text: 'text-navy/70', bg: 'bg-navy/[0.06]', ring: 'ring-navy/15', dot: '#64748b' },
  unknown: { text: 'text-muted', bg: 'bg-navy/[0.04]', ring: 'ring-navy/10', dot: '#cbd5e1' },
}

/** A variance chip — the "-45 points vs diocese" the whole deck hangs on. */
function VarianceChip({ variance, standing, unit = '' }) {
  const tone = STANDING_TONE[standing] ?? STANDING_TONE.unknown
  const Icon = standing === 'strong' ? TrendingUp : standing === 'below' ? TrendingDown : null
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-bold ring-1 ${tone.bg} ${tone.text} ${tone.ring}`}
    >
      {Icon ? <Icon size={12} /> : null}
      {signed(variance)}
      {unit} vs peers
    </span>
  )
}

// ── KPI strip ────────────────────────────────────────────────────────────────

function KpiCard({ title, value, sub, chip, delay = 0, reduce }) {
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE, delay }}
      className="relative overflow-hidden rounded-2xl border border-navy/10 bg-white p-4 shadow-[0_14px_34px_-22px_rgba(16,28,61,0.4)]"
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ background: `linear-gradient(90deg, ${HUE}, ${HUE}33)` }}
      />
      <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.16em] text-muted">{title}</p>
      <p className="mt-1.5 font-serif text-[30px] font-semibold leading-none text-navy tabular-nums">{value}</p>
      {sub ? <p className="mt-1.5 text-[11.5px] text-muted">{sub}</p> : null}
      {chip ? <div className="mt-2">{chip}</div> : null}
    </motion.div>
  )
}

// ── Ranked schools, with the two reference lines ─────────────────────────────

function RankedSchools({ schools, focusId, national, peerAvg, range, reduce, anonymous }) {
  const rows = anonymous
    ? anonymous.map((p, i) => ({ key: `${p.label}-${i}`, name: p.label, value: p.value, isFocus: p.isFocus }))
    : schools.map((s) => ({ key: s.schoolId, name: s.schoolName ?? 'School', value: s.value, isFocus: s.schoolId === focusId, forthcoming: s.forthcoming }))

  const values = rows.map((r) => r.value).filter((v) => v !== null && v !== undefined)
  const hi = Math.max(range?.max ?? 0, ...values, national ?? 0, peerAvg ?? 0)
  const lo = Math.min(range?.min ?? 0, ...values)
  const span = hi - lo || 1
  const pct = (v) => ((v - lo) / span) * 100

  return (
    <div className="relative">
      {/* Reference lines drawn ON the field. */}
      {[
        national !== null && national !== undefined ? { v: national, color: '#e11d48', text: `National ${fmt(national, 0)}` } : null,
        peerAvg !== null && peerAvg !== undefined ? { v: peerAvg, color: '#2563EB', text: `Diocese ${fmt(peerAvg)}` } : null,
      ]
        .filter(Boolean)
        .map((line) => (
          <div
            key={line.text}
            className="pointer-events-none absolute inset-y-0 z-10 border-l-2 border-dashed"
            style={{ left: `calc(${pct(line.v)}% )`, borderColor: line.color }}
          >
            <span
              className="absolute -top-1 left-1 whitespace-nowrap rounded px-1 font-mono text-[9px] font-bold"
              style={{ color: line.color, background: 'rgba(255,255,255,0.85)' }}
            >
              {line.text}
            </span>
          </div>
        ))}

      <div className="space-y-1.5 pt-3">
        {rows.map((r, i) => (
          <div key={r.key} className="flex items-center gap-2.5">
            <span
              className={`w-[112px] shrink-0 truncate text-right text-[11.5px] ${r.isFocus ? 'font-bold text-navy' : 'text-muted'}`}
              title={r.name}
            >
              {r.name}
            </span>
            <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-navy/[0.05]">
              {r.value === null || r.value === undefined ? (
                <span className="absolute inset-y-0 left-2 flex items-center font-mono text-[10px] italic text-muted">
                  {r.forthcoming ? 'forthcoming' : 'no data'}
                </span>
              ) : (
                <motion.div
                  initial={reduce ? { width: `${pct(r.value)}%` } : { width: 0 }}
                  animate={{ width: `${pct(r.value)}%` }}
                  transition={{ duration: 0.75, ease: EASE, delay: reduce ? 0 : 0.05 + i * 0.035 }}
                  className="h-full rounded-md"
                  style={{
                    background: r.isFocus
                      ? `linear-gradient(90deg, ${HUE}, #14b8a6)`
                      : 'linear-gradient(90deg, rgba(31,61,114,0.30), rgba(31,61,114,0.16))',
                    boxShadow: r.isFocus ? `0 0 18px -4px ${HUE}` : 'none',
                  }}
                />
              )}
            </div>
            <span className={`w-10 text-right text-[12px] tabular-nums ${r.isFocus ? 'font-bold text-navy' : 'text-muted'}`}>
              {fmt(r.value, 0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Grade × subject heat map ─────────────────────────────────────────────────

function Heatmap({ cells, subjects, reduce }) {
  const grades = [...new Set(cells.map((c) => c.grade))]
  if (grades.length === 0) return null
  const shown = subjects.filter((s) => cells.some((c) => c.subject === s && c.value !== null))
  if (shown.length === 0) return null

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="w-14" />
            {shown.map((s) => (
              <th key={s} className="pb-1 text-center font-mono text-[9.5px] font-bold uppercase tracking-wider text-muted">
                {label(s)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grades.map((g, gi) => (
            <tr key={g}>
              <td className="pr-1 text-right font-mono text-[10.5px] font-bold text-muted">Gr {g}</td>
              {shown.map((s, si) => {
                const cell = cells.find((c) => c.grade === g && c.subject === s)
                const tone = STANDING_TONE[cell?.standing ?? 'unknown']
                return (
                  <td key={s} className="p-0">
                    <motion.div
                      initial={reduce ? false : { opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.35, ease: EASE, delay: reduce ? 0 : 0.03 * (gi * shown.length + si) }}
                      className={`flex h-11 flex-col items-center justify-center rounded-lg ring-1 ${tone.bg} ${tone.ring}`}
                      title={
                        cell?.suppressed
                          ? 'Fewer than 5 students — suppressed'
                          : `${label(s)} grade ${g}: ${fmt(cell?.value, 0)} (${signed(cell?.variance)} vs same grade elsewhere)`
                      }
                    >
                      <span className={`text-[14px] font-bold tabular-nums ${tone.text}`}>
                        {cell?.suppressed ? '<5' : fmt(cell?.value, 0)}
                      </span>
                      {cell?.variance !== null && cell?.variance !== undefined && !cell?.suppressed ? (
                        <span className={`font-mono text-[8.5px] ${tone.text} opacity-80`}>{signed(cell.variance, 0)}</span>
                      ) : null}
                    </motion.div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Cohort tracker ───────────────────────────────────────────────────────────

function CohortPanel({ cohort, reduce }) {
  if (!cohort || cohort.movements.length === 0) return null
  const { summary, movements: moves, grade } = cohort
  const max = Math.max(...moves.map((m) => Math.abs(m.change ?? 0)), 1)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[
          { k: 'Prior year', v: fmt(summary.priorAverage.value) },
          { k: 'This year', v: fmt(summary.currentAverage.value) },
          { k: 'Cohort change', v: signed(summary.change), accent: (summary.change ?? 0) >= 0 },
          { k: 'Gained / declined', v: `${summary.gained} / ${summary.declined}` },
        ].map((c, i) => (
          <motion.div
            key={c.k}
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduce ? 0 : i * 0.06, duration: 0.4, ease: EASE }}
            className="rounded-xl border border-navy/10 bg-white px-3 py-2.5"
          >
            <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-muted">{c.k}</p>
            <p
              className={`mt-0.5 font-serif text-[20px] font-semibold tabular-nums ${
                c.accent === undefined ? 'text-navy' : c.accent ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {c.v}
            </p>
          </motion.div>
        ))}
      </div>

      <div className="space-y-1.5">
        {moves.map((m, i) => {
          const change = m.change ?? 0
          const tone = m.direction === 'gained' ? '#059669' : m.direction === 'declined' ? '#e11d48' : '#94a3b8'
          return (
            <div key={m.schoolId} className="flex items-center gap-2.5">
              <span className="w-[112px] shrink-0 truncate text-right text-[11.5px] text-muted" title={m.schoolName}>
                {m.schoolName}
              </span>
              <span className="w-24 shrink-0 text-center font-mono text-[10.5px] tabular-nums text-navy/70">
                {fmt(m.prior?.value, 0)} → {fmt(m.current?.value, 0)}
              </span>
              <div className="relative h-5 flex-1">
                <div className="absolute inset-y-0 left-1/2 w-px bg-navy/15" />
                <motion.div
                  initial={reduce ? false : { width: 0 }}
                  animate={{ width: `${(Math.abs(change) / max) * 46}%` }}
                  transition={{ duration: 0.6, ease: EASE, delay: reduce ? 0 : i * 0.05 }}
                  className="absolute inset-y-1 rounded"
                  style={{
                    background: tone,
                    left: change >= 0 ? '50%' : undefined,
                    right: change < 0 ? '50%' : undefined,
                  }}
                />
              </div>
              <span className="w-9 text-right text-[11.5px] font-bold tabular-nums" style={{ color: tone }}>
                {signed(change, 0)}
              </span>
            </div>
          )
        })}
      </div>
      <p className="text-[11.5px] text-muted">
        The same students, one year apart — they were in grade {Number(grade) - 1} last year.
      </p>
    </div>
  )
}

// ── Multi-year trend ─────────────────────────────────────────────────────────

/**
 * The school's line against the network's, year by year. Two lines and nothing
 * else: a trend chart earns its space by answering "are we moving, and are we
 * moving differently from everyone around us" — anything more is decoration.
 */
function TrendChart({ points, national, range, reduce }) {
  const usable = points.filter((p) => p.school !== null || p.peer !== null)
  if (usable.length < 2) {
    return (
      <p className="text-[12.5px] text-muted">
        One year on file — load a second year and the trend appears here.
      </p>
    )
  }
  const W = 640
  const H = 190
  const PAD = { l: 34, r: 12, t: 14, b: 24 }
  // Scale to the DATA (plus the national line and a little air), not to the
  // theoretical 1–99. A percentile axis pinned to its full range flattens every
  // real movement into a straight line — which is exactly the thing this chart
  // exists to show.
  const vals = usable.flatMap((p) => [p.school, p.peer]).filter((v) => v !== null)
  const anchors = national === null || national === undefined ? vals : [...vals, national]
  const rawLo = Math.min(...anchors)
  const rawHi = Math.max(...anchors)
  const pad = Math.max(2, (rawHi - rawLo) * 0.25)
  const lo = Math.max(range?.min ?? -Infinity, rawLo - pad)
  const hi = Math.min(range?.max ?? Infinity, rawHi + pad)
  const span = hi - lo || 1
  const x = (i) => PAD.l + (i / Math.max(1, usable.length - 1)) * (W - PAD.l - PAD.r)
  const y = (v) => PAD.t + (1 - (v - lo) / span) * (H - PAD.t - PAD.b)
  const path = (key) =>
    usable
      .map((p, i) => (p[key] === null ? null : `${i === 0 || usable[i - 1][key] === null ? 'M' : 'L'}${x(i)},${y(p[key])}`))
      .filter(Boolean)
      .join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="Score by year, school against the network">
      {national !== null && national !== undefined ? (
        <>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(national)} y2={y(national)} stroke="#e11d48" strokeWidth="1.2" strokeDasharray="5 4" />
          <text x={PAD.l + 2} y={y(national) - 4} fontSize="9" fontWeight="700" fill="#e11d48">
            National {national}
          </text>
        </>
      ) : null}
      <motion.path
        d={path('peer')}
        fill="none"
        stroke="#2563EB"
        strokeWidth="2"
        strokeDasharray="4 3"
        initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.8, ease: EASE }}
      />
      <motion.path
        d={path('school')}
        fill="none"
        stroke={HUE}
        strokeWidth="2.8"
        strokeLinejoin="round"
        initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, ease: EASE, delay: 0.1 }}
      />
      {usable.map((p, i) =>
        p.school === null ? null : (
          <g key={p.schoolYear}>
            <circle cx={x(i)} cy={y(p.school)} r="4" fill={HUE} stroke="#fff" strokeWidth="1.6" />
            <text x={x(i)} y={y(p.school) - 9} fontSize="10" fontWeight="700" textAnchor="middle" fill="#0f766e">
              {fmt(p.school, 0)}
            </text>
          </g>
        ),
      )}
      {usable.map((p, i) => (
        <text key={`x-${p.schoolYear}`} x={x(i)} y={H - 6} fontSize="10" textAnchor="middle" fill="#64748b">
          {p.schoolYear}
        </text>
      ))}
      <text x={PAD.l - 4} y={PAD.t + 6} fontSize="9" textAnchor="end" fill="#94a3b8">
        {Math.round(hi)}
      </text>
      <text x={PAD.l - 4} y={H - PAD.b} fontSize="9" textAnchor="end" fill="#94a3b8">
        {Math.round(lo)}
      </text>
    </svg>
  )
}

// ── Achievement distribution ─────────────────────────────────────────────────

const BAND_LABEL = {
  q1: 'Bottom quarter',
  q2: 'Lower middle',
  q3: 'Upper middle',
  q4: 'Top quarter',
}
const BAND_COLOR = { q1: '#e11d48', q2: '#f59e0b', q3: '#0ea5e9', q4: '#059669' }

/**
 * Where students actually sit, not just where the mean does. Two schools can
 * share an average while one has everybody near the middle and the other has a
 * quarter of its students in the bottom band — this is the chart that tells them
 * apart.
 */
function Distribution({ slices, reduce }) {
  const total = slices.reduce((acc, s) => acc + (s.count ?? 0), 0)
  if (total === 0) {
    return (
      <p className="text-[12.5px] text-muted">
        This file carried averages only — upload student-level results to see the spread.
      </p>
    )
  }
  return (
    <div className="space-y-3">
      <div className="flex h-8 overflow-hidden rounded-lg">
        {slices.map((s, i) => (
          <motion.div
            key={s.band}
            initial={reduce ? { width: `${(s.share ?? 0) * 100}%` } : { width: 0 }}
            animate={{ width: `${(s.share ?? 0) * 100}%` }}
            transition={{ duration: 0.7, ease: EASE, delay: reduce ? 0 : i * 0.08 }}
            style={{ background: BAND_COLOR[s.band] }}
            title={`${BAND_LABEL[s.band]}: ${s.count} students`}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {slices.map((s) => (
          <div key={s.band} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: BAND_COLOR[s.band] }} />
            <span className="text-[11.5px] text-muted">{BAND_LABEL[s.band]}</span>
            <span className="ml-auto text-[12px] font-bold tabular-nums text-navy">
              {s.count} · {Math.round((s.share ?? 0) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── The board table ──────────────────────────────────────────────────────────

/**
 * The table a board packet prints: every school, both years, the move, and the
 * gap to each reference. Sortable because the question changes — "who is
 * highest" and "who moved most" are different meetings.
 */
function ComparisonTable({ rows, scoreType }) {
  const [sort, setSort] = useState('current')
  const sorted = useMemo(() => {
    const copy = [...rows]
    if (sort === 'name') return copy.sort((a, b) => (a.schoolName ?? '').localeCompare(b.schoolName ?? ''))
    if (sort === 'change') return copy.sort((a, b) => (b.change ?? -Infinity) - (a.change ?? -Infinity))
    return copy.sort((a, b) => (b.current ?? -Infinity) - (a.current ?? -Infinity))
  }, [rows, sort])

  const th = 'px-2 py-1.5 text-right font-mono text-[9px] font-bold uppercase tracking-wider text-muted'
  const td = 'px-2 py-2 text-right text-[12.5px] tabular-nums'

  return (
    <div className="overflow-x-auto">
      <div className="mb-2 flex gap-1.5">
        {[
          ['current', 'Score'],
          ['change', 'Change'],
          ['name', 'A–Z'],
        ].map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setSort(k)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              sort === k ? 'text-white' : 'text-muted hover:text-navy'
            }`}
            style={sort === k ? { background: HUE } : { background: 'rgba(16,28,61,0.05)' }}
          >
            {l}
          </button>
        ))}
      </div>
      <table className="w-full min-w-[560px] border-collapse">
        <thead>
          <tr className="border-b border-navy/12">
            <th className={`${th} text-left`}>School</th>
            <th className={th}>This year</th>
            <th className={th}>Last year</th>
            <th className={th}>Change</th>
            <th className={th}>vs network</th>
            <th className={th}>vs national</th>
            <th className={th}>Tested</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.schoolId} className="border-b border-navy/[0.07] hover:bg-navy/[0.02]">
              <td className="px-2 py-2 text-left text-[12.5px] text-navy">
                {r.rank ? <span className="mr-1.5 font-mono text-[10px] text-muted">{r.rank}</span> : null}
                {r.schoolName}
              </td>
              <td className={`${td} font-bold text-navy`}>
                {r.forthcoming ? <span className="font-mono text-[10px] italic text-muted">forthcoming</span> : fmt(r.current, 0)}
              </td>
              <td className={`${td} text-muted`}>{fmt(r.prior, 0)}</td>
              <td className={td}>
                <ChangeBadge value={r.change} />
              </td>
              <td className={`${td} ${gapTone(r.vsNetwork)}`}>{signed(r.vsNetwork, 0)}</td>
              <td className={`${td} ${gapTone(r.vsNational)}`}>
                {scoreType === 'scale' ? '—' : signed(r.vsNational, 0)}
              </td>
              <td className={`${td} text-muted`}>{r.tested ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const gapTone = (v) => (v === null || v === undefined ? 'text-muted' : v > 0 ? 'text-emerald-700' : v < 0 ? 'text-rose-700' : 'text-muted')

function ChangeBadge({ value }) {
  if (value === null || value === undefined) return <span className="text-muted">—</span>
  const up = value > 0
  const flat = Math.abs(value) < 0.05
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-bold ${
        flat ? 'bg-navy/[0.06] text-navy/60' : up ? 'bg-emerald-500/12 text-emerald-700' : 'bg-rose-500/12 text-rose-700'
      }`}
    >
      {flat ? null : up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {signed(value, 0)}
    </span>
  )
}

// ── Section shell ────────────────────────────────────────────────────────────

function Section({ title, eyebrow, children, aside, delay = 0, reduce }) {
  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE, delay }}
      className="rounded-2xl border border-navy/10 bg-white p-5 shadow-[0_18px_44px_-30px_rgba(16,28,61,0.4)]"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          {eyebrow ? (
            <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em]" style={{ color: HUE }}>
              {eyebrow}
            </p>
          ) : null}
          <h3 className="mt-0.5 font-serif text-[19px] font-semibold text-navy">{title}</h3>
        </div>
        {aside}
      </div>
      {children}
    </motion.section>
  )
}

// ── The dashboard ────────────────────────────────────────────────────────────

export default function AssessmentDashboard({ data, onQuery, loading }) {
  const reduce = useReducedMotion()
  const [anonymous, setAnonymous] = useState(false)

  const ctx = data?.context
  const kpis = data?.kpis
  const subjects = ctx?.subjects ?? []

  const peerAvg = kpis?.average?.peer ?? null
  const rankText = kpis?.rank?.rank ? `${kpis.rank.rank} of ${kpis.rank.of}` : '—'

  const objectives = data?.objectives ?? { strengths: [], opportunities: [] }
  const hasObjectives = objectives.strengths.length > 0 || objectives.opportunities.length > 0

  const select = (patch) => onQuery?.(patch)

  const gradeOptions = useMemo(() => ['all', ...(ctx?.grades ?? [])], [ctx?.grades])

  if (data?.empty) {
    return (
      <div className="rounded-2xl border border-dashed border-navy/20 bg-white p-10 text-center">
        <Sparkles size={22} className="mx-auto mb-2" style={{ color: HUE }} />
        <p className="font-serif text-[19px] font-semibold text-navy">No assessment results yet</p>
        <p className="mx-auto mt-1.5 max-w-md text-[13.5px] text-muted">
          Upload a scores file — a diocesan summary or a student-level export — and this school appears
          beside its peers, grade by grade and subject by subject.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-navy/10 bg-white px-4 py-3">
        <span className="font-mono text-[9.5px] font-bold uppercase tracking-[0.16em] text-muted">View</span>
        <select
          value={ctx?.testType ?? ''}
          onChange={(e) => select({ testType: e.target.value })}
          className="rounded-lg border border-navy/15 bg-white px-2.5 py-1.5 text-[12.5px] text-navy"
        >
          {(ctx?.availableTestTypes ?? []).map((t) => (
            <option key={t} value={t}>
              {t.toUpperCase()}
            </option>
          ))}
        </select>
        <select
          value={ctx?.year ?? ''}
          onChange={(e) => select({ schoolYear: Number(e.target.value) })}
          className="rounded-lg border border-navy/15 bg-white px-2.5 py-1.5 text-[12.5px] text-navy"
        >
          {(ctx?.years ?? []).map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select
          value={ctx?.grade ?? 'all'}
          onChange={(e) => select({ gradeLevel: e.target.value })}
          className="rounded-lg border border-navy/15 bg-white px-2.5 py-1.5 text-[12.5px] text-navy"
        >
          {gradeOptions.map((g) => (
            <option key={g} value={g}>
              {g === 'all' ? 'All grades' : `Grade ${g}`}
            </option>
          ))}
        </select>
        {(data?.availableCohorts ?? []).length > 0 ? (
          <select
            value={data?.cohort?.grade ?? ''}
            onChange={(e) => select({ cohortGrade: e.target.value || undefined })}
            className="rounded-lg border border-navy/15 bg-white px-2.5 py-1.5 text-[12.5px] text-navy"
          >
            <option value="">Cohort…</option>
            {data.availableCohorts.map((c) => (
              <option key={`${c.currentYear}-${c.currentGrade}`} value={c.currentGrade}>
                Grade {c.currentGrade} cohort
              </option>
            ))}
          </select>
        ) : null}
        <label className="ml-auto flex items-center gap-1.5 text-[12px] text-muted">
          <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
          Hide peer names
        </label>
        {loading ? <span className="text-[11.5px] text-muted">Updating…</span> : null}
      </div>

      {/* ── KPI strip ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Average score"
          value={fmt(kpis?.average?.value)}
          sub={`Network ${fmt(peerAvg)} · ${ctx?.scoreType === 'percentile' ? 'national percentile' : 'scale score'}`}
          chip={<VarianceChip variance={kpis?.average?.variance} standing={kpis?.average?.standing} />}
          delay={0}
          reduce={reduce}
        />
        <KpiCard
          title="Rank in network"
          value={rankText}
          sub={`${ctx?.peerCount ?? 0} peer school${ctx?.peerCount === 1 ? '' : 's'}`}
          delay={0.06}
          reduce={reduce}
        />
        <KpiCard
          title="Year over year"
          value={signed(kpis?.yoy)}
          sub={data?.trendDirection ? `Trend: ${data.trendDirection}` : null}
          delay={0.12}
          reduce={reduce}
        />
        <KpiCard
          title="Participation"
          value={kpis?.participation?.rate === null || kpis?.participation?.rate === undefined ? '—' : `${Math.round(kpis.participation.rate * 100)}%`}
          sub={
            kpis?.participation?.comparable
              ? 'In line with peers — comparison is fair'
              : kpis?.participation?.peerRate
                ? `Peers ${Math.round(kpis.participation.peerRate * 100)}% — read with care`
                : null
          }
          delay={0.18}
          reduce={reduce}
        />
      </div>

      {/* ── Key insight ── */}
      {data?.keyInsight ? (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.22 }}
          className="relative overflow-hidden rounded-2xl px-5 py-4"
          style={{ background: `linear-gradient(135deg, ${HUE}14, rgba(37,99,235,0.06))`, border: `1px solid ${HUE}33` }}
        >
          <div className="flex gap-3">
            <Sparkles size={17} className="mt-0.5 shrink-0" style={{ color: HUE }} />
            <p className="font-serif text-[15.5px] leading-relaxed text-navy">{data.keyInsight}</p>
          </div>
        </motion.div>
      ) : null}

      {/* ── Ranked schools ── */}
      <Section
        eyebrow="Where this school stands"
        title={`Every school · ${ctx?.grade === 'all' ? 'all grades' : `grade ${ctx?.grade}`}`}
        reduce={reduce}
        aside={
          <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: `${HUE}18`, color: HUE }}>
            Rank {rankText}
          </span>
        }
      >
        <RankedSchools
          schools={data?.schools ?? []}
          anonymous={anonymous ? data?.peersAnonymous : null}
          focusId={data?.school?.id}
          national={ctx?.nationalReference}
          peerAvg={peerAvg}
          range={ctx?.scoreRange}
          reduce={reduce}
        />
      </Section>

      {/* ── Subjects + heatmap ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section eyebrow="By subject" title="School vs the network" reduce={reduce}>
          <div className="space-y-2">
            {(data?.subjects ?? [])
              .filter((s) => s.value !== null)
              .map((s, i) => {
                const tone = STANDING_TONE[s.standing]
                const max = ctx?.scoreRange?.max ?? 100
                return (
                  <div key={s.subject} className="flex items-center gap-2.5">
                    <span className="w-24 shrink-0 text-right text-[11.5px] text-muted">{label(s.subject)}</span>
                    <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-navy/[0.05]">
                      {s.peer !== null ? (
                        <div
                          className="absolute inset-y-0 z-10 border-l-2 border-dashed border-[#2563EB]"
                          style={{ left: `${(s.peer / max) * 100}%` }}
                          title={`Network ${fmt(s.peer)}`}
                        />
                      ) : null}
                      <motion.div
                        initial={reduce ? { width: `${(s.value / max) * 100}%` } : { width: 0 }}
                        animate={{ width: `${(s.value / max) * 100}%` }}
                        transition={{ duration: 0.7, ease: EASE, delay: reduce ? 0 : 0.05 + i * 0.05 }}
                        className="h-full rounded-md"
                        style={{ background: `linear-gradient(90deg, ${tone.dot}, ${tone.dot}99)` }}
                      />
                    </div>
                    <span className="w-9 text-right text-[12px] font-semibold tabular-nums text-navy">{fmt(s.value, 0)}</span>
                    <span className={`w-11 text-right font-mono text-[10.5px] font-bold ${tone.text}`}>
                      {signed(s.variance, 0)}
                    </span>
                  </div>
                )
              })}
          </div>
        </Section>

        <Section eyebrow="Grade by grade" title="Where instruction is landing" reduce={reduce} delay={0.05}>
          <Heatmap cells={data?.heatmap ?? []} subjects={subjects} reduce={reduce} />
          <p className="mt-2 text-[11px] text-muted">
            Each cell compares that grade with the SAME grade at other schools — the only comparison that means
            anything. Cells under five students show &lt;5.
          </p>
        </Section>
      </div>

      {/* ── Trend + distribution ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section eyebrow="Across the years" title="Are we moving?" reduce={reduce}>
          <TrendChart
            points={data?.trend ?? []}
            national={ctx?.nationalReference}
            range={ctx?.scoreRange}
            reduce={reduce}
          />
          <p className="mt-1 flex items-center gap-3 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-0.5 w-4" style={{ background: HUE }} /> This school
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-[#2563EB]" /> Network
            </span>
          </p>
        </Section>

        <Section eyebrow="The spread" title="Where students actually sit" reduce={reduce} delay={0.05}>
          <Distribution slices={data?.distribution ?? []} reduce={reduce} />
        </Section>
      </div>

      {/* ── The board table ── */}
      {(data?.table ?? []).length > 0 ? (
        <Section
          eyebrow="Board-ready"
          title="Every school, both years"
          reduce={reduce}
          aside={
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
              {ctx?.grade === 'all' ? 'All grades' : `Grade ${ctx?.grade}`}
            </span>
          }
        >
          <ComparisonTable rows={data.table} scoreType={ctx?.scoreType} />
        </Section>
      ) : null}

      {/* ── Cohort ── */}
      {data?.cohort ? (
        <Section
          eyebrow="Longitudinal cohort"
          title={`The same students, followed into grade ${data.cohort.grade}`}
          reduce={reduce}
          aside={<Users2 size={16} className="text-muted" />}
        >
          <CohortPanel cohort={data.cohort} reduce={reduce} />
        </Section>
      ) : null}

      {/* ── Movement ── */}
      {(data?.movements ?? []).length > 0 ? (
        <Section eyebrow="Year over year" title="Who moved, and which way" reduce={reduce}>
          <div className="space-y-1.5">
            {data.movements.map((m, i) => {
              const tone = m.direction === 'improved' ? '#059669' : m.direction === 'declined' ? '#e11d48' : '#94a3b8'
              return (
                <motion.div
                  key={m.schoolId}
                  initial={reduce ? false : { opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: reduce ? 0 : i * 0.04, duration: 0.35 }}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-navy/[0.03]"
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: tone }} />
                  <span className="flex-1 truncate text-[12.5px] text-navy">{m.schoolName}</span>
                  <span className="font-mono text-[11px] tabular-nums text-muted">
                    {fmt(m.prior, 0)} → {fmt(m.current, 0)}
                  </span>
                  <span className="w-10 text-right text-[12px] font-bold tabular-nums" style={{ color: tone }}>
                    {signed(m.change, 0)}
                  </span>
                  {m.belowNational ? (
                    <Flag size={12} className="text-rose-600" title="Below the national midpoint" />
                  ) : (
                    <span className="w-3" />
                  )}
                </motion.div>
              )
            })}
          </div>
        </Section>
      ) : null}

      {/* ── Objectives ── */}
      {hasObjectives ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section eyebrow="Strengths" title="What this school does well" reduce={reduce}>
            <ObjectiveList items={objectives.strengths} tone="strong" />
          </Section>
          <Section eyebrow="Opportunities" title="Where to put the next hour" reduce={reduce} delay={0.05}>
            <ObjectiveList items={objectives.opportunities} tone="below" />
          </Section>
        </div>
      ) : null}

      {/* ── System insights ── */}
      {data?.insights?.top ? (
        <Section eyebrow="The network" title="Top, bottom and the spread between" reduce={reduce}>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { k: 'Highest', v: data.insights.top?.schoolName, n: data.insights.top?.value, Icon: Award, color: '#059669' },
              { k: 'Lowest', v: data.insights.bottom?.schoolName, n: data.insights.bottom?.value, Icon: TrendingDown, color: '#e11d48' },
              { k: 'Spread', v: 'Top to bottom', n: data.insights.spread, Icon: ChevronRight, color: '#64748b' },
            ].map((c) => (
              <div key={c.k} className="rounded-xl border border-navy/10 px-3 py-2.5">
                <p className="flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-muted">
                  <c.Icon size={11} style={{ color: c.color }} /> {c.k}
                </p>
                <p className="mt-0.5 truncate text-[13px] font-semibold text-navy">{c.v ?? '—'}</p>
                <p className="font-serif text-[18px] tabular-nums" style={{ color: c.color }}>
                  {fmt(c.n)}
                </p>
              </div>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  )
}

function ObjectiveList({ items, tone }) {
  const t = STANDING_TONE[tone]
  if (items.length === 0) return <p className="text-[12.5px] text-muted">No objective-level data in this file.</p>
  return (
    <div className="space-y-1.5">
      {items.map((o) => (
        <div key={`${o.subject}-${o.objectiveLabel}-${o.grade}`} className="flex items-center gap-2.5">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full`} style={{ background: t.dot }} />
          <span className="flex-1 truncate text-[12.5px] text-navy" title={o.objectiveLabel}>
            {o.objectiveLabel}
          </span>
          <span className="font-mono text-[10px] text-muted">
            {label(o.subject)} · gr {o.grade}
          </span>
          <span className={`w-9 text-right text-[12px] font-bold tabular-nums ${t.text}`}>{fmt(o.opi, 0)}</span>
          <span className={`w-10 text-right font-mono text-[10px] ${t.text}`}>{signed(o.variance, 0)}</span>
        </div>
      ))}
    </div>
  )
}
