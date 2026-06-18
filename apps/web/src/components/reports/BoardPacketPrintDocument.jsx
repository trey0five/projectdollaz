// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 — one-click Board / Finance-Committee packet. A clean, print-friendly
// EXECUTIVE summary (not the audit-detail workpapers): an insight summary, key
// financial metrics, and at-a-glance compliance / CAP / reconciliation status.
// Pure presentational; scoped under the `board-print` class in index.css so it
// never collides with the cap-print / packet-print blocks.
// ─────────────────────────────────────────────────────────────────────────────
import { metricFormat, formatMetricValue, STATUS_META } from '../../lib/metricMeta.js'
import { complianceStatusMeta } from '../../lib/complianceMeta.js'
import { fmtDollar } from '../../lib/format.js'

const RECON_STATUS = {
  matched: 'In balance',
  variance: 'Variance — review',
  needs_data: 'Awaiting data',
}

// Parse the insight text into Risk/Watch/Strength signals (LLM returns tagged
// lines; the rule fallback is a paragraph → split into untagged points).
function parseSignals(text) {
  if (!text) return []
  let items = String(text).split(/\n+/).map((s) => s.trim()).filter(Boolean)
  if (items.length <= 1) {
    items = String(text).split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)
  }
  const re = /^[[(]?\s*(risk|watch|strength|strong|opportunity|good|ok)\b\s*[\])\-:.–—]*\s*/i
  return items
    .slice(0, 6)
    .map((raw) => {
      let t = raw.replace(/^[-•*]\s*/, '')
      const m = t.match(re)
      let cat = ''
      if (m) {
        const k = m[1].toLowerCase()
        cat = k === 'risk' ? 'Risk' : k === 'watch' ? 'Watch' : 'Strength'
        t = t.slice(m[0].length)
      }
      return { cat, text: t.replace(/\s+/g, ' ').trim() }
    })
    .filter((s) => s.text)
}

export default function BoardPacketPrintDocument({
  schoolName,
  periodLabel,
  metrics,
  insightText,
  complianceSummary,
  complianceSections,
  capSummary,
  reconciliation,
}) {
  const generated = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const signals = parseSignals(insightText)
  const liveMetrics = (metrics ?? []).filter((m) => m.available && m.value != null)
  const cCounts = complianceSummary?.counts ?? {}
  const flagged = (complianceSections ?? [])
    .flatMap((g) => g.findings ?? [])
    .filter((f) => f.status === 'material' || f.status === 'reportable')
  const cap = capSummary ?? {}
  const recon = reconciliation ?? null

  return (
    <div className="board-print">
      <header className="board-print-header">
        <p className="board-print-kicker">Board Financial Summary</p>
        <h1>{schoolName || 'School'}</h1>
        <div className="board-print-meta">
          {periodLabel ? <span>{periodLabel}</span> : null}
          <span>Generated {generated}</span>
        </div>
        <p className="board-print-disclaimer">
          Management summary for the board / finance committee, derived from the latest uploaded
          statements. Not an audited financial statement.
        </p>
      </header>

      {signals.length > 0 && (
        <section className="board-print-section">
          <h2>Executive summary</h2>
          <ul className="board-print-signals">
            {signals.map((s, i) => (
              <li key={i}>
                {s.cat ? <span className={`board-print-tag tag-${s.cat.toLowerCase()}`}>{s.cat}</span> : null}
                <span>{s.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {liveMetrics.length > 0 && (
        <section className="board-print-section">
          <h2>Key financial metrics</h2>
          <table className="board-print-table">
            <tbody>
              {liveMetrics.map((m) => (
                <tr key={m.key}>
                  <td>{m.label}</td>
                  <td className="board-print-num">
                    {formatMetricValue(m.value, metricFormat(m.key, m.unit))}
                  </td>
                  <td className="board-print-muted">{STATUS_META[m.status]?.label ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="board-print-section">
        <h2>Compliance readiness</h2>
        <p>
          <strong>{cCounts.material ?? 0}</strong> material ·{' '}
          <strong>{cCounts.reportable ?? 0}</strong> reportable finding
          {(cCounts.reportable ?? 0) === 1 ? '' : 's'} for this period.
        </p>
        {flagged.length > 0 && (
          <ul className="board-print-list">
            {flagged.map((f) => (
              <li key={f.id}>
                <strong>{complianceStatusMeta(f.status).label}</strong> — {f.title}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="board-print-section">
        <h2>Corrective action plan</h2>
        <p>
          <strong>{cap.openCount ?? 0}</strong> open ·{' '}
          <strong>{cap.inProgressCount ?? 0}</strong> in progress ·{' '}
          <strong>{cap.completeCount ?? 0}</strong> complete
          {cap.resolvedCount ? ` · ${cap.resolvedCount} self-healed` : ''}.
        </p>
      </section>

      {recon && (
        <section className="board-print-section">
          <h2>Scholarship reconciliation</h2>
          <p>
            Status: <strong>{RECON_STATUS[recon.status] ?? recon.status ?? '—'}</strong>. Variance{' '}
            {fmtDollar(recon.variance)} (disbursed {fmtDollar(recon.totalDisbursed)} vs recorded{' '}
            {fmtDollar(recon.recordedScholarshipRevenue)}).
          </p>
        </section>
      )}
    </div>
  )
}
