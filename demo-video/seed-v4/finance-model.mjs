// KYRO demo v4 — the FICTIONAL finance books of the Bayview Catholic Schools
// network. Pure: numbers in, rows out. No I/O, no clock, deterministic.
//
// One 4-digit chart for every school (the shape most small-school QuickBooks /
// Sage files have), mapped to the SCoA categories once through PATCH /mapping —
// the same call the intake's review makes after a person approves the picks.
//
// Every trial balance is COMPLETE and balanced to the cent: assets − liabilities
// − opening net assets − revenue + expenses = 0. Opening net assets roll year to
// year (FY n opening = FY n−1 ending), and the gross buildings account absorbs
// the residual so each year's balance sheet ties to its own activity.
//
// Bands (packages/analytics/src/health.ts) the figures are tuned against:
//   operating margin good ≥ 3%, risk < 0 · days cash good ≥ 60, risk < 30 ·
//   months of reserve good ≥ 6, risk < 3 · tuition share good ≤ 70%, risk > 85% ·
//   tuition discount good ≤ 20%, risk > 35%.
// Cedar Ridge FY26: margin GOOD, reserve GOOD, tuition share GOOD, days cash
// WATCH ("Cash is the one to watch."), discount WATCH (a second true warning).
// St. Aurelia FY26: every banded vital GOOD (its Finance tile reads all clear).

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100
const r0 = (n) => Math.round(n)

