// ─────────────────────────────────────────────────────────────────────────────
// removalCopy — every sentence the remove / undo / restore flow says, written
// from the person's side ("Remove the FY25 trial balance?"). PURE.
//
// The popup reads a RemovalPreview from POST /finance/removals/preview, so it
// can say exactly what goes and what it affects BEFORE anything changes:
//   "Your FY25 statements and board report will be emptied, and FY26 loses its
//    prior-year comparison."
// ─────────────────────────────────────────────────────────────────────────────
import { halfLabel, monthList, monthLong, shortDate } from './financeInventory.js'

const undoLine = (days = 30) => `You can undo this for ${days} days from Recently removed.`
const QB_LINE = 'This came from QuickBooks, so a later QuickBooks sync may bring it back.'

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
const dropThe = (s) => (s.startsWith('the ') ? s.slice(4) : s)

/** One later year's comparison change, as a clause (no full stop). */
export function laterYearClause(e) {
  if (e.comparison === 'audited') {
    return e.after
      ? `${e.shortLabel} will use ${e.after.shortLabel}'s audited figures instead`
      : `${e.shortLabel} loses its audited comparison`
  }
  return e.after
    ? `${e.shortLabel} will compare against ${e.after.shortLabel} instead`
    : `${e.shortLabel} loses its prior-year comparison`
}

const OTHER_HALF = { pl: 'bs', bs: 'pl' }

/** What the popup says for a preview → { title, lines, confirmLabel }. */
export function previewCopy(p) {
  const S = p?.shortLabel || 'this year'
  const fx = p?.effects || {}
  const later = Array.isArray(fx.laterYears) ? fx.laterYears : []
  const undo = undoLine(p?.restoreDays ?? 30)
  const lines = []

  if (p?.kind === 'monthly') {
    const keys = [...(p.monthKeys || [])].sort()
    const n = keys.length
    if (n <= 1) {
      const m = monthLong(keys[0])
      return {
        title: `Remove the ${m} numbers?`,
        lines: [
          `Your ${S} month-by-month board report will no longer show ${m}.`,
          `Your ${S} trial balance and statements don't change.`,
          undo,
        ],
        confirmLabel: 'Remove month',
      }
    }
    const all = n === p.monthsOnFile
    return {
      title: all ? `Remove all ${n} months of ${S} numbers?` : `Remove ${n} months of ${S} numbers?`,
      lines: [
        all
          ? `Your ${S} month-by-month board report will be empty.`
          : `Your ${S} month-by-month board report will no longer show ${monthList(keys)}.`,
        `Your ${S} trial balance and statements don't change.`,
        undo,
      ],
      confirmLabel: `Remove ${n} months`,
    }
  }

  if (p?.kind === 'budget') {
    lines.push(`Budget vs. actual for ${S}, in your reports and board report, will be empty.`)
    if (p.budget?.hasForecast) lines.push('Your saved year-end forecast goes with it.')
    lines.push("Your trial balance and statements don't change.", undo)
    return { title: `Remove the ${S} budget?`, lines, confirmLabel: 'Remove budget' }
  }

  // ── trial balance ──
  const files = Array.isArray(p?.files) ? p.files : []
  const tail = () => {
    if (fx.quickbooks) lines.push(QB_LINE)
    lines.push(undo)
  }

  if (p?.role === 'py' || p?.role === 'audit') {
    const py = p.role === 'py'
    if (fx.statements !== 'none') {
      lines.push(`${S}'s statements will be rebuilt without ${py ? 'it' : 'them'}.`)
      const after = fx.self?.after
      if (py) {
        lines.push(
          after ? `${S} will compare against your ${after.shortLabel} trial balance instead.` : `${S} will have no prior-year column.`,
        )
      } else {
        lines.push(after ? `${S} will use ${after.shortLabel}'s audited figures instead.` : `${S} will have no audited column.`)
      }
    }
    for (const e of later) lines.push(`${laterYearClause(e)}.`)
    tail()
    return {
      title: py ? `Remove last year's trial balance saved with ${S}?` : `Remove the audited figures saved with ${S}?`,
      lines,
      confirmLabel: 'Remove',
    }
  }

  const active = files.find((f) => f.active) || files[0] || null
  const activeHalf = active?.half === 'pl' || active?.half === 'bs' ? active.half : null
  const word = halfLabel(activeHalf) || 'trial balance'

  if (fx.statements === 'emptied') {
    const base = fx.boardReport
      ? `Your ${S} statements and board report will be emptied`
      : `Your ${S} statements will be emptied`
    if (later.length === 1) {
      lines.push(`${base}, and ${laterYearClause(later[0])}.`)
    } else {
      lines.push(`${base}.`)
      for (const e of later) lines.push(`${laterYearClause(e)}.`)
    }
  } else {
    for (const e of later) lines.push(`${laterYearClause(e)}.`)
  }
  if (fx.budgetVsActual) lines.push(`Budget vs. actual for ${S} will have no actuals to compare.`)

  const inactive = files.filter((f) => f !== active)
  const hidden = activeHalf ? inactive.find((f) => f.half === OTHER_HALF[activeHalf]) || null : null
  if (hidden) {
    lines.push(
      `It also removes the ${halfLabel(hidden.half)} you uploaded on ${shortDate(hidden.uploadedAt)}, which isn't in your statements right now.`,
    )
  }
  const earlier = inactive.length - (hidden ? 1 : 0)
  if (earlier > 0) {
    lines.push(`This also removes ${earlier} earlier upload${earlier === 1 ? '' : 's'} of this file.`)
  }
  tail()
  return { title: `Remove the ${S} ${word}?`, lines, confirmLabel: `Remove ${word}` }
}

