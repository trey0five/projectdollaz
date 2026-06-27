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
  'Statement of Financial Position',
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
      {renderFinancialPosition(data)}
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
            <th>Actual</th>
            <th>Budget</th>
            <th>Over (Under)</th>
            <th>%</th>
            <th className="brd-l brd-explain">Explanation</th>
          </tr>
        </thead>
        <tbody>
          <tr className="brd-group">
            <td colSpan={6}>Revenue</td>
          </tr>
          {(ops.revenue || []).map((r) => opRow(r))}
          {totalRow('Total revenue', ops.revenueTotals)}

          <tr className="brd-group">
            <td colSpan={6}>Expenses</td>
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
