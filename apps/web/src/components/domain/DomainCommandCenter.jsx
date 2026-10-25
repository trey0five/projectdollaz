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
// AURORA (owner-approved 2026-10-15): the header is an `AuroraHero` band in the
// module hue (school chip · eyebrow · serif title · ONE plain verdict sentence
// · the page's buttons · frosted-glass KPI cards with Good / Watch / At risk
// pills), the register an `AuroraSection` ("Records") with pill tabs and the
// table in a white card, the rail an `AuroraSection` of colourful tiles
// ("Needs attention"). Every existing prop keeps its meaning, so the eleven
// pages that compose this move for free; the NEW props below are optional.
//
// (Premium UI P3 history: the KPI row is still a `StatStrip` of `DomainKpiCard`
// Stats — now worn as glass cards — so the no-clip contract holds unchanged.)
//
// Props
//   eyebrow          string — small uppercase muted eyebrow above the title
//   title            string — big serif navy page title
//   Icon             lucide component — the domain glyph in the header badge
//   attentionCount   number — count behind the header pill (0 → "all clear")
//   kpis             array of { label, value, sub:{icon,text,tone}, status, hint?, onClick? }
//   tabs             array of { key, label } — the register tabs
//   activeTab        string — the active tab key
//   onTabChange      (key) => void
//   onNew            () => void | null — opens create for the active register
//                    (null hides the +New button)
//   registerTable    node — the active register's table (parent renders it)
//   attentionItems   array of { id, tone, title, why, actions:[{label,onClick,primary}] }
//   headerAside      node | null — secondary header controls (an "as of" chip, a
//                    Refresh button, a framework switcher, a division select). On the
//                    band they live in the compact TOOLS row under the buttons, which
//                    wraps and never overlaps (a page's MAIN jobs go in `actions`).
//   beforeBody       node | null — a full-width block rendered BETWEEN the KPI row and
//                    the two-column body (e.g. Cash & Collections' aging bars). Optional.
//   aboveKpis        node | null — a full-width HERO block rendered BETWEEN the header
//                    and the KPI row (e.g. Accreditation's readiness dial). Optional;
//                    omitting it leaves existing callers byte-identical.
//   registerTitle    string | null — heading shown in place of the tab bar when a
//                    domain has ≤1 register tab (a single-entry tab bar is dead
//                    chrome). Defaults to the lone tab's label. Optional.
//
// NEW (Aurora) — all optional; omit them and the page still renders well:
//   school           string — the band's glass chip. Default: the active school's
//                    name (the organisation's in org scope); pass null to hide it.
//                    Pass `eyebrow` as the PERIOD / context only ("FY 2026",
//                    "As of Oct 3"); a legacy "Module · School" eyebrow has the
//                    module and school parts dropped, since the title and the
//                    chip already say them.
//   verdict          node — ONE plain sentence for the band, built from real data
//                    (wrap key words in <VerdictEm tone>). Default: the attention
//                    count ("3 items need a decision." / "Nothing needs a decision
//                    right now.").
//   primaryAction    node — the band's white button. Default: the Add-data CTA
//                    (showAddData); else the register's own New action (`onNew`,
//                    labelled `newLabel`) so every band has one obvious job.
//   newLabel         string — the promoted New button's words ("New task",
//                    "Upload document"). Default: "New" + the register's noun.
//   actions          node — up to 2 more band buttons (ghost), placed after the
//                    Records CTA and before headerAside.
//   heroAside        node — the band's right column (period/year switcher, a dial
//                    built for a dark ground).
//   hue              hex — band/section hue for a page with no module key
//                    (Tasks, Knowledge, Improvement). Module pages inherit theirs.
//   kpis[].icon      lucide component for the glass card's label well, and
//   kpis[].unit      a small unit after the value ("days") — both optional:
//                    { label, value, sub, status, icon: Wallet, unit: 'days' }.
//                    The FIRST FOUR KPIs are glass cards (order them); the rest
//                    become a compact "more figures" chip row in the band.
//   kpis[].status    must be 'neutral' when there is nothing to judge: a zero
//                    denominator, no records, nothing scheduled. "Overdue 0 ·
//                    Good" with no initiatives is a judgement about nothing —
//                    the pill only speaks when the figure has a real band.
//   attentionTitle   string — rail heading (default "Needs attention").
//   attentionSubtitle string — rail subtitle (default "Decisions waiting on you").
//   registerSubtitle string — one short line under the Records heading.
//   registerIcon     lucide component — Records medallion (default FolderOpen).
//   howItWorks       node — explanations/methodology, rendered in a closed
//                    "How this works" disclosure at the foot of the page.
// ─────────────────────────────────────────────────────────────────────────────
import { FolderOpen, Plus } from 'lucide-react'
import DomainKpiCard from './DomainKpiCard.jsx'
import NeedsAttentionPanel from './NeedsAttentionPanel.jsx'
import ModuleBreadcrumb from '../module/ModuleBreadcrumb.jsx'
import { RegisterNewContext } from '../module/RegisterEmpty.jsx'
import { AddDataCta, RecordsCta } from '../module/ModuleCtas.jsx'
import { StatStrip } from '../ui/surface/index.js'
import {
  AuroraHero,
  AuroraSection,
  AuroraButton,
  AuroraLightButton,
  AuroraKpiChips,
  AuroraEmpty,
  KPI_CARD_MAX,
  HowThisWorks,
  VerdictEm,
} from '../ui/aurora/index.js'
import { useOptionalSchools } from '../../context/SchoolContext.jsx'
import { useScope } from '../../context/ScopeContext.jsx'

