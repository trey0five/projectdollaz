import { useApp } from '../../context/AppContext.jsx'
import { COLS4, DollarAmt, PlainAmt, PlainSub, LineageCell } from './cells.jsx'
import ReportScroll from './ReportScroll.jsx'

export default function StatementOfNetAssets() {
  const { reports, school, dateLabel } = useApp()
  const r = reports.netAssets
  const { cy, py, audit, hasPY, hasAudit } = r

  // NetAssets lineage is CY-only (buildNetAssetsLineage), so only the CY cell is
  // clickable; PY/Audited render plain.
  const line = ({ label, cyV, pyV, auV, first, lineKey }) => (
    <div className={`${COLS4} border-b border-dotted border-black/10 py-1`}>
      <div className={`pl-5 font-serif text-sm text-ink ${first ? 'font-semibold' : ''}`}>{label}</div>
      <LineageCell statement="NetAssets" lineKey={lineKey} label={label} value={cyV}>
        <DollarAmt value={cyV} />
      </LineageCell>
      <DollarAmt value={pyV} show={hasPY} />
      <DollarAmt value={auV} show={hasAudit} />
    </div>
  )

  return (
    <ReportScroll width="wide">
    <div className="report-paper animate-fade-up">
      <div className="rpt-school">{school.name}</div>
      <div className="rpt-title">Statement of Changes in Net Assets</div>
      <div className="rpt-period">
        {dateLabel}
        {hasPY ? ' and Prior Year' : ''}
        {hasAudit ? ' and Audited FY End' : ''}
      </div>
      <div className="rpt-internal">(For Internal Purposes Only)</div>
      <hr className="rpt-rule" />

      <div className={`${COLS4} border-b border-navy py-2.5`}>
        <div />
        <div className="col-hdr">
          {dateLabel}
          <span className="col-hdr-sub">Unaudited</span>
        </div>
        <div className="col-hdr">
          Prior Year
          <span className="col-hdr-sub">{hasPY ? 'Unaudited' : '—'}</span>
        </div>
        <div className="col-hdr">
          Audited FY End
          <span className="col-hdr-sub">{hasAudit ? 'Audited' : '—'}</span>
        </div>
      </div>

      <div className="section-header">Net assets roll-forward</div>
      {line({
        label: 'Net assets, at beginning of year',
        lineKey: 'begin',
        cyV: cy.begin,
        pyV: py?.begin,
        auV: audit?.begin,
        first: true,
      })}
      {line({
        label: 'Change in net assets',
        lineKey: 'change',
        cyV: cy.change,
        pyV: py?.change,
        auV: audit?.change,
      })}

      <div className={`${COLS4} mt-1.5 py-2`}>
        <div className="font-serif text-[15px] font-semibold text-navy">Net assets, at end of period</div>
        <LineageCell statement="NetAssets" lineKey="end" label="Net assets, at end of period" value={cy.end}>
          <DollarAmt value={cy.end} final />
        </LineageCell>
        <DollarAmt value={py?.end} show={hasPY} final />
        <DollarAmt value={audit?.end} show={hasAudit} final />
      </div>

      <div className="h-4" />
      <div className="section-header">Ending net assets by donor restriction</div>
      <div className={`${COLS4} border-b border-dotted border-black/10 py-1`}>
        <div className="pl-5 font-serif text-sm text-ink">Without donor restrictions</div>
        <LineageCell statement="NetAssets" lineKey="withoutDonor" label="Without donor restrictions" value={cy.withoutDonor}>
          <PlainAmt value={cy.withoutDonor} />
        </LineageCell>
        <PlainAmt value={py?.withoutDonor} show={hasPY} />
        <PlainAmt value={audit?.withoutDonor} show={hasAudit} />
      </div>
      <div className={`${COLS4} border-b border-dotted border-black/10 py-1`}>
        <div className="pl-5 font-serif text-sm text-ink">With donor restrictions</div>
        <LineageCell statement="NetAssets" lineKey="withDonor" label="With donor restrictions" value={cy.withDonor}>
          <PlainAmt value={cy.withDonor} />
        </LineageCell>
        <PlainAmt value={py?.withDonor} show={hasPY} />
        <PlainAmt value={audit?.withDonor} show={hasAudit} />
      </div>
      <div className={`${COLS4} mt-0.5 py-1.5`}>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-navy">Total ending net assets</div>
        <LineageCell statement="NetAssets" lineKey="end" label="Total ending net assets" value={cy.end}>
          <PlainSub value={cy.end} />
        </LineageCell>
        <PlainSub value={py?.end} show={hasPY} />
        <PlainSub value={audit?.end} show={hasAudit} />
      </div>
    </div>
    </ReportScroll>
  )
}
