// ─────────────────────────────────────────────────────────────────────────────
// What ACTUALLY lit up when a trial balance landed.
//
// This is the honest half of the celebration: LightUpReveal is allowed to be as
// loud as it likes, but every claim it makes comes from here, and every claim
// here is gated on data that genuinely exists. The rules that matter:
//
//   • The statement of CASH FLOWS needs last year's AUDITED figures. Without
//     them the school gets three statements, not four — so we say three. The
//     intake's own "What goes where" already promises the audited file
//     "unlocks the cash-flow statement"; contradicting that in the reward
//     screen would teach the user their uploads don't matter.
//   • Year-over-year columns need a prior year — either a Prior-Year file in
//     this period or an earlier SAVED period. Neither ⇒ no comparatives tile.
//   • Budget variance needs a BUDGET. With none, the tile is an invitation to
//     set one up (a real, working destination) rather than a claim.
//   • Readiness only appears when the accreditation module is licensed —
//     otherwise the link lands on an upsell, which is not a reward.
//
// Pure: no React, no network, no clock. Every input is passed in.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object}  a
 * @param {object}  a.period            the saved period ({ label, roles:{cy,py,audit} })
 * @param {string?} a.priorPeriodLabel  label of an earlier SAVED period, if any
 * @param {boolean} a.hasBudget         a budget exists for this period
 * @param {boolean} a.accreditationLicensed
 * @param {number}  a.vitalsScored      how many metrics came back available
 * @returns {Array<{key,title,fact,to,iconKey}>}
 */
export function resolveLightUps({
  period = null,
  priorPeriodLabel = null,
  hasBudget = false,
  accreditationLicensed = false,
  vitalsScored = 0,
} = {}) {
  if (!period) return []
  const label = period.label || 'this year'
  const roles = period.roles || {}
  const out = []

  // 1. Statements — the direct product of the upload. Count what the school can
  //    actually open, which depends on the audited file.
  out.push({
    key: 'statements',
    title: 'Your statements',
    fact: roles.audit
      ? `All four statements for ${label}, including cash flows`
      : `Activities, Financial Position and Net Assets for ${label}`,
    to: '/statements',
    iconKey: 'statements',
  })

  // 2. Analytics — only claims a count we were actually handed.
  out.push({
    key: 'analytics',
    title: 'Analytics',
    fact:
      vitalsScored > 0
        ? `${vitalsScored} vital${vitalsScored === 1 ? '' : 's'} scored against NBOA-style bands`
        : 'Your vitals, scored against NBOA-style bands',
    to: '/analytics',
    iconKey: 'analytics',
  })

  // 3. Comparatives — ONLY with a real prior year to compare against.
  const priorLabel = roles.py ? 'last year' : priorPeriodLabel
  if (roles.py || priorPeriodLabel) {
    out.push({
      key: 'comparatives',
      title: 'Year over year',
      fact: `${label} against ${priorLabel} — every line, side by side`,
      to: '/analytics',
      iconKey: 'comparatives',
    })
  }

  // 4. Budget — a claim when a budget exists, an invitation when it doesn't.
  out.push({
    key: 'budget',
    title: hasBudget ? 'Budget vs. actual' : 'Set up your budget',
    fact: hasBudget
      ? `Variance against your ${label} budget, line by line`
      : 'Add a budget and these actuals become live variance',
    // Same destination either way: the Budget tab IS the setup surface
    // (BudgetSetup derives summary-vs-wizard itself), so there is no separate
    // "set it up" route to send anyone to.
    to: '/budget',
    iconKey: 'budget',
  })

  // 5. Board packet.
  out.push({
    key: 'reports',
    title: 'Board packet',
    fact: `A finance-committee packet for ${label}, ready to export`,
    to: '/reports',
    iconKey: 'reports',
  })

  // 6. Readiness — licensed schools only; otherwise this is an upsell, not a reward.
  if (accreditationLicensed) {
    out.push({
      key: 'readiness',
      title: 'Review readiness',
      fact: 'Your finances now answer the financial-viability standards',
      to: '/accreditation',
      iconKey: 'readiness',
    })
  }

  return out
}

/**
 * The one-line headline fact under the title. Deliberately conservative: it
 * names the period and the number of accounts read, both of which we hold.
 */
export function revealSubtitle({ schoolName = null, period = null, accounts = 0 } = {}) {
  const who = schoolName ? `${schoolName} — ` : ''
  const label = period?.label ? period.label : 'this year'
  if (accounts > 0) {
    return `${who}${accounts} account${accounts === 1 ? '' : 's'} read from ${label}.`
  }
  return `${who}${label} is saved.`
}
