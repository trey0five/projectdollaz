// ─────────────────────────────────────────────────────────────
// Excel export (ExcelJS) — full formatting support
// Builds row descriptors for each statement, then writes styled sheets.
// Row types: title | subtitle | section | subsection | colheader |
//            data | subtotal | total | blank
// ─────────────────────────────────────────────────────────────
// ExcelJS is heavy (~500KB) and only needed when the user exports, so it is
// dynamically imported inside buildExcel() to keep the initial bundle lean.

const CURRENCY = '$#,##0_);[Red]($#,##0)'
const THIN = { style: 'thin', color: { argb: 'FF000000' } }
const DOUBLE = { style: 'double', color: { argb: 'FF000000' } }

function applyCell(cell, rowType, isNum) {
  const bold = ['title', 'subtitle', 'section', 'subsection', 'subtotal', 'total', 'colheader'].includes(rowType)
  const italic = rowType === 'section'
  const size = rowType === 'title' ? 14 : rowType === 'subtitle' ? 12 : 11
  cell.font = { name: 'Calibri', size, bold, italic }

  if (isNum) {
    cell.numFmt = CURRENCY
    cell.alignment = { horizontal: 'right' }
  }
  if (rowType === 'subtotal') {
    cell.border = { top: THIN }
  } else if (rowType === 'total') {
    cell.border = { top: DOUBLE }
  } else if (rowType === 'colheader') {
    cell.border = { bottom: THIN }
    cell.alignment = { horizontal: 'right' }
  }
}

function writeSheet(ws, rows, colWidths) {
  colWidths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w
  })
  rows.forEach((row) => {
    const rtype = row.type || 'data'
    if (rtype === 'blank') {
      ws.addRow([])
      return
    }
    const values = row.values || []
    const exRow = ws.addRow([row.label || '', ...values.map((v) => (v != null ? v : null))])
    applyCell(exRow.getCell(1), rtype, false)
    values.forEach((v, i) => {
      const cell = exRow.getCell(i + 2)
      if (v != null && typeof v === 'number') applyCell(cell, rtype, true)
      else if (v != null) applyCell(cell, rtype, false)
    })
  })
}

// ── Row builders ─────────────────────────────────────────────
function buildSOARows(soaResults, schoolName, dateLabel) {
  const r = soaResults
  const { hasPY, hasAudit } = r
  const ph = (v, show) => (show && v != null ? v : null)
  const dRow = (label, cy, py, au) => ({ type: 'data', label: '  ' + label, values: [cy, ph(py, hasPY), ph(au, hasAudit)] })
  const subRow = (label, cy, py, au) => ({ type: 'subtotal', label, values: [cy, ph(py, hasPY), ph(au, hasAudit)] })
  const totRow = (label, cy, py, au) => ({ type: 'total', label, values: [cy, ph(py, hasPY), ph(au, hasAudit)] })
  const cy = r.cy
  const py = r.py
  const au = r.audit

  return [
    { type: 'title', label: schoolName, values: [] },
    { type: 'subtitle', label: 'Statement of Activities and Changes in Net Assets', values: [] },
    { type: 'data', label: 'For the Period Ended ' + dateLabel, values: [] },
    { type: 'data', label: '(For Internal Purposes Only)', values: [] },
    { type: 'blank' },
    { type: 'colheader', label: '', values: [dateLabel, hasPY ? 'Prior Year' : '', hasAudit ? 'Audited FY End' : ''] },
    { type: 'colheader', label: '', values: ['Unaudited', hasPY ? 'Unaudited' : '', hasAudit ? 'Audited' : ''] },
    { type: 'blank' },
    { type: 'section', label: 'Revenue and support:', values: [] },
    dRow('Tuitions and fees, net', cy.tuition, py?.tuition, au?.tuition),
    dRow('Development income', cy.dev, py?.dev, au?.dev),
    dRow('Student activities income', cy.studAct, py?.studAct, au?.studAct),
    dRow('Textbook leasing income', cy.textbook, py?.textbook, au?.textbook),
    dRow('Other', cy.other, py?.other, au?.other),
    dRow('Support', cy.support, py?.support, au?.support),
    dRow('Grant revenue', 0, 0, 0),
    dRow('International program', cy.intlRev, py?.intlRev, au?.intlRev),
    dRow('Net gain (loss) on investments', cy.investments, py?.investments, au?.investments),
    dRow('Interest income', cy.interest, py?.interest, au?.interest),
    subRow('Total revenue and support', cy.totalRev, py?.totalRev, au?.totalRev),
    { type: 'blank' },
    { type: 'section', label: 'Expenses:', values: [] },
    dRow('Instructional', cy.instructional, py?.instructional, au?.instructional),
    dRow('Facilities', cy.facilities, py?.facilities, au?.facilities),
    dRow('Fixed charges and other', cy.fixedOther, py?.fixedOther, au?.fixedOther),
    dRow('International program & resale', cy.intlExp, py?.intlExp, au?.intlExp),
    dRow('Pupil transportation', cy.bus, py?.bus, au?.bus),
    dRow('Food service costs', cy.food, py?.food, au?.food),
    dRow('Student activities', cy.studActExp, py?.studActExp, au?.studActExp),
    dRow('Athletics', cy.athletics, py?.athletics, au?.athletics),
    dRow('Administration', cy.admin, py?.admin, au?.admin),
    dRow('Restricted expenditures', cy.restricted, py?.restricted, au?.restricted),
    subRow('Total expenses', cy.totalExp, py?.totalExp, au?.totalExp),
    { type: 'blank' },
    totRow('Changes in unrestricted net assets', cy.netChange, py?.netChange, au?.netChange),
    { type: 'blank' },
    dRow('Net assets, beginning of year', r.cyNABegin, r.pyNABegin, r.auditNABegin),
    totRow('Net assets, end of period', r.cyNAEnd, r.pyNAEnd, r.auditNAEnd),
  ]
}

