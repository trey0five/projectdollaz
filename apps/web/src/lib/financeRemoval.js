// ─────────────────────────────────────────────────────────────────────────────
// financeRemoval — what every remove / restore does afterwards, in one place:
// re-hydrate the saved years (the intake, the period list) and tell every
// figure on screen to reload (the same 'penny:data-changed' event the other
// upload paths broadcast).
// ─────────────────────────────────────────────────────────────────────────────
import { apiErrorMessage } from './api.js'

export async function afterFinanceChange(persistence) {
  try {
    await persistence?.refresh?.()
  } finally {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('penny:data-changed', { detail: { key: 'metrics' } }))
    }
  }
}

/** What a failed restore says, from the person's side. */
export function restoreErrorText(err, entry) {
  const status = err?.response?.status
  const code = err?.response?.data?.code
  if (status === 409 && code === 'SLOT_FILLED') {
    return `${entry?.shortLabel || 'This year'} has newer data now, so we didn't bring this back. You can swap them from Recently removed.`
  }
  if (status === 410) return "That was removed more than 30 days ago, so it can't be brought back."
  if (status === 404) return "That's already been brought back."
  return apiErrorMessage(err, "We couldn't bring it back. Try again from Recently removed.")
}
