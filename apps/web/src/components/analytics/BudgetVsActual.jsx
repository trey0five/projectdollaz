// Budget vs. actual — a READ-ONLY comparison. Budget figures come straight from
// the period's SAVED budget (BudgetSetup — the Budget tab and the Finance
// Add-data wizard); actuals come from the generated statements (revenue_mix /
// expense_mix metrics). Per-line and total variance with RAG chips, inline mini
// dual-bars, a Budget→Actual bridge, and auto-commentary on the biggest misses.
// No editing here — the optional `onSetUp` prop lets the host flip to its own
// setup surface (BudgetPage passes its Budget tab); without it, the no-budget
// CTA falls back to a Link to /budget.
import { motion, useReducedMotion } from 'framer-motion'
import { Wallet, Scale, FileStack, TrendingUp, TrendingDown, Table2 } from 'lucide-react'
import { useBudget } from '../../hooks/useAnalytics.js'
import { fmtDollar } from '../../lib/format.js'
import { budOf, budgetTotals } from '../budget/budgetTotals.js'
import BudgetBridge from '../budget/BudgetBridge.jsx'
import {
  AuroraCard,
  AuroraEmpty,
  AuroraLightButton,
  AuroraSection,
  AuroraTile,
  AuroraTileGrid,
} from '../ui/aurora/index.js'
import { money, moneyShort } from '../finance/financeAurora.js'

// Aurora (2026-10-15): the line-by-line `.dt` table sits in a white register
// card under the "Budget vs. actual" strip (Line · Budget · Actual · Var %,
// numerics right-aligned; the variance as a 2px semantic mark + ink text); the
// budget→actual bridge is a WATERFALL of columns (owner rule: bars are columns —
// BudgetBridge); the biggest misses are tiles, worst first. Empty states are
// one line + one button. A budget with one side still empty (no spending, or no
// income, budgeted yet) gets a NEUTRAL verdict, never a false "Behind plan".

const variancePct = (v, bud) =>
  bud ? `${v >= 0 ? '+' : '−'}${Math.abs((v / bud) * 100).toFixed(1)}%` : '—'

// RAG tone for a variance: favorable=good; small miss=watch; big miss=risk.
const ragTone = (favorable, magPct) =>
  favorable == null ? 'neutral' : favorable ? 'good' : magPct > 10 ? 'risk' : 'watch'

