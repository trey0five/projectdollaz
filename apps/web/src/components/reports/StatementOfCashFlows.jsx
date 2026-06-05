import { useApp } from '../../context/AppContext.jsx'
import { plain } from '../../lib/format.js'
import ReportScroll from './ReportScroll.jsx'

const COLS = 'grid grid-cols-[minmax(0,1fr)_220px]'
const paren = (v) => (v < 0 ? `(${plain(Math.abs(v))})` : plain(Math.abs(v)))

export default function StatementOfCashFlows() {
  const { reports, school, dateLabel, periodLabel } = useApp()
  const s = reports.scf

  if (!s) {
    return (
      <div className="report-paper text-center">
        <p className="px-10 py-12 font-serif text-lg italic text-muted">
          Upload the Audited FY End Trial Balance to generate the Statement of Cash Flows.
          <br />
          <span className="text-sm">
            (Beginning balances are required for cash flow calculations.)
          </span>
        </p>
      </div>
    )
  }

  const section = (label) => (
    <div className="pt-[18px] pb-1.5 font-serif text-[13px] font-semibold italic text-navy">{label}</div>
  )
  const note = (label, pl) => (
    <div className="py-1 font-serif text-[13px] italic text-muted" style={{ paddingLeft: pl }}>{label}</div>
  )

  const row = ({ label, val, indent = 20, bold, top, double }) => {
    const border = double ? 'border-t-2 border-navy' : top ? 'border-t border-navy' : 'border-b border-dotted border-black/10'
    const mt = top || double ? 'mt-0.5' : ''
    return (
      <div className={`${COLS} py-1 ${border} ${mt}`}>
        <div
          className={bold ? 'font-sans text-[11px] font-semibold uppercase tracking-wide text-navy' : 'font-serif text-sm text-ink'}
          style={{ paddingLeft: indent }}
        >
          {label}
        </div>
        <div className={`amt ${bold ? 'font-semibold text-navy' : ''} ${val < 0 ? 'amt-neg' : ''}`}>{paren(val)}</div>
      </div>
    )
  }

  const total = ({ label, val }) => (
    <div className={`${COLS} mt-1 border-t-2 border-navy py-2`}>
      <div className="font-serif text-[15px] font-semibold text-navy">{label}</div>
      <div className={`amt border-t-2 border-navy pt-1 font-semibold text-navy ${val < 0 ? 'amt-neg' : ''}`}>$ {paren(val)}</div>
    </div>
  )

  const cash = ({ label, val, isTotal }) => (
    <div className={`${COLS} py-1.5 ${isTotal ? 'mt-0.5' : ''}`}>
      <div className={`font-serif text-sm text-navy ${isTotal ? 'border-t-2 border-navy pt-1.5 font-semibold' : 'pl-5'}`}>{label}</div>
      <div className={`amt text-navy ${isTotal ? 'border-t-2 border-navy pt-1.5 font-semibold' : ''}`}>$ {plain(val)}</div>
    </div>
  )

  return (
    <ReportScroll width="narrow">
    <div className="report-paper animate-fade-up">
      <div className="rpt-school">{school.name}</div>
      <div className="rpt-title">Statement of Cash Flows</div>
      <div className="rpt-period">For the {periodLabel} Ended {dateLabel}</div>
      <div className="rpt-internal">(For Internal Purposes Only)</div>
      <hr className="rpt-rule mb-2" />

      {section('Cash flows from operating activities:')}
      {row({ label: 'Change in net assets', val: s.netChange })}
      {note('Adjustments to reconcile change in net assets to net cash provided by operating activities:', 20)}
      {row({ label: 'Depreciation', val: s.depr, indent: 36 })}
      {note('Increase (decrease) in cash due to changes in:', 36)}
      {row({ label: 'Accounts receivable', val: s.arAdj, indent: 48 })}
      {row({ label: 'Prepaid expenses', val: s.prepaidAdj, indent: 48 })}
      {row({ label: 'Accounts payable and accrued expenses', val: s.apAdj, indent: 48 })}
      {row({ label: 'Deferred tuition', val: s.deferredAdj, indent: 48 })}
      {row({ label: 'Due to student organizations', val: s.clubsAdj, indent: 48 })}
      {row({ label: 'Net cash provided by (used in) operating activities', val: s.operatingCash, indent: 0, bold: true, top: true })}

      {section('Cash flows used in investing activities:')}
      {row({ label: 'Purchase of (proceeds from) investments', val: s.investmentsCash })}
      {row({ label: 'Purchases of property and equipment', val: s.ppePurchases })}
      {row({ label: 'Net cash provided by (used in) investing activities', val: s.investingCash, indent: 0, bold: true, top: true })}

      {section('Cash flows used in financing activities:')}
      {row({ label: 'Payments to the System Administration', val: 0 })}
      {row({ label: 'Payments on lease obligations', val: s.leasePayments })}
      {row({ label: 'Net cash provided by (used in) financing activities', val: s.financingCash, indent: 0, bold: true, top: true })}

      <div className="h-4" />
      {total({ label: 'Increase in cash', val: s.netCashChange })}

      <div className="h-4" />
      {cash({ label: 'Cash, beginning of year', val: s.cashBegin })}
      <div className="h-1" />
      {cash({ label: 'Cash, end of year', val: s.cashEnd, isTotal: true })}

      <div className="mt-6 border-t border-rule pt-4">
        <div className="mb-2 font-serif text-[13px] italic text-navy">Reconciliation to cash:</div>
        {cash({ label: 'Cash', val: s.cashUnrestricted })}
        {cash({ label: 'Restricted cash', val: s.cashRestricted })}
        {cash({ label: 'Total cash', val: s.cashEnd, isTotal: true })}
      </div>
    </div>
    </ReportScroll>
  )
}
