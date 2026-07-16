// ─────────────────────────────────────────────────────────────────────────────
// OrgModulesMatrix — the "which modules are unlocked for which school" view for
// the organization popup. A per-school × per-module grid: rows are the org's
// schools, columns are the opt-in add-on modules (Core + Finance are included
// for every school, so they're stated once, not matrixed). Each cell is a check
// (unlocked) or a muted dash (locked); a paused subscription is flagged.
//
// Data: there's no aggregate endpoint, but the org owner has membership in every
// in-org school, so we fetch each school's billing (billingApi.get) in parallel
// and read its resolved `licensedModules`. Fail-soft per school (a 403/aborted
// fetch renders as unknown "—" rather than blocking the whole grid).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
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
import { MODULE_META } from '../../lib/modules.js'

// The opt-in add-ons, in a sensible reading order (Core + Finance are always-on
// and shown as a note, not a column). Icons mirror the app's module glyphs.
const ADDON_COLUMNS = [
  { key: 'governance', Icon: Landmark },
  { key: 'accreditation', Icon: BadgeCheck },
  { key: 'facilities', Icon: Wrench },
  { key: 'advancement', Icon: HeartHandshake },
  { key: 'enrollment', Icon: GraduationCap },
  { key: 'hr', Icon: Users },
  { key: 'strategy', Icon: Target },
  { key: 'planning', Icon: LineChart },
]

function shortLabel(key) {
  const label = MODULE_META[key]?.label ?? key
  // Trim the long ones so the column header stays compact.
  return { hr: 'HR', planning: 'Planning', strategy: 'Strategy' }[key] ?? label
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

  if (schools.length === 0) {
    return (
      <div className="card-soft border-dashed px-6 py-10 text-center">
        <p className="text-[15px] italic text-muted">No schools in this organization yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-xl border border-gold/25 bg-gold/[0.05] px-3.5 py-2.5 text-[13px] text-navy">
        <ShieldCheck size={15} className="shrink-0 text-gold" />
        <span>
          <span className="font-semibold">Core</span> and <span className="font-semibold">Finance</span> are
          the base plan for every active school. This grid shows the optional add-on modules each school has
          unlocked.
        </span>
      </div>

      <div className="card-soft overflow-x-auto p-0">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-hair">
              <th className="sticky left-0 z-10 bg-white px-4 py-3 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                School
              </th>
              {ADDON_COLUMNS.map(({ key, Icon }) => (
                <th
                  key={key}
                  title={MODULE_META[key]?.label ?? key}
                  className="px-2 py-3 text-center align-bottom"
                >
                  <span className="flex flex-col items-center gap-1">
                    <Icon size={15} className="text-navy/70" aria-hidden />
                    <span className="text-[10.5px] font-bold uppercase tracking-[0.04em] text-muted">
                      {shortLabel(key)}
                    </span>
                  </span>
                </th>
              ))}
              <th className="px-3 py-3 text-center text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                Add-ons
              </th>
            </tr>
          </thead>
          <tbody>
            {schools.map((s, rowIdx) => {
              const info = billingBySchool[s.schoolId]
              const isLoading = loading && info === undefined
              const errored = info === 'error'
              const paused = info && info !== 'error' && !info.entitled
              const keys = info && info !== 'error' ? info.keys : null
              const count = keys ? ADDON_COLUMNS.filter((c) => keys.has(c.key)).length : 0
              return (
                <tr
                  key={s.schoolId}
                  className="border-b border-hair/60 last:border-0 hover:bg-navy/[0.02]"
                >
                  <th className="sticky left-0 z-10 bg-white px-4 py-3 text-left align-middle">
                    <span className="block truncate font-serif text-[15px] font-semibold text-navy">
                      {s.name}
                    </span>
                    {paused && (
                      <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-amber-700">
                        No active plan
                      </span>
                    )}
                  </th>
                  {ADDON_COLUMNS.map(({ key }) => {
                    const unlocked = keys ? keys.has(key) : false
                    return (
                      <td key={key} className="px-2 py-3 text-center align-middle">
                        {isLoading ? (
                          <span className="mx-auto block h-5 w-5 animate-pulse rounded-full bg-navy/10" />
                        ) : errored ? (
                          <span className="text-[13px] text-muted/50">—</span>
                        ) : unlocked ? (
                          <motion.span
                            initial={reduce ? false : { scale: 0.6, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: reduce ? 0 : rowIdx * 0.02, type: 'spring', stiffness: 400, damping: 22 }}
                            className="mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-[#2563eb] text-white shadow-[0_2px_8px_-2px_rgba(37,99,235,0.6)]"
                            title="Unlocked"
                          >
                            <Check size={14} strokeWidth={3} />
                          </motion.span>
                        ) : (
                          <span
                            className="mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-navy/[0.04] text-navy/25"
                            title="Locked"
                          >
                            <Lock size={12} />
                          </span>
                        )}
                      </td>
                    )
                  })}
                  <td className="px-3 py-3 text-center align-middle">
                    {isLoading || errored ? (
                      <span className="text-[13px] text-muted/50">—</span>
                    ) : (
                      <span
                        className={`inline-flex h-6 min-w-[2.75rem] items-center justify-center rounded-full px-2 text-[12.5px] font-bold tabular-nums ${
                          count > 0 ? 'bg-[#2563eb]/10 text-[#2563eb]' : 'bg-navy/[0.05] text-muted'
                        }`}
                      >
                        {count}/{ADDON_COLUMNS.length}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