// ── The chart ────────────────────────────────────────────────────────────────
// [acct, name, SCoA category, section]
export const CHART = [
  // Revenue & support (credit balances)
  [4010, 'Tuition', 'tuition', 'rev'],
  [4020, 'Registration & Re-enrollment Fees', 'tuition', 'rev'],
  [4050, 'Tuition Assistance', 'tuition', 'rev'], // contra (a debit)
  [4100, 'Annual Fund Contributions', 'development', 'rev'],
  [4110, 'Gala & Special Events, net', 'development', 'rev'],
  [4120, 'Capital Campaign Gifts Released', 'development', 'rev'],
  [4200, 'Parish & Diocesan Support', 'support', 'rev'],
  [4250, 'Grants', 'support', 'rev'],
  [4300, 'Extended Day Program', 'other', 'rev'],
  [4310, 'Summer Programs', 'other', 'rev'],
  [4320, 'Facility Rental', 'other', 'rev'],
  [4400, 'Athletics & Activities Income', 'studActRev', 'rev'],
  [4500, 'Investment Return', 'investments', 'rev'],
  [4510, 'Interest Income', 'interest', 'rev'],
  [4600, 'Books & Uniform Sales', 'textbook', 'rev'],
  [4900, 'Miscellaneous Income', 'other', 'rev'],
  // Expenses (debit balances)
  [5010, 'Faculty Salaries', 'instrSal', 'exp'],
  [5020, 'Instructional Aides', 'instrSal', 'exp'],
  [5100, 'Classroom Supplies', 'instrSup', 'exp'],
  [5110, 'Technology & Software', 'instrSup', 'exp'],
  [5120, 'Library & Media', 'instrSup', 'exp'],
  [5130, 'Professional Development', 'instrSup', 'exp'],
  [6010, 'Administrative Salaries', 'adminSal', 'exp'],
  [6100, 'Office & Postage', 'adminCost', 'exp'],
  [6110, 'Audit, Legal & Professional Fees', 'adminCost', 'exp'],
  [6120, 'Marketing & Admissions', 'adminCost', 'exp'],
  [6130, 'Bank & Merchant Fees', 'adminCost', 'exp'],
  [7010, 'Maintenance Salaries', 'facilSal', 'exp'],
  [7100, 'Utilities', 'facilCost', 'exp'],
  [7110, 'Repairs & Maintenance', 'facilCost', 'exp'],
  [7120, 'Custodial & Grounds Contracts', 'facilCost', 'exp'],
  [8010, 'Employee Benefits', 'fixedOther', 'exp'],
  [8020, 'Payroll Taxes', 'fixedOther', 'exp'],
  [8100, 'Property & Liability Insurance', 'fixedOther', 'exp'],
  [8110, 'Diocesan Assessment', 'fixedOther', 'exp'],
  [8200, 'Interest Expense', 'fixedOther', 'exp'],
  // Depreciation is filed under fixed charges (the same Statement of Activities
  // line deprExpense rolls into). Filed as deprExpense, the engine's category
  // cash-flow path adds it back twice (its PP&E group nets accumulated
  // depreciation AND it adds depreciation back) — see the loader report.
  [8650, 'Depreciation', 'fixedOther', 'exp'],
  [9250, 'Transportation', 'bus', 'exp'],
  [9350, 'Food Service', 'food', 'exp'],
  [9500, 'Athletics', 'athletics', 'exp'],
  // Balance sheet
  [1010, 'Operating Checking', 'cash', 'asset'],
  [1020, 'Money Market Reserve', 'cash', 'asset'],
  [1030, 'Payroll Account', 'cash', 'asset'],
  [1100, 'Restricted Cash - Scholarship Fund', 'restrictedCash', 'asset'],
  [1200, 'Tuition Receivable', 'tuitionRec', 'asset'],
  [1210, 'Pledges Receivable', 'tuitionRec', 'asset'],
  [1300, 'Prepaid Expenses', 'prepaid', 'asset'],
  [1400, 'Endowment Investments', 'restrictInvst', 'asset'],
  [1500, 'Land', 'ppGross', 'asset'],
  [1510, 'Buildings & Improvements', 'ppGross', 'asset'],
  [1520, 'Furniture & Equipment', 'ppGross', 'asset'],
  [1590, 'Accumulated Depreciation', 'accumDepr', 'asset'],
  [2010, 'Accounts Payable', 'apAccrued', 'liab'],
  [2100, 'Accrued Payroll & Benefits', 'apAccrued', 'liab'],
  [2200, 'Deferred Tuition Revenue', 'deferredIntl', 'liab'],
  [2300, 'Student Activity Funds Held', 'studentClubs', 'liab'],
  [2500, 'Note Payable - Building', 'leaseNonCurr', 'liab'],
  [3000, 'Net Assets Without Donor Restrictions', 'naWithoutDonor', 'na'],
  [3100, 'Net Assets With Donor Restrictions', 'naWithDonor', 'na'],
]
const NAME = Object.fromEntries(CHART.map(([a, n]) => [a, n]))
export const MAPPING_ENTRIES = Object.fromEntries(CHART.map(([a, , c]) => [String(a), c]))

// Expense allocation (share of total expenses), before depreciation/interest
// which are set from the balance sheet. Sums to 1 with the residual on faculty.
const EXP_SHARE_K8 = {
  5020: 0.034, 5100: 0.022, 5110: 0.021, 5120: 0.005, 5130: 0.008,
  6010: 0.118, 6100: 0.011, 6110: 0.012, 6120: 0.009, 6130: 0.004,
  7010: 0.041, 7100: 0.046, 7110: 0.028, 7120: 0.019,
  8010: 0.102, 8020: 0.041, 8100: 0.024, 8110: 0.029,
  9250: 0.012, 9350: 0.021, 9500: 0.009,
}
const EXP_SHARE_HS = {
  5020: 0.012, 5100: 0.016, 5110: 0.024, 5120: 0.004, 5130: 0.009,
  6010: 0.112, 6100: 0.009, 6110: 0.011, 6120: 0.014, 6130: 0.004,
  7010: 0.036, 7100: 0.041, 7110: 0.026, 7120: 0.017,
  8010: 0.108, 8020: 0.043, 8100: 0.026, 8110: 0.027,
  9250: 0.011, 9350: 0.018, 9500: 0.034,
}

