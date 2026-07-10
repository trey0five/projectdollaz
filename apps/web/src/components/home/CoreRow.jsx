// ─────────────────────────────────────────────────────────────────────────────
// CoreRow — the small always-on utility tiles under the module map: Ask Penny ·
// Tasks · Data · Knowledge · Reports · Settings. Quieter than the module tiles
// (no flood — a plain lift/tint hover), same Link + aria pattern. Hue-tinted
// icon chips; Penny's is HER gold (a literal hex — the generic gold token goes
// blue in v2, Penny's color must not). Tasks shows the open-attention count from
// the SAME briefing payload as everything else (source 'workflow'); no other
// tile invents a number. Reports hides when finance is unlicensed (its route is
// finance-gated). Data stays for Phase B — it's still where data entry lives.
// There is no "open the coin" window event (penny:ai-ask requires text), so Ask
// Penny links to the /penny studio.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Bot, ListChecks, Database, Library, FileBarChart2, Settings } from 'lucide-react'

const PENNY_GOLD = '#E3A93C'

const CORE_ITEMS = [
  { key: 'penny', label: 'Ask Penny', to: '/penny', Icon: Bot, hue: PENNY_GOLD },
  { key: 'tasks', label: 'Tasks', to: '/tasks', Icon: ListChecks, hue: '#2563EB' },
  { key: 'data', label: 'Data', to: '/data', Icon: Database, hue: '#38BDF8' },
  { key: 'knowledge', label: 'Knowledge', to: '/knowledge', Icon: Library, hue: '#7C3AED' },
  { key: 'reports', label: 'Reports', to: '/reports', Icon: FileBarChart2, hue: '#4F46E5', module: 'finance' },
  { key: 'settings', label: 'Settings', to: '/settings', Icon: Settings, hue: '#64748B' },
]

export default function CoreRow({ hasModule, taskCount = 0 }) {
  const reduce = useReducedMotion()
  const items = CORE_ITEMS.filter((i) => !i.module || hasModule(i.module) !== false)

  return (
    <nav aria-label="Core">
      <ul role="list" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {items.map((item, i) => {
          const { key, label, to, Icon, hue } = item
          const count = key === 'tasks' ? taskCount : 0
          return (
            <motion.li
              key={key}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.04, duration: 0.3 }}
              whileHover={reduce ? undefined : { y: -3 }}
              className="list-none"
            >
              <Link
                to={to}
                id={`tile-core-${key}`}
                aria-label={count > 0 ? `${label} — ${count} open` : label}
                className="group flex h-full items-center gap-3 rounded-2xl border border-navy/10 bg-white px-4 py-3.5 shadow-card outline-none transition-all hover:shadow-lg focus-visible:ring-2 focus-visible:ring-navy/40"
                style={{ '--core-hue': hue }}
              >
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors"
                  style={{
                    background: 'color-mix(in srgb, var(--core-hue) 12%, transparent)',
                    color: hue,
                  }}
                >
                  <Icon size={19} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-navy">
                  {label}
                </span>
                {count > 0 && (
                  <span
                    aria-hidden="true"
                    className="flex h-[20px] min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white"
                    style={{ background: hue }}
                  >
                    {count}
                  </span>
                )}
              </Link>
            </motion.li>
          )
        })}
      </ul>
    </nav>
  )
}
