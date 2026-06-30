import { useApp } from '../../context/AppContext.jsx'
import { fmt } from '../../lib/format.js'
import { COLS4, LineAmt, SubAmt, DollarAmt, LineageCell } from './cells.jsx'
import ReportScroll from './ReportScroll.jsx'

export default function StatementOfActivities() {
  const { reports, school, dateLabel, periodLabel } = useApp()
  const r = reports.soaResults
  const { cy, py, audit, hasPY, hasAudit } = r

  // Render-helper functions (invoked as calls, not components) so they are
  // not re-created on every render.
  const line = ({ label, cyV, pyV, auV, first, lineKey }) => (
    <div className={`${COLS4} border-b border-dotted border-black/10 py-1`}>
      <div className={`pl-5 font-serif text-sm text-ink ${first ? 'font-semibold' : ''}`}>{label}</div>
      <LineageCell statement="SOA" variant="cy" lineKey={lineKey} label={label} value={cyV}>
        <LineAmt value={cyV} />
      </LineageCell>
      <LineageCell statement="SOA" variant="py" lineKey={lineKey} label={label} value={pyV} show={hasPY}>
        <LineAmt value={pyV} show={hasPY} />
      </LineageCell>
      <LineageCell statement="SOA" variant="audit" lineKey={lineKey} label={label} value={auV} show={hasAudit}>
        <LineAmt value={auV} show={hasAudit} />
      </LineageCell>
    </div>
  )

  const sub = ({ label, cyV, pyV, auV, lineKey }) => (
    <div className={`${COLS4} mt-0.5 py-1.5`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-navy">{label}</div>
      <LineageCell statement="SOA" variant="cy" lineKey={lineKey} label={label} value={cyV}>
        <SubAmt value={cyV} />
      </LineageCell>
      <LineageCell statement="SOA" variant="py" lineKey={lineKey} label={label} value={pyV} show={hasPY}>
        <SubAmt value={pyV} show={hasPY} />
      </LineageCell>
      <LineageCell statement="SOA" variant="audit" lineKey={lineKey} label={label} value={auV} show={hasAudit}>
        <SubAmt value={auV} show={hasAudit} />
      </LineageCell>
    </div>
  )

  return (
    <ReportScroll width="wide">
    <div className="report-paper animate-fade-up">
      <div className="rpt-school">{school.name}</div>
      <div className="rpt-title">Statement of Activities and Changes in Net Assets</div>
      <div className="rpt-period">For the {periodLabel} Ended {dateLabel}</div>
      <div className="rpt-internal">(For Internal Purposes Only)</div>
      <hr className="rpt-rule" />

      {/* column headers */}
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
          {hasAudit ? 'Audited FY End' : 'FY End'}
          <span className="col-hdr-sub">{hasAudit ? 'Audited' : '—'}</span>
        </div>
      </div>

      <div className="section-header">Revenue and support:</div>
      {line({ label: 'Tuitions and fees, net', lineKey: 'tuition', cyV: cy.tuition, pyV: py?.tuition, auV: audit?.tuition, first: true })}
      {line({ label: 'Development income', lineKey: 'dev', cyV: cy.dev, pyV: py?.dev, auV: audit?.dev })}
      {line({ label: 'Student activities income', lineKey: 'studAct', cyV: cy.studAct, pyV: py?.studAct, auV: audit?.studAct })}
      {line({ label: 'Textbook leasing income', lineKey: 'textbook', cyV: cy.textbook, pyV: py?.textbook, auV: audit?.textbook })}
      {line({ label: 'Other', lineKey: 'other', cyV: cy.other, pyV: py?.other, auV: audit?.other })}
      {line({ label: 'Support', lineKey: 'support', cyV: cy.support, pyV: py?.support, auV: audit?.support })}
      {line({ label: 'Grant revenue', cyV: 0, pyV: hasPY ? 0 : null, auV: hasAudit ? 0 : null })}
      {line({ label: 'International program', lineKey: 'intlRev', cyV: cy.intlRev, pyV: py?.intlRev, auV: audit?.intlRev })}
      {line({ label: 'Net gain (loss) on investments', lineKey: 'investments', cyV: cy.investments, pyV: py?.investments, auV: audit?.investments })}
      {line({ label: 'Interest income', lineKey: 'interest', cyV: cy.interest, pyV: py?.interest, auV: audit?.interest })}
      {sub({ label: 'Total revenue and support', lineKey: 'totalRev', cyV: cy.totalRev, pyV: py?.totalRev, auV: audit?.totalRev })}

      <div className="section-header mt-3">Expenses:</div>
      {line({ label: 'Instructional', lineKey: 'instructional', cyV: cy.instructional, pyV: py?.instructional, auV: audit?.instructional, first: true })}
      {line({ label: 'Facilities', lineKey: 'facilities', cyV: cy.facilities, pyV: py?.facilities, auV: audit?.facilities })}
      {line({ label: 'Fixed charges and other', lineKey: 'fixedOther', cyV: cy.fixedOther, pyV: py?.fixedOther, auV: audit?.fixedOther })}
      {line({ label: 'International program & resale', lineKey: 'intlExp', cyV: cy.intlExp, pyV: py?.intlExp, auV: audit?.intlExp })}
      {line({ label: 'Pupil transportation', lineKey: 'bus', cyV: cy.bus, pyV: py?.bus, auV: audit?.bus })}
      {line({ label: 'Food service costs', lineKey: 'food', cyV: cy.food, pyV: py?.food, auV: audit?.food })}
      {line({ label: 'Student activities', lineKey: 'studActExp', cyV: cy.studActExp, pyV: py?.studActExp, auV: audit?.studActExp })}
      {line({ label: 'Athletics', lineKey: 'athletics', cyV: cy.athletics, pyV: py?.athletics, auV: audit?.athletics })}
      {line({ label: 'Administration', lineKey: 'admin', cyV: cy.admin, pyV: py?.admin, auV: audit?.admin })}
      {line({ label: 'Restricted expenditures', lineKey: 'restricted', cyV: cy.restricted, pyV: py?.restricted, auV: audit?.restricted })}
      {sub({ label: 'Total expenses', lineKey: 'totalExp', cyV: cy.totalExp, pyV: py?.totalExp, auV: audit?.totalExp })}

      {/* net change */}
      <div className={`${COLS4} mt-4 border-t-2 border-navy py-2.5`}>
        <div className="font-serif text-[15px] font-semibold text-navy">Changes in unrestricted net assets</div>
        <div className={`amt border-t-2 border-navy pt-2 font-semibold text-navy ${cy.netChange < 0 ? 'amt-neg' : ''}`}>{fmt(cy.netChange)}</div>
        <div className={`amt border-t-2 border-navy pt-2 font-semibold ${hasPY ? 'text-navy' : 'text-gray-300'} ${hasPY && py.netChange < 0 ? 'amt-neg' : ''}`}>{hasPY ? fmt(py.netChange) : '—'}</div>
        <div className={`amt border-t-2 border-navy pt-2 font-semibold ${hasAudit ? 'text-navy' : 'text-gray-300'} ${hasAudit && audit.netChange < 0 ? 'amt-neg' : ''}`}>{hasAudit ? fmt(audit.netChange) : '—'}</div>
      </div>

      {/* net assets roll-forward */}
      <div className="mt-6">
        <div className={`${COLS4} py-1.5`}>
          <div className="font-serif text-sm text-ink">Net assets, at beginning of year</div>
          <DollarAmt value={r.cyNABegin} />
          <DollarAmt value={r.pyNABegin} show={hasPY} />
          <DollarAmt value={r.auditNABegin} show={hasAudit} />
        </div>
        <div className="h-2" />
        <div className={`${COLS4} border-t-2 border-navy py-2`}>
          <div className="font-serif text-[15px] font-semibold text-navy">Net assets, at end of period</div>
          <DollarAmt value={r.cyNAEnd} final />
          <DollarAmt value={r.pyNAEnd} show={hasPY} final />
          <DollarAmt value={r.auditNAEnd} show={hasAudit} final />
        </div>
      </div>
    </div>
    </ReportScroll>
  )
}