// ── The schools ──────────────────────────────────────────────────────────────
// Per fiscal year (label = the June-30 year): enrollment, gross tuition per
// student, aid as a share of gross, the non-tuition revenue (dollars), the
// operating margin and days of cash the year closes on. Everything else follows.
export const SCHOOLS = {
  cedar: {
    level: 'hs',
    years: {
      2022: { enr: 402, rate: 13650, aid: 0.178, margin: 0.021, days: 74 },
      2023: { enr: 411, rate: 14150, aid: 0.181, margin: 0.034, days: 68 },
      2024: { enr: 418, rate: 14650, aid: 0.183, margin: 0.050, days: 61 },
      2025: { enr: 426, rate: 15150, aid: 0.186, margin: 0.039, days: 52 },
      2026: { enr: 431, rate: 15650, aid: 0.188, margin: 0.046, days: 45 },
    },
    feePerStudent: 525,
    other: { 4100: 1210000, 4110: 455000, 4120: 260000, 4200: 300000, 4250: 168000, 4300: 0, 4310: 238000, 4320: 128000, 4400: 236000, 4500: 152000, 4510: 41000, 4600: 64000, 4900: 22000 },
    otherGrowth: 0.035,
    naOpen: 7.15e6, // total opening net assets, July 1 2021
    restrictedNa: 1.18e6,
    endowment: 1.32e6,
    restrictedCash: 186000,
    land: 1.1e6,
    ffe: 1.46e6,
    accDep: 4.05e6,
    dep: 412000,
    note: 2.6e6,
    notePay: 160000,
    rateInt: 0.042,
    // FY26 enrollment counted on the FY27 period (the cash forecast's tuition driver).
    enr2027: 436,
    rate2027: 16150,
  },
  aurelia: {
    level: 'k8',
    years: {
      2022: { enr: 206, rate: 8050, aid: 0.112, margin: 0.012, days: 58 },
      2023: { enr: 208, rate: 8350, aid: 0.115, margin: 0.026, days: 63 },
      2024: { enr: 205, rate: 8600, aid: 0.118, margin: 0.038, days: 71 },
      2025: { enr: 201, rate: 8850, aid: 0.121, margin: 0.044, days: 78 },
      2026: { enr: 202, rate: 9150, aid: 0.124, margin: 0.051, days: 84 },
    },
    feePerStudent: 350,
    other: { 4100: 205000, 4110: 78000, 4120: 0, 4200: 245000, 4250: 30000, 4300: 62000, 4310: 22000, 4320: 12000, 4400: 16000, 4500: 22000, 4510: 6000, 4600: 15000, 4900: 4000 },
    otherGrowth: 0.03,
    naOpen: 2.55e6,
    restrictedNa: 0.31e6,
    endowment: 0.36e6,
    restrictedCash: 64000,
    land: 0.42e6,
    ffe: 0.38e6,
    accDep: 1.62e6,
    dep: 118000,
    note: 0.62e6,
    notePay: 52000,
    rateInt: 0.045,
    enr2027: 204,
    rate2027: 9450,
  },
  mangrove: {
    level: 'hs',
    years: {
      2022: { enr: 318, rate: 13000, aid: 0.194, margin: 0.052, days: 95 },
      2023: { enr: 314, rate: 13450, aid: 0.199, margin: 0.055, days: 91 },
      2024: { enr: 309, rate: 13900, aid: 0.205, margin: 0.048, days: 88 },
      2025: { enr: 301, rate: 14350, aid: 0.214, margin: 0.022, days: 72 },
      2026: { enr: 296, rate: 14800, aid: 0.221, margin: 0.009, days: 57 },
    },
    feePerStudent: 450,
    other: { 4100: 690000, 4110: 248000, 4120: 120000, 4200: 210000, 4250: 76000, 4300: 0, 4310: 142000, 4320: 64000, 4400: 171000, 4500: 88000, 4510: 22000, 4600: 41000, 4900: 12000 },
    otherGrowth: 0.02,
    naOpen: 4.43e6,
    restrictedNa: 0.64e6,
    endowment: 0.71e6,
    restrictedCash: 98000,
    land: 0.86e6,
    ffe: 1.02e6,
    accDep: 2.78e6,
    dep: 306000,
    note: 2.15e6,
    notePay: 125000,
    rateInt: 0.044,
  },
  odile: {
    level: 'k8',
    years: {
      2022: { enr: 252, rate: 7350, aid: 0.158, margin: 0.004, days: 41 },
      2023: { enr: 246, rate: 7600, aid: 0.163, margin: 0.012, days: 38 },
      2024: { enr: 241, rate: 7900, aid: 0.168, margin: -0.008, days: 34 },
      2025: { enr: 241, rate: 8150, aid: 0.176, margin: -0.024, days: 27 },
      2026: { enr: 242, rate: 8450, aid: 0.181, margin: 0.016, days: 31 },
    },
    feePerStudent: 300,
    other: { 4100: 214000, 4110: 81000, 4120: 0, 4200: 286000, 4250: 30000, 4300: 66000, 4310: 18000, 4320: 9000, 4400: 17000, 4500: 11000, 4510: 4000, 4600: 18000, 4900: 5000 },
    otherGrowth: 0.01,
    naOpen: 1.9e6,
    restrictedNa: 0.18e6,
    endowment: 0.21e6,
    restrictedCash: 38000,
    land: 0.31e6,
    ffe: 0.29e6,
    accDep: 1.22e6,
    dep: 96000,
    note: 0.56e6,
    notePay: 40000,
    rateInt: 0.05,
  },
  heron: {
    level: 'k8',
    years: {
      2022: { enr: 171, rate: 8500, aid: 0.124, margin: 0.019, days: 44 },
      2023: { enr: 169, rate: 8800, aid: 0.127, margin: 0.024, days: 46 },
      2024: { enr: 166, rate: 9100, aid: 0.131, margin: 0.031, days: 49 },
      2025: { enr: 161, rate: 9400, aid: 0.135, margin: 0.046, days: 58 },
      2026: { enr: 157, rate: 9700, aid: 0.138, margin: 0.062, days: 66 },
    },
    feePerStudent: 380,
    other: { 4100: 186000, 4110: 74000, 4120: 0, 4200: 168000, 4250: 26000, 4300: 61000, 4310: 27000, 4320: 14000, 4400: 19000, 4500: 17000, 4510: 6000, 4600: 16000, 4900: 4000 },
    otherGrowth: 0.03,
    naOpen: 1.68e6,
    restrictedNa: 0.22e6,
    endowment: 0.25e6,
    restrictedCash: 41000,
    land: 0.36e6,
    ffe: 0.27e6,
    accDep: 1.01e6,
    dep: 88000,
    note: 0.48e6,
    notePay: 36000,
    rateInt: 0.047,
  },
}