function buildSFPRows(sfpResults, schoolName, dateLabel) {
  const s = sfpResults
  if (!s || !s.cy) return [{ type: 'data', label: 'No data', values: [] }]
  const { cy, py, hasPY } = s
  const ph = (v) => (hasPY && v != null ? v : null)
  const dRow = (label, cyV, pyV) => ({ type: 'data', label: '  ' + label, values: [cyV, ph(pyV)] })
  const subRow = (label, cyV, pyV) => ({ type: 'subtotal', label, values: [cyV, ph(pyV)] })
  const totRow = (label, cyV, pyV) => ({ type: 'total', label, values: [cyV, ph(pyV)] })

  return [
    { type: 'title', label: schoolName, values: [] },
    { type: 'subtitle', label: 'Statement of Financial Position', values: [] },
    { type: 'data', label: dateLabel + (hasPY ? ' and Prior Year' : ''), values: [] },
    { type: 'data', label: '(For Internal Purposes Only)', values: [] },
    { type: 'colheader', label: '', values: [dateLabel, hasPY ? 'Prior Year' : ''] },
    { type: 'section', label: 'Assets', values: [] },
    { type: 'subsection', label: 'Current assets:', values: [] },
    dRow('Cash and cash equivalents', cy.cash, py?.cash),
    dRow('Restricted cash', cy.restrictedCash, py?.restrictedCash),
    dRow('Tuition receivable, net', cy.tuitionRec, py?.tuitionRec),
    dRow('Prepaid expenses', cy.prepaid, py?.prepaid),
    subRow('Total current assets', cy.totalCurrentA, py?.totalCurrentA),
    { type: 'blank' },
    dRow('Property and equipment, net', cy.ppNet, py?.ppNet),
    dRow('Right to use assets', cy.rouAsset, py?.rouAsset),
    dRow('Restricted investments', cy.restrictInvst, py?.restrictInvst),
    totRow('Total assets', cy.totalAssets, py?.totalAssets),
    { type: 'blank' },
    { type: 'section', label: 'Liabilities and Net Assets', values: [] },
    { type: 'subsection', label: 'Current liabilities:', values: [] },
    dRow('Accounts payable and accrued expenses', cy.apAccrued, py?.apAccrued),
    dRow('Due to student clubs', cy.studentClubs, py?.studentClubs),
    dRow('Deferred international program fees', cy.deferredIntl, py?.deferredIntl),
    dRow('Lease obligations, current portion', cy.leaseCurr, py?.leaseCurr),
    subRow('Total current liabilities', cy.totalCurrL, py?.totalCurrL),
    { type: 'blank' },
    dRow('Lease obligations, noncurrent portion', cy.leaseNonCurr, py?.leaseNonCurr),
    subRow('Total liabilities', cy.totalLiab, py?.totalLiab),
    { type: 'blank' },
    { type: 'subsection', label: 'Net assets:', values: [] },
    dRow('Without donor restrictions', cy.naWithout, py?.naWithout),
    dRow('With donor restrictions', cy.naWith, py?.naWith),
    subRow('Total net assets', cy.totalNA, py?.totalNA),
    totRow('Total liabilities and net assets', cy.totalLiabNA, py?.totalLiabNA),
  ]
}

