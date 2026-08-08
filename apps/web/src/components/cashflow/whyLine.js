// ─────────────────────────────────────────────────────────────────────────────
// "Lowest projected cash $184K on July 18." — and then, WHY.
//
// A number without its cause is a number a head of school cannot act on. The
// answer is almost always seasonal and almost always the same shape: obligations
// that continue through the summer land before the receipts that fund them
// arrive. Saying so turns an alarming figure into a decision.
//
// DETERMINISTIC, AND DELIBERATELY SO FOR NOW. This composes from figures the
// engine already computed — the categories that dominate the run into the low
// point, and the first significant receipt after it. Nothing here estimates,
// rounds or characterises; every number in the sentence came off the projection.
//
// THIS IS THE SEAM the AI narrative replaces later. When it does, it takes the
// same inputs and returns the same shape, and the page does not change: the model
// keeps doing the arithmetic and the language model does the translation. Keeping
// a working deterministic version underneath is also the fallback for a school
// with no AI configured, which is most of them.
//
// PURE. No hooks, no JSX, no formatting invented locally.
// ─────────────────────────────────────────────────────────────────────────────

/** Categories rendered with a friendlier noun than their key. */
const CATEGORY_NOUNS = {
  payroll: 'payroll',
  benefits: 'benefits',
  debt_service: 'debt service',
  insurance: 'insurance',
  lease: 'lease payments',
  tuition: 'tuition receipts',
  supplies: 'supplies',
  utilities: 'utilities',
}

const noun = (c) => CATEGORY_NOUNS[c] ?? String(c ?? '').replace(/_/g, ' ')

/** "payroll and debt service" / "payroll, benefits and insurance" */
function list(items) {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/**
 * @param projection CashProjectionResult — carries its OWN driver breakdown.
 * @param format     (n) => string — the caller's currency formatter, passed in so
 *                   this file cannot disagree with the figures printed above it.
 *
 * READS THE ENGINE'S BREAKDOWN, not a raw event list. The first version took the
 * events and summed them here, which meant the page had to be handed hundreds of
 * them for a sentence that names two categories — so it was handed none, and this
 * function told a school to add the commitments it had already added. The engine
 * now reports what dug the hole, and the sentence just says it.
 */
export function whyLine(projection, format) {
  if (!projection || projection.lowestDate == null) return null

  const fmt = typeof format === 'function' ? format : (n) => `$${Math.round(n).toLocaleString()}`

  const top = (projection.driversToLowPoint ?? []).slice(0, 2)
  const drivers = top.map((d) => noun(d.category))
  const driverTotal = top.reduce((s, d) => s + d.amount, 0)
  const recovery = projection.nextReceiptAfterLow ?? null

  if (drivers.length === 0) {
    return `The low point falls on ${projection.lowestDate}. Record your payroll, debt service and insurance to see what drives it.`
  }

  const head =
    `About ${fmt(driverTotal)} of ${list(drivers)} falls due before the low point on ` +
    `${projection.lowestDate}`
  const tail = recovery
    ? `, ahead of ${noun(recovery.category)} resuming on ${recovery.date}.`
    : `, and no significant receipt follows it inside this horizon.`

  // Only said when it is true: a trough with receipts still arriving is a
  // different situation from one with none, and conflating them would mislead.
  const dry =
    projection.receiptsBeforeLowPoint === 0
      ? ' Nothing is received at all before that date.'
      : ''

  return `${head}${tail}${dry}`
}

/**
 * The recommendations under the chart. RECOMMENDATIONS, never actions — the docs
 * are explicit and they are right: a screen that moved a school's money or
 * cancelled its purchase order on the strength of a projection would be acting on
 * an estimate. Each of these is a thing a person might choose to do.
 *
 * Returns [] when there is no shortfall, because a school in the clear should not
 * be handed a list of remedies for a problem it does not have.
 */
export function potentialActions(projection, format) {
  if (!projection || projection.firstShortfallDate == null) return []
  const fmt = typeof format === 'function' ? format : (n) => `$${Math.round(n).toLocaleString()}`
  const gap = projection.shortfallAmount ?? 0
  const out = []

  out.push({
    key: 'review-ar',
    label: 'Review overdue tuition balances',
    detail: 'Collections arriving earlier move the low point directly. Cash & Collections shows what is outstanding and how long it has been.',
    to: '/cash',
  })
  out.push({
    key: 'defer',
    label: `Defer discretionary spend through ${projection.lowestDate}`,
    detail: `Roughly ${fmt(gap)} would close the gap. The budget shows what is scheduled in that window.`,
    to: '/budget',
  })
  out.push({
    key: 'reserves',
    label: 'Confirm what reserves are actually available',
    detail: 'Board-designated and restricted balances are not operating cash. Knowing the difference before the low point is the difference between a decision and a scramble.',
    to: '/reports',
  })
  return out
}