/** One year's revenue + expense accounts (natural-positive dollars) and the totals. */
function activity(cfg, fy, firstFy, note) {
  const y = cfg.years[fy]
  const k = fy - firstFy
  const g = (1 + cfg.otherGrowth) ** k
  const gross = r0(y.enr * y.rate)
  const fees = r0(y.enr * cfg.feePerStudent)
  const aid = r0(gross * y.aid)
  const rev = { 4010: gross, 4020: fees, 4050: -aid }
  for (const [a, v] of Object.entries(cfg.other)) rev[a] = r0(v * g * (1 + 0.012 * Math.sin(fy + Number(a))))
  const totalRev = Object.values(rev).reduce((s, v) => s + v, 0)
  const totalExp = r0(totalRev * (1 - y.margin))
  const shares = cfg.level === 'hs' ? EXP_SHARE_HS : EXP_SHARE_K8
  const exp = {}
  exp[8650] = cfg.dep + 6000 * k
  exp[8200] = r0(note * cfg.rateInt)
  let alloc = 0
  for (const [a, s] of Object.entries(shares)) {
    exp[a] = r0(totalExp * s * (1 + 0.01 * Math.cos(fy * 3 + Number(a))))
    alloc += exp[a]
  }
  exp[5010] = totalExp - alloc - exp[8650] - exp[8200]
  return { rev, exp, totalRev, totalExp, net: totalRev - totalExp, aid, gross, enr: y.enr }
}