function buildSCFRows(scf, schoolName, dateLabel) {
  const sc = scf
  if (!sc) return [{ type: 'data', label: 'No data — upload Audited TB first', values: [] }]
  const dRow = (label, v) => ({ type: 'data', label: '  ' + label, values: [v != null ? v : null] })
  const subRow = (label, v) => ({ type: 'subtotal', label, values: [v != null ? v : null] })
  const totRow = (label, v) => ({ type: 'total', label, values: [v != null ? v : null] })

  return [
    { type: 'title', label: schoolName, values: [] },
    { type: 'subtitle', label: 'Statement of Cash Flows', values: [] },
    { type: 'data', label: 'For the Period Ended ' + dateLabel, values: [] },
    { type: 'data', label: '(For Internal Purposes Only)', values: [] },
    { type: 'blank' },
    { type: 'section', label: 'Cash flows from operating activities:', values: [] },
    dRow('Change in net assets', sc.netChange),
    { type: 'data', label: '  Adjustments to reconcile change in net assets to net cash:', values: [] },
    dRow('  Depreciation', sc.depr),
    { type: 'data', label: '  Changes in operating assets and liabilities:', values: [] },
    dRow('  Accounts receivable', sc.arAdj),
    dRow('  Prepaid expenses', sc.prepaidAdj),
    dRow('  Accounts payable and accrued expenses', sc.apAdj),
    dRow('  Due to student organizations', sc.clubsAdj),
    dRow('  Deferred tuition', sc.deferredAdj),
    subRow('Net cash provided by operating activities', sc.operatingCash),
    { type: 'blank' },
    { type: 'section', label: 'Cash flows used in investing activities:', values: [] },
    dRow('Purchase of (proceeds from) investments', sc.investmentsCash),
    dRow('Purchases of property and equipment', sc.ppePurchases),
    subRow('Net cash used in investing activities', sc.investingCash),
    { type: 'blank' },
    { type: 'section', label: 'Cash flows used in financing activities:', values: [] },
    dRow('Payments to the System Administration', 0),
    dRow('Payments on lease obligations', sc.leasePayments),
    subRow('Net cash from financing activities', sc.financingCash),
    { type: 'blank' },
    totRow('Increase in cash', sc.netCashChange),
    { type: 'blank' },
    dRow('Cash, beginning of year', sc.cashBegin),
    totRow('Cash, end of year', sc.cashEnd),
    { type: 'blank' },
    { type: 'section', label: 'Reconciliation to cash:', values: [] },
    dRow('Cash', sc.cashUnrestricted),
    dRow('Restricted cash', sc.cashRestricted),
    subRow('Total cash', sc.cashEnd),
  ]
}

/**
 * Build an .xlsx workbook buffer for the requested statement(s).
 * @param {'soa'|'sfp'|'scf'|'both'|'all'} which
 */
export async function buildExcel(which, { soaResults, sfpResults, scf, schoolName, dateLabel }) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Financial Reporting System'

  if (['soa', 'both', 'all'].includes(which)) {
    writeSheet(wb.addWorksheet('Statement of Activities'), buildSOARows(soaResults, schoolName, dateLabel), [44, 16, 16, 16])
  }
  if (['sfp', 'both', 'all'].includes(which)) {
    writeSheet(wb.addWorksheet('Financial Position'), buildSFPRows(sfpResults, schoolName, dateLabel), [44, 16, 16])
  }
  if (['scf', 'all'].includes(which)) {
    writeSheet(wb.addWorksheet('Cash Flows'), buildSCFRows(scf, schoolName, dateLabel), [52, 16])
  }
  return wb.xlsx.writeBuffer()
}

/** Build, then trigger a browser download. */
export async function downloadExcel(which, ctx) {
  const buffer = await buildExcel(which, ctx)
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const safe = (s) => (s || 'report').replace(/[^a-z0-9]/gi, '_')
  a.download = `${safe(ctx.schoolName)}_${safe(ctx.dateLabel)}.xlsx`
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 100)
}