/** "All tasks" → "task", "Documents" → "document", "Initiatives" → "initiative". */
export function registerNoun(label) {
  const last = String(label ?? '')
    .trim()
    .split(/\s+/)
    .pop()
    ?.toLowerCase()
  if (!last) return null
  if (/ies$/.test(last)) return `${last.slice(0, -3)}y`
  if (/(ss|us)$/.test(last)) return last
  return last.replace(/s$/, '')
}

/**
 * Drop the parts of a legacy "Module · School" eyebrow that the band's title
 * and chip already say. "Governance · Sample 01 High School" → null;
 * "Finance · Cash & Collections" (title "Cash & Collections") → "Finance".
 */
export function trimEyebrow(eyebrow, { title, school }) {
  if (typeof eyebrow !== 'string') return eyebrow
  const same = (a, b) => a && b && a.trim().toLowerCase() === String(b).trim().toLowerCase()
  const parts = eyebrow
    .split(/\s+·\s+/)
    .filter((p) => p && !same(p, title) && !same(p, school) && !same(p, 'School'))
  return parts.length ? parts.join(' · ') : null
}

// The default band sentence — the same fact the old header pill carried
// ("N need a decision" / "all clear"), said as a sentence.
function AttentionVerdict({ count }) {
  if (!count) return <>Nothing needs a decision right now.</>
  return (
    <>
      <VerdictEm tone="watch">
        {count} item{count === 1 ? '' : 's'}
      </VerdictEm>{' '}
      need{count === 1 ? 's' : ''} a decision.
    </>
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
  // ── Aurora (optional; see the header comment) ──
  school = undefined,
  verdict = null,
  primaryAction = null,
  actions = null,
  heroAside = null,
  hue = null,
  attentionTitle = 'Needs attention',
  attentionSubtitle = 'Decisions waiting on you',
  registerSubtitle = null,
  registerIcon = null,
  howItWorks = null,
  newLabel = null,
}) {
  const RegisterIcon = registerIcon ?? FolderOpen
  const schoolsCtx = useOptionalSchools()
  const { scope, orgName } = useScope()
  // The chip: the caller's school, else the active school (org name in org scope).
  const chip =
    school !== undefined
      ? school
      : ((scope === 'org' ? orgName : schoolsCtx?.activeSchool?.name) ?? null)
  const eyebrowText = trimEyebrow(eyebrow, { title, school: chip ?? schoolsCtx?.activeSchool?.name })
  const registerLabel = registerTitle ?? tabs[0]?.label ?? null
  const promotedNew =
    !primaryAction && !showAddData && onNew ? (
      <AuroraButton variant="primary" onClick={onNew} icon={<Plus size={19} aria-hidden="true" />}>
        {newLabel ?? (registerNoun(registerLabel) ? `New ${registerNoun(registerLabel)}` : 'New')}
      </AuroraButton>
    ) : null
  const primary = primaryAction ?? (showAddData ? <AddDataCta /> : promotedNew)
  const bandActions =
    primary || showAddData || actions ? (
      <>
        {primary}
        {showAddData ? <RecordsCta module={moduleKey} /> : null}
        {actions}
      </>
    ) : null
  const cardKpis = kpis.slice(0, KPI_CARD_MAX)
  const moreKpis = kpis.slice(KPI_CARD_MAX).map((k) => ({
    key: k.label,
    label: k.label,
    value: k.value,
    unit: k.unit,
    verdict: k.status,
  }))
  const attention = (
    <NeedsAttentionPanel
      items={attentionItems}
      moreCount={attentionMoreCount}
      onMore={attentionOnMore}
      wide={wideRegister}
      limit={wideRegister ? 3 : null}
      title={attentionTitle}
      subtitle={attentionSubtitle}
    />
  )

  return (
    <div className="au-scope mx-auto max-w-page px-4 py-6 sm:px-10 sm:py-8">
      {/* Back to the dashboard — shown for standalone (non-module) domain pages
          like Cash / Tasks / Knowledge that aren't wrapped in ModuleTabs (which
          carries its own back link). */}
      {showBack ? (
        <div className="mb-3">
          <ModuleBreadcrumb crumbs={[{ label: 'Dashboard', to: '/app' }, { label: title }]} />
        </div>
      ) : null}

      {/* ── The band: chip · title · verdict · buttons · glass KPIs ──────────
          COLUMN WIDTH IS THE NO-CLIP CONTRACT. A dense strip is what cut text
          off: six columns at 1280 leave ~96px for a 30px value, so ordinary
          words broke mid-word ("None sched|uled"). The strip therefore never
          goes 6-up below xl: the dense sets step 3 → 4 (xl:grid-cols-4), which
          keeps ≥170px of content at every width from 1024 up. Fix the column,
          not the font (card contract §5.3). ── */}
      <AuroraHero
        hue={hue}
        moduleKey={hue ? null : moduleKey}
        school={chip}
        eyebrow={
          Icon && eyebrowText ? (
            <span className="inline-flex items-center gap-2">
              <Icon size={14} strokeWidth={2} aria-hidden="true" />
              {eyebrowText}
            </span>
          ) : (
            eyebrowText
          )
        }
        title={title}
        verdict={verdict ?? <AttentionVerdict count={attentionCount} />}
        actions={bandActions}
        tools={headerAside}
        aside={heroAside}
        monogram={chip ? undefined : false}
        kpis={
          cardKpis.length ? (
            <>
              {/* At most four glass cards (KPI_CARD_MAX): 2×2 on a phone, 4-up
                  from xl — the band stays short. Any more ride below as chips. */}
              <StatStrip
                cols={cardKpis.length}
                className={`au-kpis grid-cols-2 ${cardKpis.length === 3 ? 'lg:grid-cols-3' : 'xl:grid-cols-4'}`}
              >
                {cardKpis.map((kpi) => (
                  <DomainKpiCard
                    key={kpi.label}
                    label={kpi.label}
                    value={kpi.value}
                    sub={kpi.sub}
                    status={kpi.status}
                    icon={kpi.icon}
                    unit={kpi.unit}
                    hint={kpi.hint}
                    onClick={kpi.onClick}
                  />
                ))}
              </StatStrip>
              <AuroraKpiChips items={moreKpis} />
            </>
          ) : null
        }
      />

      {/* ── Optional full-width block under the band (e.g. Accreditation's
          readiness dial) ─────────────────────────────────────────────────── */}
      {aboveKpis ? <div className="mt-8">{aboveKpis}</div> : null}

      {/* ── Optional full-width block between the band and the body ───────── */}
      {beforeBody ? <div className="mt-8">{beforeBody}</div> : null}

      {/* ── Body: two columns, or a full-width register with the rail beneath ──
          WHY THE OPT-OUT EXISTS. The register lives in two of three columns,
          which is right for a five-column table and wrong for a dense one: the
          accreditation standards register carries code, standard, rating,
          coverage, risk, review and actions, and at two-thirds width the last two
          fell off the right edge behind a horizontal scrollbar. A reader had to
          scroll sideways to find out whether a standard needed a decision.

          `wideRegister` gives the register the full width and puts the
          needs-attention items ABOVE it as one row of three tiles (the rest
          behind "…and N more"): the band says "6 items need a decision", so
          those items must sit right under it — not 3,000px down below a long
          register. Opt-in per page, so every other domain keeps the two-column
          shape it was designed around. On a phone the rail comes FIRST
          (order-first) — what needs a decision before the list. */}
      <div className={wideRegister ? 'space-y-6' : 'grid gap-6 lg:grid-cols-3'}>
        {wideRegister ? <div className="min-w-0">{attention}</div> : null}

        {/* The register (tabs + active table). min-w-0 lets a wide register
            (e.g. Cash & Collections' aging table) scroll inside its own
            overflow-x-auto instead of pushing the page body horizontally. */}
        <AuroraSection
          icon={RegisterIcon}
          className={`min-w-0 ${wideRegister ? '' : 'lg:col-span-2'}`}
          title={tabs.length <= 1 ? (registerTitle ?? tabs[0]?.label ?? 'Records') : 'Records'}
          subtitle={registerSubtitle}
          compact={!wideRegister}
          aside={
            onNew ? (
              <AuroraLightButton size="sm" onClick={onNew} icon={<Plus size={15} aria-hidden="true" />}>
                New
              </AuroraLightButton>
            ) : null
          }
        >
          {tabs.length > 1 ? (
            /* Multi-tab domains keep the tabs — hue pills. A single-entry tab
               bar is dead chrome: the section heading already names it. */
            <div role="tablist" aria-label="Records" className="au-tabs">
              {tabs.map((t) => {
                const active = t.key === activeTab
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => onTabChange?.(t.key)}
                    className="au-tab"
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>
          ) : null}
          <div className="au-card au-card-flat au-register min-w-0">
            <RegisterNewContext.Provider value={onNew ?? null}>{registerTable}</RegisterNewContext.Provider>
          </div>
        </AuroraSection>

        {/* Needs attention — beside the register (two-column layout). On a
            phone the rail jumps ABOVE the register only when it has something
            to act on; an empty "all caught up" rail stays below it. */}
        {wideRegister ? null : (
          <div
            className={`min-w-0 lg:col-span-1${attentionItems.length > 0 ? ' order-first lg:order-none' : ''}`}
            data-rail-order={attentionItems.length > 0 ? 'first' : 'natural'}
          >
            {attention}
          </div>
        )}
      </div>

      {howItWorks ? <HowThisWorks>{howItWorks}</HowThisWorks> : null}
    </div>
  )
}

/**
 * DomainStatePanel — the page a domain shows BEFORE it has anything to command:
 * loading, an error, not connected, no plan yet. Same Aurora band as the full
 * page (chip · title · one plain sentence · one white button) over a designed
 * empty state (one line + one button), so the screen a new school lands on
 * still reads as the module, not as a bare centred note.
 *
 *   title / eyebrow / Icon / moduleKey / hue / school / showBack — as DCC
 *   verdict        the band's one sentence ("Connect QuickBooks to see your cash.")
 *   primaryAction  the band's white button (an <AuroraButton variant="primary">)
 *   icon, text, sub, action — the AuroraEmpty below the band
 *   busy           marks the empty state aria-busy (a loading panel)
 */
export function DomainStatePanel({
  title,
  eyebrow = null,
  Icon = null,
  moduleKey = null,
  hue = null,
  school = undefined,
  showBack = false,
  verdict = null,
  primaryAction = null,
  icon = null,
  text,
  sub = null,
  action = null,
  busy = false,
}) {
  const schoolsCtx = useOptionalSchools()
  const { scope, orgName } = useScope()
  const chip =
    school !== undefined ? school : ((scope === 'org' ? orgName : schoolsCtx?.activeSchool?.name) ?? null)
  const eyebrowText = trimEyebrow(eyebrow, { title, school: chip })
  return (
    <div className="au-scope mx-auto max-w-page px-4 py-6 sm:px-10 sm:py-8">
      {showBack ? (
        <div className="mb-3">
          <ModuleBreadcrumb crumbs={[{ label: 'Dashboard', to: '/app' }, { label: title }]} />
        </div>
      ) : null}
      <AuroraHero
        hue={hue}
        moduleKey={hue ? null : moduleKey}
        school={chip}
        eyebrow={
          Icon && eyebrowText ? (
            <span className="inline-flex items-center gap-2">
              <Icon size={14} strokeWidth={2} aria-hidden="true" />
              {eyebrowText}
            </span>
          ) : (
            eyebrowText
          )
        }
        title={title}
        verdict={verdict}
        actions={primaryAction}
        monogram={chip ? undefined : false}
      />
      <div className="mt-8" aria-busy={busy || undefined}>
        <AuroraEmpty icon={icon} text={text} sub={sub} action={action} />
      </div>
    </div>
  )
}