/**
 * Every year of one school: { [fy]: { rows: [{acct, desc, debit, credit}], tb:
 * [{acct, desc, total}], naOpen, naEnd, restrictedOpen, act, bs } }.
 */
export function buildSchool(key, enrollment = {}) {
  const base = SCHOOLS[key]
  // Enrollment comes from the school's own operational record when one is on
  // file (the enrollment loader writes it), so per-student figures agree.
  const cfg = { ...base, years: Object.fromEntries(Object.entries(base.years).map(([fy, y]) => [fy, { ...y, enr: enrollment[fy] ?? y.enr }])) }
  const fys = Object.keys(cfg.years).map(Number).sort()
  const first = fys[0]
  // Opening balances on July 1 of the first fiscal year.
  let naOpen = cfg.naOpen
  let accDep = cfg.accDep
  let note = cfg.note
  const out = {}
  for (const fy of fys) {
    const act = activity(cfg, fy, first, note)
    const y = cfg.years[fy]
    accDep += act.exp[8650]
    note -= cfg.notePay
    const naEnd = naOpen + act.net
    // Cash closes on the year's days-cash target (the metric uses total expenses).
    const cash = r0((y.days * act.totalExp) / 365)
    const bs = {
      1010: r0(cash * 0.46),
      1020: r0(cash * 0.47),
      1100: r0(cfg.restrictedCash * (1 + 0.04 * (fy - first))),
      1200: r0(act.gross * 0.021),
      1210: r0(cfg.other[4100] * 0.22),
      1300: r0(act.totalExp * 0.012),
      1400: r0(cfg.endowment * (1 + 0.05 * (fy - first))),
      1500: cfg.land,
      1520: r0(cfg.ffe * (1 + 0.06 * (fy - first))),
      1590: -accDep,
      2010: -r0(act.totalExp * 0.021),
      2100: -r0(act.totalExp * 0.034),
      2200: -r0(act.gross * 0.071),
      2300: -r0(act.enr * 41),
      2500: -note,
    }
    bs[1030] = cash - bs[1010] - bs[1020]
    // Buildings absorb the residual so assets − liabilities = ending net assets.
    const others = Object.values(bs).reduce((s, v) => s + v, 0)
    bs[1510] = r2(naEnd - others)
    const restrictedOpen = cfg.restrictedNa
    const tb = []
    const push = (acct, total) => tb.push({ acct, desc: NAME[acct], total: r2(total) })
    for (const a of [1010, 1020, 1030, 1100, 1200, 1210, 1300, 1400, 1500, 1510, 1520, 1590]) push(a, bs[a])
    for (const a of [2010, 2100, 2200, 2300, 2500]) push(a, bs[a])
    push(3000, -(naOpen - restrictedOpen))
    push(3100, -restrictedOpen)
    for (const [a] of CHART.filter((c) => c[3] === 'rev')) push(a, -(act.rev[a] ?? 0))
    for (const [a] of CHART.filter((c) => c[3] === 'exp')) push(a, act.exp[a] ?? 0)
    const imbalance = r2(tb.reduce((s, r) => s + r.total, 0))
    if (Math.abs(imbalance) > 0.005) throw new Error(`${key} FY${fy} TB out of balance by ${imbalance}`)
    if (bs[1510] <= 0) throw new Error(`${key} FY${fy} buildings plug went non-positive (${bs[1510]})`)
    out[fy] = { tb, naOpen, naEnd, restrictedOpen, act, bs, cash }
    naOpen = naEnd
  }
  return out
}

