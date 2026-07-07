// ─────────────────────────────────────────────────────────────────────────────
// DomainCommandCenter — the REUSABLE shell for a "domain command center" page
// (Governance today; Facilities, Advancement, Accreditation next). A domain lands
// on its slice of the briefing — the metrics that define its health (KPI row), the
// items that need a decision (attention rail), and one-click actions — with the
// registers a tab away. LIGHT theme (matches the Finance home), navy/gold.
//
// Presentational: the parent computes every number/item and owns the tables and
// modals. This component only lays out header + KPI row + two-column body + footer.
//
// Props
//   eyebrow          string — small uppercase muted eyebrow above the title
//   title            string — big serif navy page title
//   Icon             lucide component — the domain glyph in the header badge
//   attentionCount   number — count behind the header pill (0 → "all clear")
//   kpis             array of { label, value, sub:{icon,text,tone}, status }
//   tabs             array of { key, label } — the register tabs
//   activeTab        string — the active tab key
//   onTabChange      (key) => void
//   onNew            () => void | null — opens create for the active register
//                    (null hides the +New button)
//   registerTable    node — the active register's table (parent renders it)
//   attentionItems   array of { id, tone, title, why, actions:[{label,onClick,primary}] }
//   headerAside      node | null — extra header controls rendered to the LEFT of the
//                    attention pill (e.g. an "as of" chip + Refresh button). Optional;
//                    omitting it leaves the header byte-identical for existing callers.
//   beforeBody       node | null — a full-width block rendered BETWEEN the KPI row and
//                    the two-column body (e.g. Cash & Collections' aging bars). Optional.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { Plus } from 'lucide-react'
import DomainKpiCard from './DomainKpiCard.jsx'
import NeedsAttentionPanel from './NeedsAttentionPanel.jsx'

function AttentionPill({ count }) {
  const clear = !count
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${
        clear ? 'bg-emerald-50 text-emerald-700' : 'bg-danger/10 text-danger'
      }`}
    >
      <span
        aria-hidden
        className={`inline-block h-2 w-2 rounded-full ${clear ? 'bg-emerald-500' : 'bg-danger'}`}
      />
      {clear ? 'all clear' : `${count} need${count === 1 ? 's' : ''} a decision`}
    </span>
  )
}

export default function DomainCommandCenter({
  eyebrow,
  title,
  Icon,
  attentionCount = 0,
  kpis = [],
  tabs = [],
  activeTab,
  onTabChange,
  onNew,
  registerTable,
  attentionItems = [],
  headerAside = null,
  beforeBody = null,
}) {
  const reduce = useReducedMotion()

  return (
    <div className="mx-auto max-w-[1180px] space-y-6 px-4 py-6 sm:px-10 sm:py-8">
      {/* ── Header row ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          {Icon ? (
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-gradient text-navy shadow-glow">
              <Icon size={22} />
            </span>
          ) : null}
          <div>
            {eyebrow ? (
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-muted">
                {eyebrow}
              </p>
            ) : null}
            <h1 className="font-serif text-2xl font-semibold text-navy sm:text-[30px]">{title}</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {headerAside}
          <AttentionPill count={attentionCount} />
        </div>
      </div>

      {/* ── KPI card row ───────────────────────────────────────────────────── */}
      {kpis.length ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {kpis.map((kpi, i) => (
            <DomainKpiCard
              key={kpi.label}
              label={kpi.label}
              value={kpi.value}
              sub={kpi.sub}
              status={kpi.status}
              index={i}
            />
          ))}
        </div>
      ) : null}

      {/* ── Optional full-width block between the KPI row and the body ──────── */}
      {beforeBody}

      {/* ── Two-column body ────────────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* LEFT — the register (tabs + active table). min-w-0 lets a wide register
            (e.g. Cash & Collections' aging table) scroll inside its own
            overflow-x-auto instead of pushing the page body horizontally. */}
        <div className="card-soft flex min-w-0 flex-col p-4 sm:p-5 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1">
              {tabs.map((t) => {
                const active = t.key === activeTab
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => onTabChange?.(t.key)}
                    className={`relative px-3 py-2 text-[14px] font-semibold transition-colors ${
                      active ? 'text-navy' : 'text-muted hover:text-navy'
                    }`}
                  >
                    {t.label}
                    {active ? (
                      <motion.span
                        layoutId={reduce ? undefined : 'domain-tab-underline'}
                        className="absolute inset-x-2 -bottom-[1px] h-[3px] rounded-full bg-gold-gradient"
                      />
                    ) : null}
                  </button>
                )
              })}
            </div>
            {onNew ? (
              <button
                type="button"
                onClick={onNew}
                className="inline-flex items-center gap-1.5 rounded-full bg-gold-gradient px-3.5 py-1.5 text-[13px] font-semibold text-navy shadow-glow transition hover:brightness-105"
              >
                <Plus size={15} /> New
              </button>
            ) : null}
          </div>
          {registerTable}
        </div>

        {/* RIGHT — needs attention */}
        <div className="lg:col-span-1">
          <NeedsAttentionPanel items={attentionItems} />
        </div>
      </div>

      {/* ── Footer caption ─────────────────────────────────────────────────── */}
      <p className="text-[12.5px] leading-relaxed text-muted">
        Command center, not a table — a domain lands on its slice of the briefing (the metrics that
        define its health, the items that need a decision, and one-click actions), with the
        registers a tab away.
      </p>
    </div>
  )
}
