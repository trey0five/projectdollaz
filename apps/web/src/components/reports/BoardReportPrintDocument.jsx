// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — NBOA-style Board Report print document. PURE presentational: props are
// the server-assembled BoardReportBundle (sharedShapes) ONLY — no useApp/context,
// no math. Renders 7 sections under a NEW `.brd-print` scope (separate from the
// compliance `.board-print` packet — do NOT touch that). Each section guards on
// availability/null: em-dash for null budget cells; "Not available" when
// cashFlows.available=false; the KPI block shows only available:true rows; the
// MD&A shows a placeholder when empty.
// ─────────────────────────────────────────────────────────────────────────────
import {
  money,
  overUnder,
  pct,
  formatIndicator,
  longDate,
  dateTime,
  DEFAULT_TITLE,
  DEFAULT_COMMITTEE,
} from './board/boardReportUtils.js'

const TOC = [
  'Management Discussion & Analysis',
  'Statement of Operations (Budget vs Actual)',
  'Forecast for Fiscal Year End (Forecast vs Budget)',
  'Capital Budget Summary',
  'Statement of Financial Position',
  'Cash & Investments Summary',
  'Capital Campaign',
  'Statement of Changes in Net Assets',
  'Statement of Cash Flows',
]

export default function BoardReportPrintDocument({ data }) {
  if (!data) return null
  const accent = data.branding?.brandColor || '#0B1F3A'
  const accentStyle = { '--brd-accent': accent }

  return (
    <div className="brd-print" style={accentStyle}>
      {renderCover(data, accent)}
      {renderToc()}
      {renderMda(data)}
      {renderOperations(data)}
      {renderForecast(data)}
      {renderCapitalBudget(data)}
      {renderFinancialPosition(data)}
      {renderCashInvestments(data)}
      {renderCapitalCampaign(data)}
      {renderChangesInNetAssets(data)}
      {renderCashFlows(data)}
    </div>
  )
}

// ── 1. Cover ──────────────────────────────────────────────────────────────────
function renderCover(data, accent) {
  const b = data.branding || {}
  const title = data.settings?.reportTitle?.trim() || DEFAULT_TITLE
  const committee = data.settings?.committeeName?.trim() || DEFAULT_COMMITTEE
  const generated = data.settings?.generatedAt
  return (
    <section className="brd-cover">
      <div className="brd-cover-rule" style={{ backgroundColor: accent }} />
      {b.logoBase64 ? (
        // SVG/PNG/JPG rendered ONLY as an <img src=data:> (never inlined).
        <img src={b.logoBase64} alt="" className="brd-logo" />
      ) : null}
      <h1>{b.schoolName || 'School'}</h1>
      <p className="brd-cover-period" style={{ color: accent }}>
        {data.label}
      </p>
      <p className="brd-cover-title">{title}</p>
      <p className="brd-cover-committee">{committee}</p>
      {data.periodEndDate ? (
        <p className="brd-cover-fye">For the fiscal year ending {longDate(data.periodEndDate)}</p>
      ) : null}
      {generated ? <p className="brd-cover-generated">Generated {dateTime(generated)}</p> : null}
    </section>
  )
}

// ── 2. Table of contents ──────────────────────────────────────────────────────
function renderToc() {
  return (
    <section className="brd-section brd-toc">
      <h2>Table of Contents</h2>
      <ol>
        {TOC.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
    </section>
  )
}

// ── 3. Management Discussion & Analysis ───────────────────────────────────────
function renderMda(data) {
  const text = data.mda?.text?.trim()
  return (
    <section className="brd-section">
      <h2>Management Discussion &amp; Analysis</h2>
      {text ? (
        renderNarrative(text)
      ) : (
        <p className="brd-placeholder">Draft narrative — no management discussion was provided.</p>
      )}
    </section>
  )
}

// Split on blank lines into paragraphs; markdown-lite **bold** and leading #/## as
// a sub-heading. No external markdown dep.
function renderNarrative(text) {
  const blocks = String(text)
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
  return blocks.map((block, i) => {
    const head = block.match(/^#{1,3}\s+(.*)$/)
    if (head) {
      return (
        <h3 key={i} className="brd-narrative-head">
          {head[1]}
        </h3>
      )
    }
    return (
      <p key={i} className="brd-narrative-p">
        {renderInline(block)}
      </p>
    )
  })
}

function renderInline(s) {
  // **bold** -> <strong>; everything else literal.
  const parts = String(s).split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) => {
    const m = p.match(/^\*\*([^*]+)\*\*$/)
    return m ? <strong key={i}>{m[1]}</strong> : <span key={i}>{p}</span>
  })
}

