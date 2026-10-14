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
// Premium UI P3: the header is a `PageHeader` (eyebrow / serif title / meta /
// actions on a hairline), the KPI row a `StatStrip` of `DomainKpiCard` Stats,
// the register a `Section` on the ground (ink tabs, the +New button in the
// label row's aside), the rail a `Panel tone="attention"`. Props, the
// "Needs attention" semantics and every id are unchanged, so the ten domain
// pages that compose this move for free.
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
//   aboveKpis        node | null — a full-width HERO block rendered BETWEEN the header
//                    and the KPI row (e.g. Accreditation's readiness dial). Optional;
//                    omitting it leaves existing callers byte-identical.
//   registerTitle    string | null — heading shown in place of the tab bar when a
//                    domain has ≤1 register tab (a single-entry tab bar is dead
//                    chrome). Defaults to the lone tab's label. Optional.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { Plus } from 'lucide-react'
import DomainKpiCard from './DomainKpiCard.jsx'
import NeedsAttentionPanel from './NeedsAttentionPanel.jsx'
import BackLink from '../ui/BackLink.jsx'
import { AddDataCta, RecordsCta } from '../module/ModuleCtas.jsx'
import { PageHeader, StatStrip, Section, Pill, Button } from '../ui/surface/index.js'

function AttentionPill({ count }) {
  const clear = !count
  return (
    <Pill variant="status" tone={clear ? 'good' : 'risk'}>
      {clear ? 'all clear' : `${count} need${count === 1 ? 's' : ''} a decision`}
    </Pill>
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
  attentionMoreCount = 0,
  attentionOnMore = null,
  headerAside = null,
  beforeBody = null,
  aboveKpis = null,
  showBack = false,
  registerTitle = null,
  // Module pages set this to surface the Add-data + Records entries ON the page
  // (mirroring the sidebar tabs via relative ?tab= links). Standalone domains
  // (Cash/Tasks/Knowledge) have no such tabs and leave it off. `moduleKey` lets
  // RecordsCta self-hide for modules with no records tab (hr, planning).
  showAddData = false,
  moduleKey = null,
  /**
   * Give the register the FULL page width and drop the needs-attention rail
   * beneath it. For dense registers whose columns do not fit in two thirds —
   * see the body comment below. Off by default: every other domain page was
   * designed around the two-column shape.
   */
  wideRegister = false,
}) {
  const reduce = useReducedMotion()

  return (
    <div className="mx-auto max-w-page px-4 py-6 sm:px-10 sm:py-8">
      {/* Back to the dashboard — shown for standalone (non-module) domain pages
          like Cash / Tasks / Knowledge that aren't wrapped in ModuleTabs (which
          carries its own back link). */}
      {showBack ? <BackLink className="mb-2" /> : null}
      {/* ── Header: eyebrow / title / the attention pill as meta / actions ──── */}
      <PageHeader
        eyebrow={eyebrow}
        title={
          <span className="inline-flex items-center gap-3">
            {Icon ? <Icon size={26} strokeWidth={1.75} className="shrink-0 text-navy-soft" aria-hidden="true" /> : null}
            {title}
          </span>
        }
        actions={
          <>
            {headerAside}
            {showAddData ? (
              <>
                <RecordsCta module={moduleKey} />
                <AddDataCta />
              </>
            ) : null}
          </>
        }
      >
        <div className="pg-meta">
          <AttentionPill count={attentionCount} />
        </div>
      </PageHeader>

      {/* ── Optional full-width hero between the header and the KPI row ─────── */}
      {aboveKpis ? <div className="mt-6">{aboveKpis}</div> : null}

      {/* ── KPI strip ────────────────────────────────────────────────────────
          COLUMN WIDTH IS THE NO-CLIP CONTRACT. A dense strip is what cut text
          off: six columns at 1280 leave ~96px for a 30px value, so ordinary
          words broke mid-word ("None sched|uled"). The strip therefore never
          goes 6-up below xl: the dense sets step 3 → 4 (xl:grid-cols-4), which
          keeps ≥170px of content at every width from 1024 up. Fix the column,
          not the font (card contract §5.3). ── */}
      {kpis.length ? (
        <StatStrip
          cols={kpis.length}
          className={`stats-wrap mt-2 grid-cols-2 ${
            kpis.length >= 6
              ? 'sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4'
              : kpis.length >= 5
                ? 'sm:grid-cols-3 lg:grid-cols-3 2xl:grid-cols-5'
                : 'lg:grid-cols-4'
          }`}
        >
          {kpis.map((kpi) => (
            <DomainKpiCard key={kpi.label} label={kpi.label} value={kpi.value} sub={kpi.sub} status={kpi.status} />
          ))}
        </StatStrip>
      ) : null}

      {/* ── Optional full-width block between the KPI row and the body ──────── */}
      {beforeBody ? <div className="mt-6">{beforeBody}</div> : null}

      {/* ── Body: two columns, or a full-width register with the rail beneath ──
          WHY THE OPT-OUT EXISTS. The register lives in two of three columns,
          which is right for a five-column table and wrong for a dense one: the
          accreditation standards register carries code, standard, rating,
          coverage, risk, review and actions, and at two-thirds width the last two
          fell off the right edge behind a horizontal scrollbar. A reader had to
          scroll sideways to find out whether a standard needed a decision.

          `wideRegister` gives the register the full width and drops the
          needs-attention rail below it, where it reads as a full-width strip
          rather than a squeezed column. Opt-in per page, so every other domain
          keeps the two-column shape it was designed around. */}
      <div className={wideRegister ? 'space-y-6' : 'grid gap-6 lg:grid-cols-3'}>
        {/* LEFT — the register (tabs + active table) ON THE GROUND. min-w-0 lets
            a wide register (e.g. Cash & Collections' aging table) scroll inside
            its own overflow-x-auto instead of pushing the page body horizontally. */}
        <Section
          className={`min-w-0 ${wideRegister ? '' : 'lg:col-span-2'}`}
          label={tabs.length <= 1 ? (registerTitle ?? tabs[0]?.label ?? 'Register') : 'Registers'}
          aside={
            onNew ? (
              <Button variant="primary" size="sm" onClick={onNew} icon={<Plus size={14} />}>
                New
              </Button>
            ) : null
          }
        >
          {tabs.length > 1 ? (
            /* Multi-tab domains keep the tabs — ink, a 2px hue rule under the
               active one. A single-entry tab bar is dead chrome: the Section
               label already names the register. */
            <div role="tablist" aria-label="Registers" className="tabs-ink mb-4 overflow-x-auto">
              {tabs.map((t) => {
                const active = t.key === activeTab
                return (
                  <button key={t.key} type="button" role="tab" aria-selected={active} onClick={() => onTabChange?.(t.key)} className="tab-ink">
                    {t.label}
                    {active ? (
                      <motion.span layoutId={reduce ? undefined : 'domain-tab-underline'} className="tab-ink-rule" aria-hidden="true" />
                    ) : null}
                  </button>
                )
              })}
            </div>
          ) : null}
          <div className="min-w-0">{registerTable}</div>
        </Section>

        {/* Needs attention — beside the register, or beneath it when wide. */}
        <div className={wideRegister ? '' : 'mt-8 lg:col-span-1'}>
          <NeedsAttentionPanel
            items={attentionItems}
            moreCount={attentionMoreCount}
            onMore={attentionOnMore}
          />
        </div>
      </div>

    </div>
  )
}
