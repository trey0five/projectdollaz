// Engine + chart/mapping versions surfaced in ReportMeta.
// 0.1.0 → 0.2.0: the Statement of Cash Flows changed. Investing reads GROSS
// property on a non-legacy chart (net property double-counted depreciation), and
// the depreciation add-back falls back to the accumulated-depreciation movement
// when a chart carries no depreciation-expense row (QuickBooks-shaped and
// mis-mapped charts). Snapshots stamped 0.1.0 were computed the old way.
export const ENGINE_VERSION = '0.2.0'
export const MAPPING_VERSION = 'map-v1'
// scoa-v2 — the chart gained a BALANCE-SHEET vocabulary and the two legacy
// description splits (accounts 120 and 200) became chart data. Bumped because
// MappingService seeds ONE stored chart row per version: without a new version
// every school would keep reading the scoa-v1 row, which knows none of the new
// categories. Snapshots written before this keep saying scoa-v1, which is what
// they were computed under.
export const STANDARD_CHART_VERSION = 'scoa-v2'