// ── 4. Statement of Operations (Budget vs Actual) + Key Indicators ────────────
function renderOperations(data) {
  const ops = data.operations
  if (!ops) {
    return (
      <section className="brd-section">
        <h2>Statement of Operations</h2>
        <p className="brd-placeholder">Not available — no statements for this period.</p>
      </section>
    )
  }
  const kpis = (data.keyIndicators || []).filter((k) => k.available && k.value != null)
  return (
    <section className="brd-section">
      <h2>Statement of Operations</h2>
      <p className="brd-subnote">Budget vs. actual for the fiscal year.</p>
      <table className="brd-table">
        <thead>
          <tr>
            <th className="brd-l">Line</th>
            <th>Prior Year</th>
            <th>Actual</th>
            <th>Budget</th>
            <th>Over (Under)</th>
            <th>%</th>
            <th className="brd-l brd-explain">Explanation</th>
          </tr>
        </thead>
        <tbody>
          <tr className="brd-group">
            <td colSpan={7}>Revenue</td>
          </tr>
          {(ops.revenue || []).map((r) => opRow(r))}
          {totalRow('Total revenue', ops.revenueTotals)}

          <tr className="brd-group">
            <td colSpan={7}>Expenses</td>
          </tr>
          {(ops.expense || []).map((r) => opRow(r))}
          {totalRow('Total expenses', ops.expenseTotals)}

          {totalRow('Net surplus / (deficit)', ops.netSurplus, true)}
        </tbody>
      </table>

      {kpis.length > 0 && (
        <div className="brd-kpi-block">
          <h3 className="brd-narrative-head">Key Indicators</h3>
          <div className="brd-kpi-grid">
            {kpis.map((k) => (
              <div key={k.key} className="brd-kpi">
                <span className="brd-kpi-label">{k.label}</span>
                <span className="brd-kpi-value">{formatIndicator(k.value, k.unit)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function opRow(r) {
  return (
    <tr key={r.key}>
      <td className="brd-l">{r.label}</td>
      <td className={r.priorYear == null ? '' : cellNeg(r.priorYear)}>
        {r.priorYear == null ? '—' : money(r.priorYear)}
      </td>
      <td className={cellNeg(r.actual)}>{money(r.actual)}</td>
      <td className={r.budget == null ? '' : cellNeg(r.budget)}>{r.budget == null ? '—' : money(r.budget)}</td>
      <td className={r.variance == null ? '' : cellNeg(r.variance)}>
        {r.variance == null ? '—' : overUnder(r.variance)}
      </td>
      <td>{pct(r.variancePct)}</td>
      <td className="brd-l brd-explain">{r.explanation || ''}</td>
    </tr>
  )
}

function totalRow(label, t, isNet = false) {
  if (!t) return null
  return (
    <tr className={isNet ? 'brd-total brd-net' : 'brd-total'}>
      <td className="brd-l">{label}</td>
      <td className={t.priorYear == null ? '' : cellNeg(t.priorYear)}>
        {t.priorYear == null ? '—' : money(t.priorYear)}
      </td>
      <td className={cellNeg(t.actual)}>{money(t.actual)}</td>
      <td className={t.budget == null ? '' : cellNeg(t.budget)}>{t.budget == null ? '—' : money(t.budget)}</td>
      <td className={t.variance == null ? '' : cellNeg(t.variance)}>
        {t.variance == null ? '—' : overUnder(t.variance)}
      </td>
      <td>{pct(t.variancePct)}</td>
      <td className="brd-l brd-explain" />
    </tr>
  )
}

// ── 4b. Forecast for Fiscal Year End (Forecast vs Budget) ─────────────────────
// PURE presentational: every figure comes verbatim from the server-assembled
// bundle.forecast (sharedShapes SEAM 3) — zero math. Clones renderOperations'
// table with the Actual column swapped for Forecast, then prints an assumptions
// summary (projected enrollment, feeder, tuition rates, inflation, program split).
function renderForecast(data) {
  const fc = data.forecast
  if (!fc || fc.available === false) {
    return (
      <section className="brd-section">
        <h2>Forecast for FYE</h2>
        <p className="brd-placeholder">
          No fiscal-year-end forecast has been prepared for this period.
        </p>
      </section>
    )
  }
  const a = fc.assumptionsSummary || {}
  const feeder = a.feederByGrade || {}
  const feederKeys = Object.keys(feeder).filter((g) => Number(feeder[g]) > 0)
  const rates = a.tuitionRates || {}
  const split = a.programSplit || {}
  return (
    <section className="brd-section">
      <h2>Forecast for Fiscal Year End</h2>
      <p className="brd-subnote">
        Assumption-driven re-projection vs. the active budget
        {fc.computedAt ? ` · prepared ${dateTime(fc.computedAt)}` : ''}.
      </p>
      <table className="brd-table">
        <thead>
          <tr>
            <th className="brd-l">Line</th>
            <th>Forecast</th>
            <th>Budget</th>
            <th>Variance</th>
            <th>%</th>
            <th className="brd-l brd-explain">Explanation</th>
          </tr>
        </thead>
        <tbody>
          <tr className="brd-group">
            <td colSpan={6}>Revenue</td>
          </tr>
          {(fc.revenue || []).map((r) => fcRow(r))}
          {fcTotalRow('Total revenue', fc.revenueTotals)}

          <tr className="brd-group">
            <td colSpan={6}>Expenses</td>
          </tr>
          {(fc.expense || []).map((r) => fcRow(r))}
          {fcTotalRow('Total expenses', fc.expenseTotals)}

          {fcNetRow('Net surplus / (deficit)', fc.netSurplus)}
        </tbody>
      </table>

      <div className="brd-kpi-block">
        <h3 className="brd-narrative-head">Forecast Assumptions</h3>
        <div className="brd-kpi-grid">
          <div className="brd-kpi">
            <span className="brd-kpi-label">Projected enrollment</span>
            <span className="brd-kpi-value">
              {a.enrollmentTotal == null ? '—' : Number(a.enrollmentTotal).toLocaleString('en-US')}
            </span>
          </div>
          <div className="brd-kpi">
            <span className="brd-kpi-label">Anticipated feeder students</span>
            <span className="brd-kpi-value">
              {a.feederTotal == null ? '—' : `+${Number(a.feederTotal).toLocaleString('en-US')}`}
            </span>
          </div>
          <div className="brd-kpi">
            <span className="brd-kpi-label">Inflation applied</span>
            <span className="brd-kpi-value">
              {a.inflationPct == null ? '—' : `${a.inflationPct}%`}
            </span>
          </div>
          <div className="brd-kpi">
            <span className="brd-kpi-label">Tuition (PreK part / full)</span>
            <span className="brd-kpi-value">
              {money(rates.prek3)} / {money(rates.prek5)}
            </span>
          </div>
          <div className="brd-kpi">
            <span className="brd-kpi-label">Tuition (Elem / Middle)</span>
            <span className="brd-kpi-value">
              {money(rates.elem)} / {money(rates.middle)}
            </span>
          </div>
          <div className="brd-kpi">
            <span className="brd-kpi-label">Program split (Parent/FTC/FES)</span>
            <span className="brd-kpi-value">
              {fmtPct(split.parent)} / {fmtPct(split.ftc)} / {fmtPct(split.fes)}
            </span>
          </div>
        </div>
        {feederKeys.length > 0 ? (
          <p className="brd-subnote">
            Feeder by grade:{' '}
            {feederKeys.map((g, i) => (
              <span key={g}>
                {i > 0 ? ' · ' : ''}
                {g} +{Number(feeder[g]).toLocaleString('en-US')}
              </span>
            ))}
          </p>
        ) : null}
      </div>
    </section>
  )
}

// Forecast detail row — clone of opRow with r.actual → r.forecast.
function fcRow(r) {
  return (
    <tr key={r.key}>
      <td className="brd-l">{r.label}</td>
      <td className={cellNeg(r.forecast)}>{money(r.forecast)}</td>
      <td className={r.budget == null ? '' : cellNeg(r.budget)}>
        {r.budget == null ? '—' : money(r.budget)}
      </td>
      <td className={r.variance == null ? '' : cellNeg(r.variance)}>
        {r.variance == null ? '—' : overUnder(r.variance)}
      </td>
      <td>{pct(r.variancePct)}</td>
      <td className="brd-l brd-explain">{r.explanation || ''}</td>
    </tr>
  )
}

function fcTotalRow(label, t) {
  if (!t) return null
  return (
    <tr className="brd-total">
      <td className="brd-l">{label}</td>
      <td className={cellNeg(t.forecast)}>{money(t.forecast)}</td>
      <td className={t.budget == null ? '' : cellNeg(t.budget)}>
        {t.budget == null ? '—' : money(t.budget)}
      </td>
      <td className={t.variance == null ? '' : cellNeg(t.variance)}>
        {t.variance == null ? '—' : overUnder(t.variance)}
      </td>
      <td>{pct(t.variancePct)}</td>
      <td className="brd-l brd-explain" />
    </tr>
  )
}

// Net surplus row — netSurplus has no `favorable` flag; show forecast/budget/var.
function fcNetRow(label, n) {
  if (!n) return null
  return (
    <tr className="brd-total brd-net">
      <td className="brd-l">{label}</td>
      <td className={cellNeg(n.forecast)}>{money(n.forecast)}</td>
      <td className={n.budget == null ? '' : cellNeg(n.budget)}>
        {n.budget == null ? '—' : money(n.budget)}
      </td>
      <td className={n.variance == null ? '' : cellNeg(n.variance)}>
        {n.variance == null ? '—' : overUnder(n.variance)}
      </td>
      <td>{pct(n.variancePct)}</td>
      <td className="brd-l brd-explain" />
    </tr>
  )
}

// Whole-percent for the assumptions summary (program split / inflation echoes).
function fmtPct(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return `${Number(n)}%`
}

// ── 4c. Capital Budget Summary ────────────────────────────────────────────────
// PURE presentational: every figure (line over-under, subtotals, grand total)
// comes verbatim from the server-assembled bundle.capitalBudget (sharedShapes).
// ZERO client arithmetic — null section ⇒ "Not available" placeholder.
function renderCapitalBudget(data) {
  const cap = data.capitalBudget
  if (!cap) {
    return (
      <section className="brd-section">
        <h2>Capital Budget Summary</h2>
        <p className="brd-placeholder">
          Not available — no capital projects entered for this period.
        </p>
      </section>
    )
  }
  const gt = cap.grandTotal || {}
  return (
    <section className="brd-section">
      <h2>Capital Budget Summary</h2>
      <p className="brd-subnote">Capital projects: actual year-to-date vs. budget.</p>
      <table className="brd-table">
        <thead>
          <tr>
            <th className="brd-l">Project</th>
            <th>Actual YTD</th>
            <th>Budget</th>
            <th>Over (Under)</th>
            <th className="brd-l brd-explain">Comment</th>
          </tr>
        </thead>
        <tbody>
          {(cap.groups || []).map((g) => (
            <CapitalGroup key={g.key} group={g} />
          ))}
          <tr className="brd-total brd-net">
            <td className="brd-l">Total Capital</td>
            <td className={cellNeg(gt.actual)}>{money(gt.actual)}</td>
            <td className={cellNeg(gt.budget)}>{money(gt.budget)}</td>
            <td className={cellNeg(gt.overUnder)}>{overUnder(gt.overUnder)}</td>
            <td className="brd-l brd-explain" />
          </tr>
        </tbody>
      </table>
    </section>
  )
}

// One capital group: header + its lines + subtotal (all verbatim from assemble).
function CapitalGroup({ group }) {
  const sub = group.subtotal || {}
  return (
    <>
      <tr className="brd-group">
        <td colSpan={5}>{group.label}</td>
      </tr>
      {(group.lines || []).map((l) => (
        <tr key={l.id}>
          <td className="brd-l">{l.label}</td>
          <td className={cellNeg(l.actual)}>{money(l.actual)}</td>
          <td className={cellNeg(l.budget)}>{money(l.budget)}</td>
          <td className={cellNeg(l.overUnder)}>{overUnder(l.overUnder)}</td>
          <td className="brd-l brd-explain">{l.comment || ''}</td>
        </tr>
      ))}
      <tr className="brd-total">
        <td className="brd-l">Subtotal</td>
        <td className={cellNeg(sub.actual)}>{money(sub.actual)}</td>
        <td className={cellNeg(sub.budget)}>{money(sub.budget)}</td>
        <td className={cellNeg(sub.overUnder)}>{overUnder(sub.overUnder)}</td>
        <td className="brd-l brd-explain" />
      </tr>
    </>
  )
}

// ── 5. Statement of Financial Position (balance sheet) ────────────────────────
function renderFinancialPosition(data) {
  const fp = data.financialPosition
  if (!fp) {
    return (
      <section className="brd-section">
        <h2>Statement of Financial Position</h2>
        <p className="brd-placeholder">Not available — no statements for this period.</p>
      </section>
    )
  }
  const cy = fp.cy || {}
  const py = fp.hasPY ? fp.py : null
  const ROWS = [
    ['Cash & equivalents', 'cash'],
    ['Total current assets', 'totalCurrentA', true],
    ['Property & equipment, net', 'ppNet'],
    ['Total assets', 'totalAssets', true],
    ['Total current liabilities', 'totalCurrL'],
    ['Total liabilities', 'totalLiab', true],
    ['Net assets without donor restrictions', 'naWithout'],
    ['Net assets with donor restrictions', 'naWith'],
    ['Total net assets', 'totalNA', true],
    ['Total liabilities & net assets', 'totalLiabNA', true],
  ]
  return (
    <section className="brd-section">
      <h2>Statement of Financial Position</h2>
      {twoColTable(ROWS, cy, py)}
    </section>
  )
}

// ── 5b. Cash & Investments Summary ────────────────────────────────────────────
// PURE presentational: balances / insured / uninsured subtotals, grand total,
// and totalInsured / totalUninsured all come verbatim from the server-assembled
// bundle.cashInvestments (sharedShapes). interestRate is a PERCENT — printed as
// `${rate}%` (em-dash when null). Uses the wider 9-column .brd-table-wide class.
// ZERO client arithmetic — null section ⇒ "Not available" placeholder.
function renderCashInvestments(data) {
  const cash = data.cashInvestments
  if (!cash) {
    return (
      <section className="brd-section">
        <h2>Cash &amp; Investments Summary</h2>
        <p className="brd-placeholder">
          Not available — no cash or investment accounts entered for this period.
        </p>
      </section>
    )
  }
  const gt = cash.grandTotal || {}
  return (
    <section className="brd-section">
      <h2>Cash &amp; Investments Summary</h2>
      <p className="brd-subnote">
        Bank and investment accounts by restriction, with insured vs. uninsured exposure.
      </p>
      <table className="brd-table brd-table-wide">
        <thead>
          <tr>
            <th className="brd-l">Institution</th>
            <th className="brd-l">Account</th>
            <th className="brd-l">Type</th>
            <th className="brd-l">Maturity</th>
            <th>Rate</th>
            <th>Balance</th>
            <th>Insured</th>
            <th>Uninsured</th>
            <th className="brd-l">Comment</th>
          </tr>
        </thead>
        <tbody>
          {(cash.groups || []).map((g) => (
            <CashGroup key={g.key} group={g} />
          ))}
          <tr className="brd-total brd-net">
            <td className="brd-l" colSpan={5}>
              Total Cash &amp; Investments
            </td>
            <td className={cellNeg(gt.balance)}>{money(gt.balance)}</td>
            <td className={cellNeg(cash.totalInsured)}>{money(cash.totalInsured)}</td>
            <td className={cellNeg(cash.totalUninsured)}>{money(cash.totalUninsured)}</td>
            <td className="brd-l" />
          </tr>
        </tbody>
      </table>
    </section>
  )
}

// Print a percent rate verbatim (server passes interestRate through as a percent).
function rateText(r) {
  if (r == null || Number.isNaN(Number(r))) return '—'
  return `${r}%`
}

// One restriction group: header + its accounts + subtotal (all from assemble).
function CashGroup({ group }) {
  const sub = group.subtotal || {}
  return (
    <>
      <tr className="brd-group">
        <td colSpan={9}>{group.label}</td>
      </tr>
      {(group.accounts || []).map((a) => (
        <tr key={a.id}>
          <td className="brd-l">{a.institution || ''}</td>
          <td className="brd-l">{a.accountDescription || ''}</td>
          <td className="brd-l">{a.vehicle || ''}</td>
          <td className="brd-l">{a.maturity || '—'}</td>
          <td>{rateText(a.interestRate)}</td>
          <td className={cellNeg(a.balance)}>{money(a.balance)}</td>
          <td className={cellNeg(a.insuredPortion)}>{money(a.insuredPortion)}</td>
          <td className={cellNeg(a.uninsuredPortion)}>{money(a.uninsuredPortion)}</td>
          <td className="brd-l">{a.comment || ''}</td>
        </tr>
      ))}
      <tr className="brd-total">
        <td className="brd-l" colSpan={5}>
          Subtotal
        </td>
        <td className={cellNeg(sub.balance)}>{money(sub.balance)}</td>
        <td className={cellNeg(sub.insuredPortion)}>{money(sub.insuredPortion)}</td>
        <td className={cellNeg(sub.uninsuredPortion)}>{money(sub.uninsuredPortion)}</td>
        <td className="brd-l" />
      </tr>
    </>
  )
}

// ── 5c. Capital Campaign ──────────────────────────────────────────────────────
// PURE presentational: every figure (line difference, subtotals, campaign total)
// comes verbatim from the server-assembled bundle.capitalCampaign (sharedShapes).
// difference = budget − estimate (NBOA "Difference to Budget"): positive = UNDER
// budget = favorable. The reused overUnder()/cellNeg() formatter+class is
// sign-agnostic, so an under-budget (positive) difference reads positive / not-red
// — NBOA-faithful. Groups are server-discovered in first-seen order; the group
// string is its own display label (no key/label split). ZERO client arithmetic —
// null section ⇒ "Not available" placeholder.
function renderCapitalCampaign(data) {
  const cc = data.capitalCampaign
  if (!cc) {
    return (
      <section className="brd-section">
        <h2>Capital Campaign</h2>
        <p className="brd-placeholder">
          Not available — no capital campaign entered for this period.
        </p>
      </section>
    )
  }
  const gt = cc.grandTotal || {}
  return (
    <section className="brd-section">
      <h2>Capital Campaign</h2>
      {cc.campaignName ? <p className="brd-subnote">{cc.campaignName}</p> : null}
      <table className="brd-table">
        <thead>
          <tr>
            <th className="brd-l">Line</th>
            <th>Budget</th>
            <th>Estimate</th>
            <th>Difference to Budget</th>
            <th className="brd-l brd-explain">Comment</th>
          </tr>
        </thead>
        <tbody>
          {(cc.groups || []).map((g) => (
            <CampaignGroup key={g.group} group={g} />
          ))}
          <tr className="brd-total brd-net">
            <td className="brd-l">Campaign Total</td>
            <td className={cellNeg(gt.budget)}>{money(gt.budget)}</td>
            <td className={cellNeg(gt.estimate)}>{money(gt.estimate)}</td>
            <td className={cellNeg(gt.difference)}>{overUnder(gt.difference)}</td>
            <td className="brd-l brd-explain" />
          </tr>
        </tbody>
      </table>
    </section>
  )
}

// One campaign group: header + its lines + subtotal (all verbatim from assemble).
// group is its own display label (no key/label split).
function CampaignGroup({ group }) {
  const sub = group.subtotal || {}
  return (
    <>
      <tr className="brd-group">
        <td colSpan={5}>{group.group}</td>
      </tr>
      {(group.lines || []).map((l) => (
        <tr key={l.id}>
          <td className="brd-l">{l.label}</td>
          <td className={cellNeg(l.budget)}>{money(l.budget)}</td>
          <td className={cellNeg(l.estimate)}>{money(l.estimate)}</td>
          <td className={cellNeg(l.difference)}>{overUnder(l.difference)}</td>
          <td className="brd-l brd-explain">{l.comment || ''}</td>
        </tr>
      ))}
      <tr className="brd-total">
        <td className="brd-l">Subtotal</td>
        <td className={cellNeg(sub.budget)}>{money(sub.budget)}</td>
        <td className={cellNeg(sub.estimate)}>{money(sub.estimate)}</td>
        <td className={cellNeg(sub.difference)}>{overUnder(sub.difference)}</td>
        <td className="brd-l brd-explain" />
      </tr>
    </>
  )
}

// ── 6. Statement of Changes in Net Assets ─────────────────────────────────────
function renderChangesInNetAssets(data) {
  const cna = data.changesInNetAssets
  if (!cna) {
    return (
      <section className="brd-section">
        <h2>Statement of Changes in Net Assets</h2>
        <p className="brd-placeholder">Not available — no statements for this period.</p>
      </section>
    )
  }
  const cy = cna.cy || {}
  const py = cna.hasPY ? cna.py : null
  const ROWS = [
    ['Net assets, beginning of year', 'begin'],
    ['Without donor restrictions', 'withoutDonor'],
    ['With donor restrictions', 'withDonor'],
    ['Change in net assets', 'change', true],
    ['Net assets, end of year', 'end', true],
  ]
  return (
    <section className="brd-section">
      <h2>Statement of Changes in Net Assets</h2>
      {twoColTable(ROWS, cy, py)}
    </section>
  )
}

// ── 7. Statement of Cash Flows ────────────────────────────────────────────────
function renderCashFlows(data) {
  const scf = data.cashFlows
  if (!scf || scf.available === false) {
    return (
      <section className="brd-section">
        <h2>Statement of Cash Flows</h2>
        <p className="brd-placeholder">Not available for this period.</p>
      </section>
    )
  }
  const ROWS = [
    ['Net cash from operating activities', 'operatingCash'],
    ['Net cash from investing activities', 'investingCash'],
    ['Net cash from financing activities', 'financingCash'],
    ['Net change in cash', 'netCashChange', true],
    ['Cash, beginning of year', 'cashBegin'],
    ['Cash, end of year', 'cashEnd', true],
  ]
  return (
    <section className="brd-section">
      <h2>Statement of Cash Flows</h2>
      {twoColTable(ROWS, scf, null)}
    </section>
  )
}

// Shared current-year (+ optional prior-year) statement table.
function twoColTable(rows, cy, py) {
  return (
    <table className="brd-table">
      <thead>
        <tr>
          <th className="brd-l">&nbsp;</th>
          <th>Current Year</th>
          {py ? <th>Prior Year</th> : null}
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, key, strong]) => {
          const cyv = cy?.[key]
          const pyv = py?.[key]
          return (
            <tr key={key} className={strong ? 'brd-total' : undefined}>
              <td className="brd-l">{label}</td>
              <td className={cellNeg(cyv)}>{cyv == null ? '—' : money(cyv)}</td>
              {py ? <td className={cellNeg(pyv)}>{pyv == null ? '—' : money(pyv)}</td> : null}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// Negative numeric cells get a muted-red class (matches .brd-neg in index.css).
function cellNeg(n) {
  return typeof n === 'number' && n < 0 ? 'brd-neg' : undefined
}