/** "the FY25 trial balance", "8 months of FY26 numbers", "the FY26 budget"… */
export function entryNoun(e) {
  const S = e?.shortLabel || 'this year'
  if (e?.kind === 'monthly') {
    const keys = e.monthKeys || []
    return keys.length === 1 ? `the ${monthLong(keys[0])} numbers` : `${keys.length} months of ${S} numbers`
  }
  if (e?.kind === 'budget') return `the ${S} budget`
  if (e?.role === 'py') return `last year's trial balance saved with ${S}`
  if (e?.role === 'audit') return `the audited figures saved with ${S}`
  const half = e?.files?.[0]?.half
  return `the ${S} ${halfLabel(half) || 'trial balance'}`
}

/** "FY25 trial balance removed." */
export function removedToast(e) {
  return `${cap(dropThe(entryNoun(e)))} removed.`
}

/** "Brought back the FY25 trial balance." */
export function restoredToast(e) {
  return `Brought back ${entryNoun(e)}.`
}

/** "FY25 trial balance · removed Oct 25 by Jacqui" (or "by you"). */
export function recentlyRemovedRow(e, currentUserId = null) {
  const who = e?.removedBy
    ? ` by ${currentUserId && e.removedBy.id === currentUserId ? 'you' : e.removedBy.name}`
    : ''
  return `${cap(dropThe(entryNoun(e)))} · removed ${shortDate(e?.removedAt)}${who}`
}

/** The "swap them?" popup for a restore whose place has newer data. */
export function swapCopy(e, current) {
  const when = shortDate(e?.files?.[0]?.uploadedAt || e?.removedAt)
  const title = `Bring back ${entryNoun(e)} from ${when}?`
  let body
  if (e?.kind === 'monthly') {
    const keys = current?.monthKeys?.length ? current.monthKeys : e.monthKeys || []
    const noun = keys.length === 1 ? `the ${monthLong(keys[0])} numbers` : `the ${monthList(keys)} numbers`
    body = `It takes the place of ${noun} you added since, which move to Recently removed.`
  } else if (current?.uploadedAt) {
    body = `It takes the place of the one added ${shortDate(current.uploadedAt)}, which moves to Recently removed.`
  } else {
    body = 'It takes the place of the one on file now, which moves to Recently removed.'
  }
  return { title, lines: [body], keepLabel: 'Keep the newer one', confirmLabel: 'Swap them' }
}