export default function BudgetVsActual({ metrics, onSetUp = null, ...props }) {
  const reduce = useReducedMotion()
  const { budget } = useBudget(props.schoolId, props.periodId)
  const lines = budget?.lines || {}

  const {
    revLines,
    expLines,
    hasLines,
    actRevTotal,
    actExpTotal,
    budRevTotal,
    budExpTotal,
    noBudget,
    netBud,
    netAct,
  } = budgetTotals(budget, metrics)
  const renderLine = ({ kind, key, label, act, favHigher }) => {
    const bud = budOf(lines, kind, key)
    // A variance needs a REAL budget on the line: a $0 budget has nothing to
    // compare against, so the row prints "—" and carries no mark at all.
    const variance = bud != null && bud > 0 && act != null ? act - bud : null
    const favorable = variance == null ? null : favHigher ? variance >= 0 : variance <= 0
    const magPct = bud ? Math.abs((variance ?? 0) / bud) * 100 : 0
    const tone = ragTone(favorable, magPct)
    return (
      <tr key={`${kind}-${key}`}>
        <td className="text-ink">{label}</td>
        <td className="dt-num text-ink2">{bud != null ? fmtDollar(bud) : '—'}</td>
        <td className="dt-num text-ink">{act != null ? fmtDollar(act) : '—'}</td>
        <td className="dt-num">
          {variance != null ? (
            <span className="inline-flex items-center justify-end gap-1.5">
              <i className={`mark tone-${tone}`} aria-hidden="true" />
              <span className="tabular-nums text-ink">{variancePct(variance, bud)}</span>
            </span>
          ) : (
            <span className="text-ink2">—</span>
          )}
        </td>
      </tr>
    )
  }

  const totalRow = (label, bud, act, favHigher) => {
    const variance = bud != null && bud !== 0 && act != null ? act - bud : null
    const favorable = variance == null ? null : favHigher ? variance >= 0 : variance <= 0
    const magPct = bud ? Math.abs((variance ?? 0) / bud) * 100 : 0
    const tone = ragTone(favorable, magPct)
    return (
      <tr key={label} className="dt-section-total">
        <td className="text-ink">{label}</td>
        <td className="dt-num text-ink">{bud != null ? fmtDollar(bud) : '—'}</td>
        <td className="dt-num text-ink">{act != null ? fmtDollar(act) : '—'}</td>
        <td className="dt-num">
          {variance != null ? (
            <span className="inline-flex items-center justify-end gap-1.5">
              <i className={`mark tone-${tone}`} aria-hidden="true" />
              <span className="tabular-nums text-ink">{`${variance >= 0 ? '+' : '−'}${fmtDollar(Math.abs(variance))}`}</span>
            </span>
          ) : (
            <span className="text-ink2">—</span>
          )}
        </td>
      </tr>
    )
  }

  // Auto-commentary: the largest material misses (|var%| > 10, both sides known).
  const commentary = () => {
    const rows = []
    for (const c of revLines) {
      const bud = budOf(lines, 'revenue', c.key)
      if (bud != null && c.value != null) rows.push({ label: c.label, bud, act: c.value, favHigher: true })
    }
    for (const c of expLines) {
      const bud = budOf(lines, 'expense', c.key)
      if (bud != null && c.value != null) rows.push({ label: c.label, bud, act: c.value, favHigher: false })
    }
    return rows
      .map((r) => {
        const v = r.act - r.bud
        const pct = r.bud ? (v / r.bud) * 100 : 0
        const favorable = r.favHigher ? v >= 0 : v <= 0
        return { ...r, v, pct, favorable }
      })
      .filter((r) => Math.abs(r.pct) > 10 && Math.abs(r.v) > 0)
      .sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
      .slice(0, 3)
  }

  const notes = commentary()
  const showBridge = actRevTotal != null && actExpTotal != null && (budRevTotal > 0 || budExpTotal > 0)
  const revVar = (actRevTotal ?? 0) - budRevTotal
  const expVar = (actExpTotal ?? 0) - budExpTotal
  const netVar = netAct != null ? netAct - netBud : null
  // Half-entered budget: one side is still $0, so the net comparison would only
  // measure the missing side. Say that instead of judging it.
  const oneSided = budExpTotal === 0 ? 'No spending in this budget yet' : budRevTotal === 0 ? 'No income in this budget yet' : null
  const signedShort = (n) => `${n >= 0 ? '+' : '−'}${moneyShort(Math.abs(n))}`

  if (!hasLines) {
    return (
      <AuroraEmpty
        icon={FileStack}
        text="Budget vs. actual needs this year’s statements."
        sub="It compares each income and spending line once they exist."
        action={
          <AuroraLightButton variant="ghost" to="/statements">
            Open statements
          </AuroraLightButton>
        }
      />
    )
  }

  return (
    <motion.div initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      {noBudget ? (
        <AuroraEmpty
          icon={Wallet}
          text="No budget set up for this period yet."
          action={
            onSetUp ? (
              <AuroraLightButton onClick={onSetUp}>Set up your budget</AuroraLightButton>
            ) : (
              <AuroraLightButton to="/budget">Set up your budget</AuroraLightButton>
            )
          }
        />
      ) : (
        <>
          <AuroraSection
            first
            icon={Scale}
            title="Budget vs. actual"
            subtitle="Your budget against your statements"
            count={netVar == null ? null : `${signedShort(netVar)} vs. plan`}
          >
            {showBridge ? (
              <AuroraCard
                title="From plan to what happened"
                subtitle={oneSided ?? 'Plan, then the income and spending differences, then actual'}
                verdict={oneSided ? null : netVar >= 0 ? 'good' : 'risk'}
                verdictLabel={oneSided ? null : netVar >= 0 ? 'Ahead' : 'Behind'}
                big={oneSided ? null : `${moneyShort(Math.abs(netVar))} ${netVar >= 0 ? 'ahead of' : 'behind'} budget`}
                bigTone={oneSided ? null : netVar >= 0 ? 'good' : 'risk'}
                className="mb-5"
              >
                <BudgetBridge netBud={netBud} revVar={revVar} expVar={expVar} netAct={netAct} fmt={moneyShort} fullFmt={money} />
              </AuroraCard>
            ) : null}
            <div className="au-card au-card-flat au-register">
              <div className="dt-wrap">
                <table className="dt">
                  <caption className="sr-only">Budget vs. actual, line by line</caption>
                  <thead>
                    <tr>
                      <th scope="col">Line</th>
                      <th scope="col" className="dt-num">Budget</th>
                      <th scope="col" className="dt-num">Actual</th>
                      <th scope="col" className="dt-num">Var %</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="dt-section">
                      <td colSpan={4} className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink">
                        Revenue
                      </td>
                    </tr>
                    {revLines.map((c) =>
                      renderLine({ kind: 'revenue', key: c.key, label: c.label, act: c.value, favHigher: true }),
                    )}
                    {totalRow('Total revenue', budRevTotal, actRevTotal, true)}

                    <tr className="dt-section">
                      <td colSpan={4} className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink">
                        Expenses
                      </td>
                    </tr>
                    {expLines.map((c) =>
                      renderLine({ kind: 'expense', key: c.key, label: c.label, act: c.value, favHigher: false }),
                    )}
                    {totalRow('Total expenses', budExpTotal, actExpTotal, false)}
                    {totalRow('Net surplus / (deficit)', netBud, netAct, true)}
                  </tbody>
                </table>
              </div>
            </div>
          </AuroraSection>

          {notes.length > 0 && (
            <AuroraSection
              icon={Table2}
              tone={(() => {
                const tones = notes.map((n) => ragTone(n.favorable, Math.abs(n.pct)))
                return tones.includes('risk') ? 'risk' : tones.includes('watch') ? 'watch' : 'good'
              })()}
              title="What moved"
              subtitle="The biggest differences from the budget"
              count={`${notes.length} line${notes.length === 1 ? '' : 's'}`}
            >
              <AuroraTileGrid cols={Math.max(2, notes.length)}>
                {notes.map((n) => {
                  const tone = ragTone(n.favorable, Math.abs(n.pct))
                  const dir = n.favHigher ? (n.v >= 0 ? 'above' : 'below') : n.v >= 0 ? 'over' : 'under'
                  return (
                    <AuroraTile
                      key={n.label}
                      icon={n.v >= 0 ? TrendingUp : TrendingDown}
                      tone={tone === 'neutral' ? null : tone}
                      title={`${n.label} ${dir} budget`}
                      desc={`${moneyShort(Math.abs(n.v))} (${Math.abs(n.pct).toFixed(0)}%)${n.favorable ? '' : ' — worth a look'}`}
                      verdict={tone === 'neutral' ? null : tone}
                    />
                  )
                })}
              </AuroraTileGrid>
            </AuroraSection>
          )}
        </>
      )}
    </motion.div>
  )
}
