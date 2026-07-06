// QuickBooks transaction drill-down — PURE engine-account → QBO-account-id reversal.
//
// The statement lineage gives us the ENGINE account numbers behind a line
// (StatementSnapshot.payload.lineage[...][lineKey].sources[].acct). To pull the GL
// we need the QBO ACCOUNT IDS those map to. `deriveAcct`/`qboPlSection` (qbo.client)
// are the forward map used at import time; this module inverts them over a LIVE
// accountMeta() pull. No Nest/DB imports — unit-tested (qbo-drill.linkage.spec.ts).
import { deriveAcct, type QboAccountMeta } from './qbo.client.js'

/** One engine account resolved to its QBO account id(s). */
export interface AccountLinkage {
  /** The engine account number (from the lineage source row). */
  acct: number
  /** Display name for the account (from the lineage row desc / meta). */
  name: string
  /** QBO account ids this engine account maps to (numeric ids as strings). */
  qboAccountIds: string[]
  /** false when no QBO account could be resolved (synthetic ≥90000 / reclass split). */
  linkable: boolean
}

/**
 * The engine account a QBO account forward-maps to at import time — EXACTLY the rule
 * in qbo.client.ts (`acct = meta.acctNum ?? deriveAcct(meta).acct`): a real AcctNum
 * wins, otherwise the type-derived revenue/expense/BS block. `deriveAcct` alone is
 * type-only and ignores AcctNum, so it is NOT the whole forward map.
 */
function forwardAcct(meta: QboAccountMeta): number {
  return meta.acctNum != null ? meta.acctNum : deriveAcct(meta).acct
}

/**
 * Invert one engine account number to its QBO account id(s) by mirroring the forward
 * map: every QBO account whose `forwardAcct` lands on this engine acct. That:
 *  - respects AcctNum precedence (a 5-digit revenue AcctNum like 45000 resolves to its
 *    real id, NOT the block-arithmetic `acct−40000` — the bug the old shortcut caused);
 *  - unions the many-accounts-per-line case (several banks → one `cash`=100 line),
 *    including a mix of numbered + unnumbered contributors;
 *  - can't double-count (one forward acct per meta);
 *  - returns [] for synthetic / description-reclass rows nothing maps to → non-linkable.
 */
export function reverseAcct(acct: number, metas: QboAccountMeta[]): string[] {
  return metas.filter((m) => forwardAcct(m) === acct).map((m) => String(m.id))
}

/**
 * Reverse a set of lineage source rows to their QBO account ids. Deduplicates by
 * engine acct (a line can list the same acct twice — e.g. two "Checking"/"Savings"
 * rows both engine-100), preferring a source `desc` for the display name and
 * falling back to the QBO account name. Preserves input order of first appearance.
 */
export function buildAccountLinkage(
  sources: Array<{ acct: number; desc?: string | null }>,
  metas: QboAccountMeta[],
): AccountLinkage[] {
  const byId = new Map<number, QboAccountMeta>(metas.map((m) => [m.id, m]))
  const seen = new Map<number, AccountLinkage>()
  for (const src of sources) {
    const acct = src.acct
    if (!Number.isFinite(acct) || seen.has(acct)) continue
    const qboAccountIds = reverseAcct(acct, metas)
    // Prefer the lineage desc; else the resolved QBO account name (first id).
    const metaName = qboAccountIds.length ? byId.get(Number(qboAccountIds[0]))?.accountType : undefined
    const name = (src.desc ?? '').trim() || metaName || `Account ${acct}`
    seen.set(acct, { acct, name, qboAccountIds, linkable: qboAccountIds.length > 0 })
  }
  return [...seen.values()]
}
