// ─────────────────────────────────────────────────────────────────────────────
// statementPairing — half a trial balance + the other half = one (#40).
//
// A QuickBooks Profit and Loss export is only the INCOME half of a trial
// balance; a Balance Sheet export is only the other half. Dropped together (or
// one now and one later, for the same period end) they merge — client-side, via
// the parser's own mergeStatementResults — into ONE full trial balance, with an
// explicit acct-399 balancing line when they didn't tie.
//
// This is a PURE DERIVATION over the intake's raw file list: the raw files stay
// in state untouched and the paired list is recomputed (useMemo) from them, so
// there is no setState-in-effect and removing the merged card can hand back
// exactly the halves that were there. Never guesses: two P&Ls for one date with
// a Balance Sheet is "ambiguous" and nothing merges until the person says.
// ─────────────────────────────────────────────────────────────────────────────
import {
  statementHalf,
  pairStatements,
  asStatementResult,
  mergeStatementResults,
  classifyRole,
} from '@finrep/ingestion'
import { validateDataset, findUnmapped } from '@finrep/engine'

export const PAIR_PREFIX = 'pair:'
export const isPairId = (id) => typeof id === 'string' && id.startsWith(PAIR_PREFIX)

/** Which half (pl|bs) a ready, uploaded (not history) file is — else null. */
export function halfOfEntry(f) {
  if (!f || f.status !== 'ready' || f.fromHistory) return null
  try {
    return statementHalf(f.metadata) ?? null
  } catch {
    return null
  }
}

/**
 * The role a merged pair takes → { role, roleConfirmed } (role null = use the
 * merged file's own classification).
 *
 * Dropping a file into an empty slot confirms that slot's role (roleFromSlot)
 * — but when the OTHER half was placed first, the drop only means "here is the
 * other half", and the first half's role decides. Live-caught: P&L into This
 * year, then the Balance Sheet into the nearest empty box ("Last year's trial
 * balance") pinned the BS to PY, and the combined P&L + BS landed as LAST YEAR
 * with This year left empty. A role a person PICKED (the role chip) still wins.
 * `firstId` = the id of the half placed first (null = unknown).
 */
export function mergedRole(pl, bs, firstId = null) {
  const first = firstId === pl.id ? pl : firstId === bs.id ? bs : null
  const second = first ? (first === pl ? bs : pl) : null
  if (first && second.roleConfirmed && second.roleFromSlot && first.role) {
    return { role: first.role, roleConfirmed: !!first.roleConfirmed }
  }
  if (pl.roleConfirmed && bs.roleConfirmed && pl.role === bs.role) return { role: pl.role, roleConfirmed: true }
  const confirmed = pl.roleConfirmed ? pl : bs.roleConfirmed ? bs : null
  if (!confirmed) return { role: null, roleConfirmed: false }
  return { role: confirmed.role, roleConfirmed: true }
}

/** One merged FileEntry from a P&L half and a Balance Sheet half (null if they can't merge). */
export function makeMergedEntry(pl, bs, firstId = null) {
  const a = asStatementResult(pl.rows || [], pl.metadata, pl.warnings)
  const b = asStatementResult(bs.rows || [], bs.metadata, bs.warnings)
  if (!a || !b) return null
  const merged = mergeStatementResults(a, b)
  const fileName = `${pl.fileName} + ${bs.fileName}`.slice(0, 255)
  const suggestion = classifyRole({ fileName, metadata: merged.metadata })
  const picked = mergedRole(pl, bs, firstId)
  return {
    id: `${PAIR_PREFIX}${pl.id}:${bs.id}`,
    fileName,
    fileSize: (pl.fileSize || 0) + (bs.fileSize || 0),
    status: 'ready',
    rows: merged.rows,
    metadata: merged.metadata,
    warnings: merged.warnings ?? [],
    suggestion,
    role: picked.role ?? suggestion.role,
    roleConfirmed: picked.roleConfirmed,
    balance: validateDataset(merged.rows),
    unmappedCount: findUnmapped(merged.rows).length,
    persisted: false,
    mergedFrom: [pl.id, bs.id],
    members: [
      { id: pl.id, fileName: pl.fileName, persisted: !!pl.persisted, half: 'pl' },
      { id: bs.id, fileName: bs.fileName, persisted: !!bs.persisted, half: 'bs' },
    ],
  }
}

/**
 * Two halves can pair unless the person already gave them DIFFERENT roles. A
 * later half whose role only came from the slot it was dropped into is not
 * such a choice: it follows the half that was there first (mergedRole).
 * `order` = id → position in the intake (lower = placed first).
 */
export function canPairHalves(pl, bs, order = null) {
  if (!(pl.roleConfirmed && bs.roleConfirmed && pl.role !== bs.role)) return true
  if (!order) return false
  const iPl = order.get(pl.id)
  const iBs = order.get(bs.id)
  if (iPl == null || iBs == null) return false
  const later = iPl <= iBs ? bs : pl
  return !!later.roleFromSlot
}

/**
 * rawFiles → the list the intake shows. Same-period P&L + Balance Sheet halves
 * become one merged entry (at the first half's position); halves that stay
 * apart carry a `pairNote` saying why. `manualPairs` ([{plId, bsId}], either
 * order) are honoured first ("Combine anyway"). Two PERSISTED halves are left
 * alone — that pair is already on the server as it is.
 */