/** The vitals the bands judge, computed the way the metric registry does. */
export function vitals(year) {
  const { act, cash, naEnd, restrictedOpen } = year
  const tuitionLine = act.rev[4010] + act.rev[4020] + act.rev[4050]
  return {
    margin: act.net / act.totalRev,
    daysCash: cash / (act.totalExp / 365),
    reserveMonths: (naEnd - restrictedOpen) / (act.totalExp / 12),
    tuitionShare: tuitionLine / act.totalRev,
    discount: act.aid / tuitionLine,
    net: act.net,
    totalRev: act.totalRev,
    totalExp: act.totalExp,
  }
}

/** A TB as the grid a school's accounting system exports (banner + Debit | Credit). */
export function tbGrid(schoolName, fy, tb, { note } = {}) {
  const rows = [
    [schoolName],
    [`Trial Balance — Fiscal Year ${fy}${note ? ` (${note})` : ''}`],
    [`As of June 30, ${fy}`],
    [],
    ['Account #', 'Account Name', 'Debit', 'Credit'],
  ]
  for (const r of [...tb].sort((a, b) => a.acct - b.acct)) {
    rows.push([r.acct, r.desc, r.total > 0 ? r.total : null, r.total < 0 ? -r.total : null])
  }
  const d = r2(tb.reduce((s, r) => s + (r.total > 0 ? r.total : 0), 0))
  rows.push([], [null, 'Total', d, d])
  return rows
}

// Month shares of the year (Jul..Jun) for spreads and month-end actuals.
export const MONTHS_FY = (fy) => {
  const out = []
  for (let i = 0; i < 12; i++) {
    const m = ((6 + i) % 12) + 1
    const y = m >= 7 ? fy - 1 : fy
    out.push(`${y}-${String(m).padStart(2, '0')}`)
  }
  return out
}
const EVEN = Array(12).fill(1 / 12)
const TEN = [0.01, 0.098, 0.098, 0.098, 0.098, 0.098, 0.098, 0.098, 0.098, 0.098, 0.098, 0.01] // 10-month school year (sums to 1)
const DEV = [0.03, 0.04, 0.05, 0.06, 0.08, 0.24, 0.05, 0.05, 0.06, 0.18, 0.07, 0.09] // Dec giving, April gala
const SUMMER = [0.32, 0.12, 0, 0, 0, 0, 0, 0, 0, 0, 0.06, 0.5]
const UTIL = [0.1, 0.11, 0.1, 0.08, 0.07, 0.07, 0.07, 0.07, 0.07, 0.08, 0.09, 0.09]
const ATH = [0.03, 0.12, 0.12, 0.11, 0.1, 0.06, 0.08, 0.1, 0.1, 0.08, 0.06, 0.04]
export function monthShares(acct) {
  if ([4010, 4020, 4050, 4300, 4600, 5100, 9250, 9350].includes(acct)) return TEN
  if ([4100, 4110, 4120].includes(acct)) return DEV
  if (acct === 4310) return SUMMER
  if (acct === 7100) return UTIL
  if ([4400, 9500].includes(acct)) return ATH
  return EVEN
}

/**
 * A budget spread for one fiscal year from a base year's activity: revenue and
 * expense accounts with 12 monthly amounts (natural-positive; the contra-tuition
 * line negative), exactly what a generic "budget spread" workbook carries.
 */
export function budgetAccounts(act, { revAdj = {}, expAdj = {} } = {}) {
  const accts = []
  for (const [a, , , sec] of CHART) {
    if (sec !== 'rev' && sec !== 'exp') continue
    const base = sec === 'rev' ? act.rev[a] ?? 0 : act.exp[a] ?? 0
    const adj = sec === 'rev' ? revAdj[a] ?? 1 : expAdj[a] ?? 1
    const annual = r0(base * adj)
    if (annual === 0) continue
    const sh = monthShares(a)
    const months = sh.map((s) => r0(annual * s))
    months[11] += annual - months.reduce((s, v) => s + v, 0)
    accts.push({ acct: a, label: NAME[a], months, annual })
  }
  return accts
}

