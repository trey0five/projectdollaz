// The ONE mapper from "add data" intent to a real destination. The standalone
// Data hub is retired under ui.v2: /data is a static redirect to
// /finance?tab=add that DROPS QUERY STRINGS (App.jsx), so a query-carrying URL
// routed through /data lands on the wrong wizard — the dead-link class Phase E
// already shipped and fixed once. NEVER route a query-carrying URL through
// /data; flag-shared surfaces call these helpers instead of hard-coding hrefs.

/**
 * Href for an "add data" ask.
 * - v1: the Data hub page at /data is real there — bare path, no query.
 * - v2: deep link the finance Add-data tab directly. `add` picks the wizard
 *   ('tb' | 'budget' | 'monthly' | …, per wizardConfigs); `intake` preselects a
 *   tab inside the trial-balance flow (e.g. 'qbo' — AddDataTab threads
 *   `?intake=` through as `initialTab`).
 */
export function addDataHref(uiV2, { add = 'tb', intake = null } = {}) {
  if (!uiV2) return '/data'
  return `/finance?tab=add&add=${add}${intake ? `&intake=${intake}` : ''}`
}

/**
 * Briefing items: the server still emits link:'/data' (briefing.service.ts).
 * Under v2 that redirect would work for the bare path, but the label should
 * land users on the Add-data tab explicitly; under v1 the raw link is correct.
 */
export function resolveBriefingLink(link, uiV2) {
  return uiV2 && link === '/data' ? '/finance?tab=add' : link
}
