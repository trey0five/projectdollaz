// ─────────────────────────────────────────────────────────────────────────────
// Phase 2C — the Year-End Workpapers Packet print document. Rendered on the
// dedicated /readiness/workpapers/print route; legible black-on-white, scoped
// under the `.packet-print` class so it never collides with the report or
// .cap-print blocks. Sections IN ORDER: COVER + DISCLAIMER, STATEMENTS schedules
// (read straight from the GET /workpapers snapshot payload — NO client recompute),
// SCHOLARSHIP RECONCILIATION schedule, COMPLIANCE FINDINGS schedule, CORRECTIVE
// ACTION PLAN. Clearly labeled a readiness packet (not the official AUP).
// ─────────────────────────────────────────────────────────────────────────────
import { fmt } from '../../../lib/format.js'
import { complianceStatusMeta, sectionTitle } from '../../../lib/complianceMeta.js'

const STATUS_LABEL = { open: 'Open', in_progress: 'In progress', complete: 'Complete' }
const SEV_LABEL = { material: 'Material', reportable: 'Reportable' }

// A simple label/amount schedule table; the last row can be flagged as a bold total.
function ScheduleTable({ title, rows }) {
  return (
    <div className="packet-print-schedule">
      <h3>{title}</h3>
      <table>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={r.total ? 'packet-print-total' : ''}>
              <td>{r.label}</td>
              <td className="packet-print-amt">{fmt(r.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StatementsSection({ statements }) {
  if (!statements?.hasSnapshot) {
    return (
      <section className="packet-print-section">
        <h2>Financial Statements</h2>
        <p className="packet-print-muted">No saved statement snapshot for this period.</p>
      </section>
    )
  }
  const { activities: a, financialPosition: fp, cashFlows: cf, netAssets: na } = statements

  return (
    <section className="packet-print-section">
      <h2>Financial Statements</h2>

      {a && (
        <ScheduleTable
          title="Statement of Activities"
          rows={[
            { label: 'Tuition & fees', value: a.tuition },
            { label: 'Development / contributions', value: a.dev },
            { label: 'Student activities', value: a.studAct },
            { label: 'Textbooks', value: a.textbook },
            { label: 'Other revenue', value: a.other },
            { label: 'Support / grants', value: a.support },
            { label: 'Investment income', value: a.investments },
            { label: 'Interest', value: a.interest },
            { label: 'Total revenue', value: a.totalRev, total: true },
            { label: 'Instructional', value: a.instructional },
            { label: 'Facilities', value: a.facilities },
            { label: 'Administrative', value: a.admin },
            { label: 'Athletics', value: a.athletics },
            { label: 'Food service', value: a.food },
            { label: 'Transportation', value: a.bus },
            { label: 'Total expenses', value: a.totalExp, total: true },
            { label: 'Change in net assets', value: a.netChange, total: true },
          ]}
        />
      )}

      {fp && (
        <ScheduleTable
          title="Statement of Financial Position"
          rows={[
            { label: 'Cash', value: fp.cash },
            { label: 'Restricted cash', value: fp.restrictedCash },
            { label: 'Tuition receivable', value: fp.tuitionRec },
            { label: 'Prepaid', value: fp.prepaid },
            { label: 'Property & equipment, net', value: fp.ppNet },
            { label: 'Total assets', value: fp.totalAssets, total: true },
            { label: 'Accounts payable & accrued', value: fp.apAccrued },
            { label: 'Total liabilities', value: fp.totalLiab, total: true },
            { label: 'Net assets without donor restrictions', value: fp.naWithout },
            { label: 'Net assets with donor restrictions', value: fp.naWith },
            { label: 'Total net assets', value: fp.totalNA, total: true },
            { label: 'Total liabilities & net assets', value: fp.totalLiabNA, total: true },
          ]}
        />
      )}

      {cf && (
        <ScheduleTable
          title="Statement of Cash Flows"
          rows={[
            { label: 'Change in net assets', value: cf.netChange },
            { label: 'Depreciation', value: cf.depr },
            { label: 'Net cash from operating activities', value: cf.operatingCash, total: true },
            { label: 'Net cash from investing activities', value: cf.investingCash, total: true },
            { label: 'Net cash from financing activities', value: cf.financingCash, total: true },
            { label: 'Net change in cash', value: cf.netCashChange, total: true },
            { label: 'Cash, beginning', value: cf.cashBegin },
            { label: 'Cash, ending', value: cf.cashEnd, total: true },
          ]}
        />
      )}

      {na && (
        <ScheduleTable
          title="Statement of Changes in Net Assets"
          rows={[
            { label: 'Net assets, beginning', value: na.begin },
            { label: 'Change in net assets', value: na.change },
            { label: 'Without donor restrictions', value: na.withoutDonor },
            { label: 'With donor restrictions', value: na.withDonor },
            { label: 'Net assets, ending', value: na.end, total: true },
          ]}
        />
      )}
    </section>
  )
}

function ReconciliationSection({ reconciliation }) {
  const r = reconciliation?.result
  if (!r) return null
  const byProgram = Object.entries(r.byProgram ?? {})
  const byMonth = Object.entries(r.byMonth ?? {})
  return (
    <section className="packet-print-section">
      <h2>Scholarship Reconciliation</h2>
      <ScheduleTable
        title="Summary"
        rows={[
          { label: 'Total disbursed (funding org)', value: r.totalDisbursed },
          { label: 'Recorded scholarship revenue', value: r.recordedScholarshipRevenue },
          { label: 'Variance', value: r.variance, total: true },
        ]}
      />
      <p className="packet-print-status">
        Reconciliation status: <strong>{r.status ?? '—'}</strong> ·{' '}
        {reconciliation.disbursementCount} disbursement
        {reconciliation.disbursementCount === 1 ? '' : 's'}
      </p>

      {byProgram.length > 0 && (
        <ScheduleTable
          title="By program"
          rows={byProgram.map(([k, v]) => ({
            label: k,
            value: typeof v === 'object' ? v.total ?? v.amount ?? 0 : v,
          }))}
        />
      )}
      {byMonth.length > 0 && (
        <ScheduleTable
          title="By month"
          rows={byMonth.map(([k, v]) => ({
            label: k,
            value: typeof v === 'object' ? v.total ?? v.amount ?? 0 : v,
          }))}
        />
      )}
      {Array.isArray(r.anomalies) && r.anomalies.length > 0 && (
        <div className="packet-print-anomalies">
          <h3>Anomalies</h3>
          <ul>
            {r.anomalies.map((an, i) => (
              <li key={i}>{an.message ?? an.detail ?? an.type ?? JSON.stringify(an)}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function FindingsSection({ findings }) {
  const sections = findings?.sections ?? []
  return (
    <section className="packet-print-section">
      <h2>Compliance Findings</h2>
      {sections.length === 0 ? (
        <p className="packet-print-muted">No findings evaluated for this period.</p>
      ) : (
        sections.map((group) => (
          <div key={group.section} className="packet-print-findings-group">
            <h3>
              {group.section} · {sectionTitle(group.section)}
            </h3>
            <table>
              <tbody>
                {group.findings.map((f) => (
                  <tr key={f.id}>
                    <td>{f.title}</td>
                    <td className="packet-print-fstatus">{complianceStatusMeta(f.status).label}</td>
                    <td className="packet-print-cite">{f.citation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </section>
  )
}

function CapSection({ cap }) {
  const live = (cap?.entries ?? []).filter((e) => !e.isResolved)
  return (
    <section className="packet-print-section">
      <h2>Corrective Action Plan</h2>
      {live.length === 0 ? (
        <p className="packet-print-muted">
          No material or reportable exceptions were flagged for this period.
        </p>
      ) : (
        live.map((e, i) => (
          <article key={e.ruleId} className="packet-print-cap-entry">
            <div className="packet-print-cap-head">
              <span className="packet-print-num">{i + 1}</span>
              <h3>{e.title}</h3>
              <span className="packet-print-sev">{SEV_LABEL[e.severity] ?? e.severity}</span>
              <span className="packet-print-cite">{e.citation}</span>
            </div>
            <p>
              <strong>Observation:</strong> {e.observation || '—'}
            </p>
            <p>
              <strong>Root cause:</strong> {e.rootCause || e.suggestedRootCause || '—'}
            </p>
            <p>
              <strong>Corrective action:</strong>{' '}
              {e.correctiveAction || e.suggestedCorrectiveAction || '—'}
            </p>
            <p>
              <strong>Responsible party:</strong>{' '}
              {e.responsibleParty || e.suggestedResponsibleParty || '—'} ·{' '}
              <strong>Target:</strong> {e.targetDate || e.suggestedTimeframe || '—'} ·{' '}
              <strong>Status:</strong> {STATUS_LABEL[e.status] ?? e.status}
            </p>
          </article>
        ))
      )}
    </section>
  )
}

export default function WorkpapersPrintDocument({ packet }) {
  if (!packet) return null
  const { meta, statements, reconciliation, findings, cap, checklist } = packet
  const generated = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const rollup = checklist?.rollup

  return (
    <div className="ui-v1 packet-print">
      {/* COVER */}
      <header className="packet-print-cover">
        <h1>Year-End Workpapers Packet</h1>
        <div className="packet-print-meta">
          <div>
            <strong>{meta?.schoolName || 'School'}</strong>
            {meta?.periodLabel ? ` · ${meta.periodLabel}` : ''}
          </div>
          <div className="packet-print-muted">
            Period end {meta?.periodEndDate || '—'} · Florida scholarship AUP · ruleset{' '}
            {meta?.rulesetVersion} (statute {meta?.statuteYear}) · generated {generated}
          </div>
          {rollup && (
            <div className="packet-print-muted">
              Checklist readiness: {rollup.done + rollup.na} / {rollup.total} resolved (
              {rollup.pctComplete}% — {rollup.done} done, {rollup.na} n/a)
            </div>
          )}
        </div>
      </header>

      <section className="packet-print-disclaimer">
        <strong>Readiness workpapers packet — not the official AUP submission.</strong> This
        packet aggregates your saved statements, compliance findings, scholarship
        reconciliation, and corrective action plan so you can prepare before your CPA
        engagement. It mirrors the Step Up For Students AUP template and the governing Florida
        statutes. It is <em>not</em> the official Agreed-Upon-Procedures report and <em>not</em>{' '}
        legal or audit advice.
      </section>

      <StatementsSection statements={statements} />
      <ReconciliationSection reconciliation={reconciliation} />
      <FindingsSection findings={findings} />
      <CapSection cap={cap} />
    </div>
  )
}