/** A generic budget-spread workbook grid: header row of month DATES, then GL rows. */
export function spreadGrid(schoolName, fy, accounts) {
  const keys = MONTHS_FY(fy)
  const dateCells = keys.map((k) => {
    const [y, m] = k.split('-').map(Number)
    return new Date(y, m - 1, 1, 12)
  })
  const rows = [[`${schoolName} — Operating Budget FY${fy}`], ['Board-approved'], [], ['Acct', 'Description', ...dateCells, 'Annual']]
  const revs = accounts.filter((a) => a.acct < 5000)
  const exps = accounts.filter((a) => a.acct >= 5000)
  rows.push([null, 'REVENUE'])
  for (const a of revs) rows.push([a.acct, a.label, ...a.months, a.annual])
  rows.push([null, 'Total Revenue', ...keys.map((_, i) => revs.reduce((s, a) => s + a.months[i], 0)), revs.reduce((s, a) => s + a.annual, 0)])
  rows.push([null, 'EXPENSES'])
  for (const a of exps) rows.push([a.acct, a.label, ...a.months, a.annual])
  rows.push([null, 'Total Expenses', ...keys.map((_, i) => exps.reduce((s, a) => s + a.months[i], 0)), exps.reduce((s, a) => s + a.annual, 0)])
  return rows
}

/**
 * Twelve month-end YEAR-TO-DATE trial balances for one fiscal year: activity
 * accumulates by each account's month shares; balance-sheet accounts move from
 * last year's close to this year's, with deferred tuition high over the summer;
 * the operating checking account is the residual (as cash is, in real books).
 * June equals the annual trial balance exactly.
 */
export function monthlyTbs(prev, cur) {
  const out = []
  const cum = (acct, i) => monthShares(acct).slice(0, i + 1).reduce((s, v) => s + v, 0)
  const bsAccts = [1020, 1030, 1100, 1200, 1210, 1300, 1400, 1500, 1510, 1520, 1590, 2010, 2100, 2200, 2300, 2500]
  const defSeason = [1.35, 1.1, 0.92, 0.82, 0.72, 0.62, 0.52, 0.42, 0.34, 0.5, 0.78, 1.0]
  for (let i = 0; i < 12; i++) {
    const t = (i + 1) / 12
    const rows = []
    for (const a of bsAccts) {
      let v = prev.bs[a] + (cur.bs[a] - prev.bs[a]) * t
      if (a === 2200) v = cur.bs[2200] * defSeason[i]
      if (a === 1200) v = cur.bs[1200] * (i < 11 ? 1.6 - 0.05 * i : 1)
      rows.push({ acct: a, desc: NAME[a], total: i === 11 ? cur.bs[a] : r2(v) })
    }
    rows.push({ acct: 3000, desc: NAME[3000], total: -(cur.naOpen - cur.restrictedOpen) })
    rows.push({ acct: 3100, desc: NAME[3100], total: -cur.restrictedOpen })
    for (const [a, , , sec] of CHART) {
      if (sec === 'rev') rows.push({ acct: a, desc: NAME[a], total: i === 11 ? -(cur.act.rev[a] ?? 0) : -r2((cur.act.rev[a] ?? 0) * cum(a, i)) })
      if (sec === 'exp') rows.push({ acct: a, desc: NAME[a], total: i === 11 ? cur.act.exp[a] ?? 0 : r2((cur.act.exp[a] ?? 0) * cum(a, i)) })
    }
    const residual = r2(rows.reduce((s, r) => s + r.total, 0))
    rows.unshift({ acct: 1010, desc: NAME[1010], total: r2(-residual) })
    if (i === 11 && Math.abs(rows[0].total - cur.bs[1010]) > 0.01) throw new Error('June month-end does not equal the annual TB')
    out.push(rows)
  }
  return out
}
