# Financial Reporting System

A client-side school financial-statement generator built with **React + Vite + Tailwind CSS**
(matching the village-finder frontend conventions). Upload trial-balance spreadsheets and
produce three statements — Statement of Activities, Statement of Financial Position, and
Statement of Cash Flows — viewable on screen, printable to PDF, and exportable to formatted Excel.

Everything runs in the browser; there is no backend.

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build → dist/
npm run preview  # preview the production build
npm run lint     # eslint
```

Sign in with school **Sample 01 High School** and PIN **1234** (configured in
`src/data/schools.js`).

## How it works

1. **Sign in** — select a school and enter its PIN.
2. **Upload trial balances** (`.xlsx`/`.xls`):
   - Current Year (required)
   - Prior Year (optional comparative column)
   - Audited FY End (optional; required for the Statement of Cash Flows)
3. Pick a **reporting period** and **period-end date**, then **Generate Reports**.
4. Switch between the three statement tabs, **Print / PDF**, or **Export** to Excel.

Trial-balance files are parsed from the first worksheet: account number in column A,
description in column B, and either a total in column E or debit/credit in columns C/D.

## Project structure

```
src/
├── data/
│   ├── accountMap.js   # GL account number → statement category (ACCT_MAP)
│   └── schools.js      # per-school config: PIN + beginning net-asset balances
├── lib/
│   ├── format.js       # number/date formatting helpers
│   ├── parseTB.js      # Excel trial-balance parser (SheetJS)
│   ├── calc.js         # calcSOA / calcSFP / calcSCF + generateReports orchestrator
│   └── excel.js        # ExcelJS workbook builder + download (lazy-loaded)
├── context/
│   └── AppContext.jsx  # global state: auth, datasets, results (useApp hook)
├── components/
│   ├── Login.jsx        TopBar.jsx        Toolbar.jsx
│   ├── UploadButton.jsx ExportMenu.jsx    MappingPanel.jsx
│   ├── Dashboard.jsx    # tab bar + report container
│   └── reports/
│       ├── cells.jsx                          # shared report cell primitives
│       ├── StatementOfActivities.jsx
│       ├── StatementOfFinancialPosition.jsx
│       └── StatementOfCashFlows.jsx
├── App.jsx   main.jsx   index.css
```

The financial logic in `src/lib/` is a faithful port of the original single-file engine —
account mappings and every calculation produce identical numeric output, just reorganized
into testable modules. Pure functions in `calc.js` can be imported and run headlessly.

## Notes

- ExcelJS (~500 KB) is dynamically imported only when exporting, keeping the initial bundle small.
- Net assets on the Statement of Financial Position are derived from the SOA roll-forward
  (configured beginning balance + period change), matching the source engine.
- To add a school, add an entry to `src/data/schools.js`. To map a new GL account, add it to
  `src/data/accountMap.js`; unmapped revenue/expense accounts surface in the "Accounts Requiring
  Review" panel after generation.