export function pairIntakeFiles(rawFiles, manualPairs = []) {
  const files = Array.isArray(rawFiles) ? rawFiles : []
  const halfOf = new Map()
  const eligible = []
  for (const f of files) {
    const h = halfOfEntry(f)
    if (!h) continue
    halfOf.set(f.id, h)
    eligible.push(f)
  }
  if (eligible.length === 0) return files

  const byId = new Map(eligible.map((f) => [f.id, f]))
  const used = new Set()
  const pairs = []
  for (const mp of manualPairs || []) {
    const a = byId.get(mp?.plId)
    const b = byId.get(mp?.bsId)
    if (!a || !b || a === b || used.has(a.id) || used.has(b.id)) continue
    if (halfOf.get(a.id) === halfOf.get(b.id)) continue
    const pl = halfOf.get(a.id) === 'pl' ? a : b
    const bs = pl === a ? b : a
    pairs.push({ pl, bs })
    used.add(a.id)
    used.add(b.id)
  }

  const order = new Map(files.map((f, i) => [f.id, i]))
  const rest = eligible.filter((f) => !used.has(f.id))
  const auto = pairStatements(rest, (f) => f.metadata, { canPair: (a, b) => canPairHalves(a, b, order) })
  pairs.push(...auto.pairs)

  // Merge every pair that has something new in it.
  const dropped = new Map() // member id → merged entry (or null for the 2nd member)
  for (const { pl, bs } of pairs) {
    if (pl.persisted && bs.persisted) continue
    const iPl = files.indexOf(pl)
    const iBs = files.indexOf(bs)
    const first = iPl <= iBs ? pl : bs
    const second = first === pl ? bs : pl
    const merged = makeMergedEntry(pl, bs, first.id)
    if (!merged) continue
    dropped.set(first.id, merged)
    dropped.set(second.id, null)
  }

  // Why each remaining half is still on its own.
  const notes = new Map()
  const unpaired = auto.unpaired || []
  for (const u of unpaired) {
    const note = { why: u.why }
    if (u.partnerDate) note.partnerDate = u.partnerDate
    if (u.why === 'date-mismatch' || u.why === 'no-date') {
      const opposite = unpaired.filter(
        (o) => o.half !== u.half && !(o.item.persisted && u.item.persisted),
      )
      if (opposite.length === 1) {
        note.partnerId = opposite[0].item.id
        note.partnerName = opposite[0].item.fileName
        if (!note.partnerDate && opposite[0].item.metadata?.periodEndDate) {
          note.partnerDate = opposite[0].item.metadata.periodEndDate
        }
      }
    }
    if (u.why === 'ambiguous') {
      // Which kind is doubled on this date (the card says "Two income statements…").
      const date = u.item.metadata?.periodEndDate
      const same = unpaired.filter((o) => o.why === 'ambiguous' && o.item.metadata?.periodEndDate === date)
      const pls = same.filter((o) => o.half === 'pl').length
      const bss = same.filter((o) => o.half === 'bs').length
      note.doubled = pls >= 2 ? 'pl' : bss >= 2 ? 'bs' : u.half
    }
    note.half = u.half
    notes.set(u.item.id, note)
  }

  const out = []
  for (const f of files) {
    if (dropped.has(f.id)) {
      const m = dropped.get(f.id)
      if (m) out.push(m)
      continue
    }
    const note = notes.get(f.id)
    out.push(note ? { ...f, pairNote: note } : f)
  }
  return out
}

/** The raw ids an intake id stands for (a merged entry's halves, else itself). */
export function memberIdsOf(files, id) {
  if (!isPairId(id)) return [id]
  const e = (files || []).find((f) => f.id === id)
  return e?.mergedFrom ? [...e.mergedFrom] : []
}

/**
 * Remove an intake entry. A merged entry removes only the halves added in this
 * session (a persisted half reappears as its own card) and never touches the
 * server; its manual pair goes with it.
 * → { rawFiles, manualPairs, deleteImport: entry|null }
 */
export function removeIntakeEntry(rawFiles, manualPairs, derivedFiles, id) {
  const target = (derivedFiles || []).find((f) => f.id === id) || null
  let drop
  let deleteImport = null
  if (target?.mergedFrom) {
    drop = new Set((target.members || []).filter((m) => !m.persisted).map((m) => m.id))
  } else {
    drop = new Set([id])
    if (target?.persisted && target.importId) deleteImport = target
  }
  const gone = new Set(target?.mergedFrom ? target.mergedFrom : [id])
  return {
    rawFiles: (rawFiles || []).filter((f) => !drop.has(f.id)),
    manualPairs: (manualPairs || []).filter((p) => !gone.has(p.plId) && !gone.has(p.bsId)),
    deleteImport,
  }
}

/** Set (and confirm) a role; a merged entry's halves both take it. */
export function setRoleInRaw(rawFiles, derivedFiles, id, role) {
  const ids = new Set(memberIdsOf(derivedFiles, id))
  // A role a person PICKS is theirs — no longer "from the slot it was dropped in".
  return (rawFiles || []).map((f) => (ids.has(f.id) ? { ...f, role, roleConfirmed: true, roleFromSlot: false } : f))
}

/** The raw half of `id` that holds account `acct` (a merged entry → that member). */
export function memberHolding(rawFiles, derivedFiles, id, acct) {
  const ids = memberIdsOf(derivedFiles, id)
  const raw = (rawFiles || []).filter((f) => ids.includes(f.id))
  return raw.find((f) => (f.rows || []).some((r) => Number(r.acct) === Number(acct))) || null
}
