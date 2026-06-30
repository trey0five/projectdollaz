import { useApp } from '../../context/AppContext.jsx'
import { COLS4, PlainAmt, PlainSub, PlainTotal, LineageCell } from './cells.jsx'
import ReportScroll from './ReportScroll.jsx'

export default function StatementOfFinancialPosition() {
  const { reports, school, dateLabel } = useApp()
  const r = reports.sfpResults
  const { cy, py, audit, hasPY, hasAudit } = r

  if (!cy) {
    return <div className="report-paper text-center text-muted">No data available</div>
  }

  const line = ({ label, cyV, pyV, auV, lineKey }) => (
    <div className={`${COLS4} border-b border-dotted border-black/10 py-1`}>
      <div className="pl-5 font-serif text-sm text-ink">{label}</div>
      <LineageCell statement="SFP" variant="cy" lineKey={lineKey} label={label} value={cyV}>
        <PlainAmt value={cyV} />
      </LineageCell>
      <LineageCell statement="SFP" variant="py" lineKey={lineKey} label={label} value={pyV} show={hasPY}>
        <PlainAmt value={pyV} show={hasPY} />
      </LineageCell>
      <LineageCell statement="SFP" variant="audit" lineKey={lineKey} label={label} value={auV} show={hasAudit}>
        <PlainAmt value={auV} show={hasAudit} />
      </LineageCell>
    </div>
  )
  const sub = ({ label, cyV, pyV, auV, lineKey }) => (
    <div className={`${COLS4} mt-0.5 py-1.5`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-navy">{label}</div>
      <LineageCell statement="SFP" variant="cy" lineKey={lineKey} label={label} value={cyV}>
        <PlainSub value={cyV} />
      </LineageCell>
      <LineageCell statement="SFP" variant="py" lineKey={lineKey} label={label} value={pyV} show={hasPY}>
        <PlainSub value={pyV} show={hasPY} />
      </LineageCell>
      <LineageCell statement="SFP" variant="audit" lineKey={lineKey} label={label} value={auV} show={hasAudit}>
        <PlainSub value={auV} show={hasAudit} />
      </LineageCell>
    </div>
  )
  const total = ({ label, cyV, pyV, auV, lineKey }) => (
    <div className={`${COLS4} mt-1.5 py-2`}>
      <div className="font-serif text-[15px] font-semibold text-navy">{label}</div>
      <LineageCell statement="SFP" variant="cy" lineKey={lineKey} label={label} value={cyV}>
        <PlainTotal value={cyV} />
      </LineageCell>
      <LineageCell statement="SFP" variant="py" lineKey={lineKey} label={label} value={pyV} show={hasPY}>
        <PlainTotal value={pyV} show={hasPY} />
      </LineageCell>
      <LineageCell statement="SFP" variant="audit" lineKey={lineKey} label={label} value={auV} show={hasAudit}>
        <PlainTotal value={auV} show={hasAudit} />
      </LineageCell>
    </div>
  )
  const subsection = (label) => (
    <div className="py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
  )

  return (
    <ReportScroll width="wide">
    <div className="report-paper animate-fade-up">
      <div className="rpt-school">{school.name}</div>
      <div className="rpt-title">Statement of Financial Position</div>
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

      <div className="section-header">Assets</div>
      {subsection('Current assets:')}
      {line({ label: 'Cash and cash equivalents', lineKey: 'cash', cyV: cy.cash, pyV: py?.cash, auV: audit?.cash })}
      {line({ label: 'Restricted cash', lineKey: 'restrictedCash', cyV: cy.restrictedCash, pyV: py?.restrictedCash, auV: audit?.restrictedCash })}
      {line({ label: 'Tuition receivable, net', lineKey: 'tuitionRec', cyV: cy.tuitionRec, pyV: py?.tuitionRec, auV: audit?.tuitionRec })}
      {line({ label: 'Prepaid expenses', lineKey: 'prepaid', cyV: cy.prepaid, pyV: py?.prepaid, auV: audit?.prepaid })}
      {sub({ label: 'Total current assets', lineKey: 'totalCurrentA', cyV: cy.totalCurrentA, pyV: py?.totalCurrentA, auV: audit?.totalCurrentA })}

      <div className="h-2.5" />
      {line({ label: 'Property and equipment, net', lineKey: 'ppNet', cyV: cy.ppNet, pyV: py?.ppNet, auV: audit?.ppNet })}
      {line({ label: 'Right to use assets', lineKey: 'rouAsset', cyV: cy.rouAsset, pyV: py?.rouAsset, auV: audit?.rouAsset })}
      {line({ label: 'Restricted investments', lineKey: 'restrictInvst', cyV: cy.restrictInvst, pyV: py?.restrictInvst, auV: audit?.restrictInvst })}
      {total({ label: 'Total assets', lineKey: 'totalAssets', cyV: cy.totalAssets, pyV: py?.totalAssets, auV: audit?.totalAssets })}

      <hr className="my-6 border-rule" />

      <div className="section-header pt-0">Liabilities and Net Assets</div>
      {subsection('Current liabilities:')}
      {line({ label: 'Accounts payable and accrued expenses', lineKey: 'apAccrued', cyV: cy.apAccrued, pyV: py?.apAccrued, auV: audit?.apAccrued })}
      {line({ label: 'Due to student clubs', lineKey: 'studentClubs', cyV: cy.studentClubs, pyV: py?.studentClubs, auV: audit?.studentClubs })}
      {line({ label: 'Deferred international program fees', lineKey: 'deferredIntl', cyV: cy.deferredIntl, pyV: py?.deferredIntl, auV: audit?.deferredIntl })}
      {line({ label: 'Lease obligations, current portion', lineKey: 'leaseCurr', cyV: cy.leaseCurr, pyV: py?.leaseCurr, auV: audit?.leaseCurr })}
      {sub({ label: 'Total current liabilities', lineKey: 'totalCurrL', cyV: cy.totalCurrL, pyV: py?.totalCurrL, auV: audit?.totalCurrL })}

      <div className="h-2" />
      {line({ label: 'Lease obligations, noncurrent portion', lineKey: 'leaseNonCurr', cyV: cy.leaseNonCurr, pyV: py?.leaseNonCurr, auV: audit?.leaseNonCurr })}
      {sub({ label: 'Total liabilities', lineKey: 'totalLiab', cyV: cy.totalLiab, pyV: py?.totalLiab, auV: audit?.totalLiab })}

      <div className="h-3" />
      {subsection('Net assets:')}
      {line({ label: 'Without donor restrictions', lineKey: 'naWithout', cyV: cy.naWithout, pyV: py?.naWithout, auV: audit?.naWithout })}
      {line({ label: 'With donor restrictions', lineKey: 'naWith', cyV: cy.naWith, pyV: py?.naWith, auV: audit?.naWith })}
      {sub({ label: 'Total net assets', lineKey: 'totalNA', cyV: cy.totalNA, pyV: py?.totalNA, auV: audit?.totalNA })}
      {total({ label: 'Total liabilities and net assets', lineKey: 'totalLiabNA', cyV: cy.totalLiabNA, pyV: py?.totalLiabNA, auV: audit?.totalLiabNA })}
    </div>
    </ReportScroll>
  )
}
