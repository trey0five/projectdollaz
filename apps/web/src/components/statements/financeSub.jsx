// ─────────────────────────────────────────────────────────────────────────────
// financeSub — the shared Aurora frame for the Finance SUB-PAGES (Statements,
// Analytics, Budget, Cash Forecast, Reports, Supporting Schedules, Readiness).
// The Finance overview (/finance) is the reference; a sub-page wears the same
// band so moving between them feels like one module:
//
//   FinanceSubPage   the page root: `au-scope` container + the Finance hue vars
//                    (moduleAccentVars — the ONE registry) + a breadcrumb
//                    Dashboard › Finance › <page>
//   FinanceSubBand   AuroraHero pinned to the Finance hue; the school chip
//                    defaults to the active school
//   FinanceMore      "More in Finance" — one compact row tile per sibling page,
//                    so a reader can move sideways without going back to the
//                    overview
//   FinanceMoreBlock FinanceMore in its own Finance-hued page container, for a
//                    page that does not render inside FinanceSubPage (/cash)
//   FinancePeriodSwitch  the band's year switch: the glass segmented switch,
//                    and on a phone (more than 3 years) one compact glass select
//                    so the band never wraps into rows of years
//
// Pure composition over the Aurora primitives — no new styles beyond the slice
// stylesheet, no data fetching.
// ─────────────────────────────────────────────────────────────────────────────
import {
  BarChart3,
  CircleDollarSign,
  Compass,
  FileBarChart2,
  FileStack,
  LayoutGrid,
  ShieldCheck,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { useOptionalSchools } from '../../context/SchoolContext.jsx'
import { moduleAccentVars } from '../module/moduleAnatomy.js'
import ModuleBreadcrumb from '../module/ModuleBreadcrumb.jsx'
import { formatShortDate } from '../../lib/format.js'
import {
  AuroraHero,
  AuroraPeriodSwitch,
  AuroraSection,
  AuroraTile,
  AuroraTileGrid,
  fyLabel,
} from '../ui/aurora/index.js'
import '../../styles/pending/aurora-finance-sub.css'

/** The page root every Finance sub-page renders inside. */
export function FinanceSubPage({ crumb, crumbs = null, className = '', children, ...rest }) {
  const trail = crumbs ?? [
    { label: 'Dashboard', to: '/app' },
    { label: 'Finance', to: '/finance' },
    { label: crumb },
  ]
  return (
    <div
      className={`au-scope fsub mx-auto max-w-page px-4 py-6 sm:px-10 sm:py-8${className ? ` ${className}` : ''}`}
      style={moduleAccentVars('finance')}
      {...rest}
    >
      <div className="mb-3">
        <ModuleBreadcrumb crumbs={trail} />
      </div>
      {children}
    </div>
  )
}

/** The Finance band. `school` defaults to the active school (null hides it). */
export function FinanceSubBand({ school = undefined, ...props }) {
  const schoolsCtx = useOptionalSchools()
  const chip = school !== undefined ? school : (schoolsCtx?.activeSchool?.name ?? null)
  return <AuroraHero moduleKey="finance" school={chip} {...props} />
}

// Every Finance destination, in the overview's order. `key` matches the
// `current` prop so the page you are on is left out.
const DOORS = [
  { key: 'overview', to: '/finance', icon: LayoutGrid, title: 'Finance overview', desc: 'The year at a glance.' },
  { key: 'statements', to: '/statements', icon: FileStack, title: 'Statements', desc: 'Income, costs and what’s left.' },
  { key: 'analytics', to: '/analytics', icon: BarChart3, title: 'Analytics', desc: 'Margin, cash and reserve, year by year.' },
  { key: 'cash', to: '/cash', icon: CircleDollarSign, title: 'Cash & Collections', desc: 'Who still owes you, and what you owe.' },
  { key: 'cash-flow', to: '/cash-flow', icon: TrendingUp, title: 'Cash Forecast', desc: 'When cash may run low.' },
  { key: 'budget', to: '/budget', icon: Wallet, title: 'Budget', desc: 'Plan vs. actual, line by line.' },
  { key: 'reports', to: '/reports', icon: FileBarChart2, title: 'Reports', desc: 'Board-ready packets.' },
  { key: 'readiness', to: '/readiness', icon: ShieldCheck, title: 'Readiness', desc: 'The scholarship review self-check.' },
]

/**
 * "More in Finance" — sibling doors as COMPACT row tiles (icon + name + one
 * line, four to a row) so the section stays short; the page you are on is
 * omitted.
 */
export function FinanceMore({ current, only = null }) {
  const doors = DOORS.filter((d) => d.key !== current && (!only || only.includes(d.key)))
  if (!doors.length) return null
  return (
    <AuroraSection className="fsub-more" icon={Compass} title="More in Finance" subtitle="Open another Finance tool">
      <AuroraTileGrid cols={Math.min(4, Math.max(2, doors.length))}>
        {doors.map((d, i) => (
          <AuroraTile
            key={d.key}
            row
            art={false}
            to={d.to}
            icon={d.icon}
            title={d.title}
            desc={d.desc}
            hue={i % 3 === 1 ? 'var(--au-h2)' : i % 3 === 2 ? 'var(--au-h3)' : undefined}
          />
        ))}
      </AuroraTileGrid>
    </AuroraSection>
  )
}

/** FinanceMore inside its own Finance-hued container (no breadcrumb). */
export function FinanceMoreBlock({ current, only = null }) {
  return (
    <div className="au-scope fsub mx-auto max-w-page px-4 pb-8 sm:px-10" style={moduleAccentVars('finance')}>
      <FinanceMore current={current} only={only} />
    </div>
  )
}

/**
 * A saved year's name for the screen: fyLabel ("FY26" → "FY 2026"), plus the
 * raw enum spelling some imports leave behind ("FISCAL_YEAR 2027" → "FY 2027").
 */
export function yearName(label) {
  const m = String(label ?? '').trim().match(/^FISCAL[_\s]YEAR\s*(\d{4})$/i)
  return m ? `FY ${m[1]}` : fyLabel(label)
}

/**
 * The band's year switch. ≥640px: the glass segmented switch (AuroraPeriodSwitch
 * — same localStorage side effect). On a phone with more than three years, ONE
 * compact glass select instead, so six years never wrap into three rows and
 * push the page below the fold. Fewer than two years → nothing to switch.
 */
export function FinancePeriodSwitch({ periods, activeId, onSelect, label = 'Period' }) {
  if (!periods || periods.length < 2) return null
  const named = periods.map((p) => ({ ...p, label: yearName(p.label) }))
  const wide = <AuroraPeriodSwitch periods={named} activeId={activeId} onSelect={onSelect} label={label} />
  if (periods.length <= 3) return wide
  return (
    <>
      <div className="fsub-pswitch-wide">{wide}</div>
      <label className="fsub-pswitch-narrow">
        <span className="sr-only">{label}</span>
        <select
          value={activeId ?? ''}
          onChange={(e) => {
            const id = e.target.value
            try {
              localStorage.setItem('finrep_active_period', id)
            } catch {
              /* ignore */
            }
            onSelect?.(id)
          }}
        >
          {periods.map((p) => (
            <option key={p.id} value={p.id} title={p.periodEndDate ? `Period end ${formatShortDate(p.periodEndDate)}` : undefined}>
              {yearName(p.label)}
            </option>
          ))}
        </select>
      </label>
    </>
  )
}
