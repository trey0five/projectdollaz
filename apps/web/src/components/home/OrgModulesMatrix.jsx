// ─────────────────────────────────────────────────────────────────────────────
// OrgModulesMatrix — the "which modules are unlocked for which school" view for
// the organization popup. A per-school × per-module grid: rows are the org's
// schools, columns are the opt-in add-on modules (Core + Finance are included
// for every school, so they're stated once, not matrixed). Each cell is a check
// (unlocked) or a quiet lock (locked); a paused subscription is flagged.
//
// Data: there's no aggregate endpoint, but the org owner has membership in every
// in-org school, so we fetch each school's billing (billingApi.get) in parallel
// and read its resolved `licensedModules`. Fail-soft per school (a 403/aborted
// fetch renders as unknown "—" rather than blocking the whole grid).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  BookOpen,
  BadgeCheck,
  Check,
  GraduationCap,
  HeartHandshake,
  Landmark,
  LineChart,
  Lock,
  ShieldCheck,
  Target,
  Users,
  Wrench,
} from 'lucide-react'
import { billingApi } from '../../lib/api.js'
import DataTable from '../ui/surface/DataTable.jsx'
import { MODULE_META } from '../../lib/modules.js'

// The opt-in add-ons, in a sensible reading order (Core + Finance are always-on
// and shown as a note, not a column). Icons mirror the app's module glyphs.
//
// EVERY SELLABLE MODULE BELONGS HERE. This list is hand-maintained, so a new
// module is invisible in the grid until someone remembers — academics shipped
// and no school could be seen holding it, which also understated each row's
// add-on count. The spec below the component pins it against MODULE_META.
const ADDON_COLUMNS = [
  { key: 'governance', Icon: Landmark },
  { key: 'accreditation', Icon: BadgeCheck },
  { key: 'facilities', Icon: Wrench },
  { key: 'advancement', Icon: HeartHandshake },
  { key: 'enrollment', Icon: GraduationCap },
  { key: 'hr', Icon: Users },
  { key: 'strategy', Icon: Target },
  { key: 'planning', Icon: LineChart },
  { key: 'academics', Icon: BookOpen },
]

function shortLabel(key) {
  const label = MODULE_META[key]?.label ?? key
  // Trim the long ones so the column header stays compact.
  return { hr: 'HR', planning: 'Planning', strategy: 'Strategy', academics: 'Academics' }[key] ?? label
}

export default function OrgModulesMatrix({ schools = [] }) {
  const reduce = useReducedMotion()
  // schoolId -> { entitled, keys:Set } | 'error' | undefined(loading)
  const [billingBySchool, setBillingBySchool] = useState({})
  const [loading, setLoading] = useState(true)

  const ids = useMemo(() => schools.map((s) => s.schoolId).filter(Boolean), [schools])
  const idsKey = ids.join(',')

  useEffect(() => {
    if (ids.length === 0) {
      setLoading(false)
      return undefined
    }
    let cancelled = false
    setLoading(true)
    Promise.all(
      ids.map((id) =>
        billingApi
          .get(id)
          .then((res) => {
            const b = res?.data ?? res
            return [id, { entitled: !!b?.entitled, keys: new Set((b?.licensedModules ?? []).map((m) => m.key)) }]
          })
          .catch(() => [id, 'error']),
      ),
    ).then((pairs) => {
      if (cancelled) return
      setBillingBySchool(Object.fromEntries(pairs))
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [idsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Premium UI P4: the grid is a DataTable on the ground (sticky school column,
  // sticky caps header, hairline rows) — no card shell, no filled check discs.
  // Unlocked = an ink-blue check; locked = a quiet lock; the count is tabular.
  const rows = schools.map((s) => {
    const info = billingBySchool[s.schoolId]
    const keys = info && info !== 'error' ? info.keys : null
    return {
      id: s.schoolId,
      name: s.name,
      isLoading: loading && info === undefined,
      errored: info === 'error',
      paused: !!(info && info !== 'error' && !info.entitled),
      keys,
      count: keys ? ADDON_COLUMNS.filter((c) => keys.has(c.key)).length : null,
    }
  })

  const cell = (row, key) => {
    if (row.isLoading) return <span className="shimmer-bar mx-auto block h-2.5 w-4 rounded-sm" aria-label="Loading" />
    if (row.errored) return <span className="text-ink2/50">—</span>
    const unlocked = row.keys?.has(key)
    return unlocked ? (
      <motion.span
        initial={reduce ? false : { opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        className="inline-flex text-[#2563eb]"
        title="Unlocked"
      >
        <Check size={16} strokeWidth={2.5} aria-hidden="true" />
        <span className="sr-only">Unlocked</span>
      </motion.span>
    ) : (
      <span className="inline-flex text-ink/30" title="Locked">
        <Lock size={13} aria-hidden="true" />
        <span className="sr-only">Locked</span>
      </span>
    )
  }

  const columns = [
    {
      key: 'name',
      header: 'School',
      sortable: true,
      sortValue: (r) => r.name,
      render: (r) => (
        <span className="flex min-w-0 flex-col py-1">
          <span className="max-w-[10.5rem] break-words text-[14px] font-semibold leading-[18px] text-ink sm:max-w-[16rem]">{r.name}</span>
          {r.paused && (
            <span className="pill pill-status tone-watch mt-0.5 self-start">
              <i className="pill-mark" aria-hidden="true" />
              No active plan
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'count',
      header: 'Add-ons',
      num: true,
      headerClassName: '!pl-1.5',
      sortable: true,
      sortValue: (r) => r.count,
      render: (r) =>
        r.isLoading || r.errored ? (
          <span className="text-ink2/50">—</span>
        ) : (
          <span className="tabular-nums">
            <span className="font-semibold text-ink">{r.count}</span>
            <span className="text-ink2">/{ADDON_COLUMNS.length}</span>
          </span>
        ),
    },
    ...ADDON_COLUMNS.map(({ key, Icon }) => ({
      key,
      header: (
        <span className="flex flex-col items-center gap-1" title={MODULE_META[key]?.label ?? key}>
          <Icon size={14} className="text-ink2" aria-hidden="true" />
          <span>{shortLabel(key)}</span>
        </span>
      ),
      // Tight module columns: the caps headers (ACCREDITATION, ADVANCEMENT) at
      // the table's default 12px padding and 0.08em tracking pushed the grid
      // past its wrap at 1280/1440 — the matrix must fit a desktop without
      // sideways scroll. (`!` — the .dt thead th rule out-ranks a bare utility.)
      headerClassName: 'text-center !px-1.5 !tracking-normal',
      className: 'text-center !px-1',
      render: (r) => cell(r, key),
    })),
  ]

  return (
    <div>
      <p className="sec-note mb-3 mt-0 flex items-start gap-2">
        <ShieldCheck size={14} className="mt-0.5 shrink-0 text-ink2" aria-hidden="true" />
        <span>
          <span className="font-semibold text-ink">Core</span> and{' '}
          <span className="font-semibold text-ink">Finance</span> are the base plan for every active school.
          This grid shows the optional add-on modules each school has unlocked.
        </span>
      </p>
      <DataTable
        className="dt-sticky"
        columns={columns}
        rows={rows}
        rowKey="id"
        empty="No schools in this organization yet."
        caption="Add-on modules unlocked per school"
      />
    </div>
  )
}
