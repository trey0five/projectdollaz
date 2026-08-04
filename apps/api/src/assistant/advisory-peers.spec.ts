import { describe, expect, it } from 'vitest'
import { peerRowsFor, resolveFocusSchool } from './assistant.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// PEER-1 — compare_accreditation_peers SHIPS ONE POPULATION, NOT TWO.
//
// THE DEFECT. `peerCount`, `rank` and `percentile` came from the peer PANEL
// (resolvePeerGroup's matched subset), while the `peers` array was built from
// `portfolio.ranked` minus the focus school — EVERY ranked school in the
// organization. A 12-school diocese whose focus school matched 3 peers returned
// `{ peerCount: 3, peers: [11 named schools] }`. Three things go wrong at once:
//
//   (a) the model is told there are 3 comparable peers and handed 11 to name;
//   (b) each peer row carried `rank` = PortfolioRow.rank, the org-wide ATTENTION
//       rank where 1 = NEEDS THE MOST ATTENTION, under the same key as the payload's
//       readiness rank where 1 = BEST — so "you are rank 2, St. Aloysius is rank 1"
//       states the exact inverse of the truth;
//   (c) the k<4 percentile refusal ("a percentile over 3 peers would be noise") shipped
//       in the same payload as 11 named verifiedPct values, which is one division away
//       from the percentile it refuses — and a refusal must carry nothing to
//       improvise from.
//
// SEEN RED. Reverting `peerRowsFor` to `ranked.filter(r => r.schoolId !== focusId)`
// reddens PEER-1.1 ("expected 4 to be 2") and PEER-1.2.
// ─────────────────────────────────────────────────────────────────────────────

const RANKED = [
  { schoolId: 's-focus', name: 'St. Mary Academy', attentionBand: 'watch', verifiedPct: 71, rank: 4 },
  { schoolId: 's-peer-1', name: 'St. Agnes', attentionBand: 'ok', verifiedPct: 80, rank: 5 },
  { schoolId: 's-peer-2', name: 'Holy Cross', attentionBand: 'watch', verifiedPct: 64, rank: 3 },
  // NOT in the peer group: a bigger, differently-typed school that is nonetheless ranked.
  { schoolId: 's-other', name: 'St. Aloysius', attentionBand: 'act', verifiedPct: 18, rank: 1 },
  { schoolId: 's-other-2', name: 'Sacred Heart', attentionBand: 'act', verifiedPct: 22, rank: 2 },
]
const PEER_IDS = ['s-peer-1', 's-peer-2']
const COVERED = new Map<string, string>(RANKED.map((r) => [r.schoolId, 'owner']))

describe('PEER-1 — the peers named are the panel’s own members', () => {
  it('PEER-1.1 peers.length === peerCount, by construction', () => {
    const rows = peerRowsFor(RANKED, PEER_IDS, COVERED)
    expect(rows).toHaveLength(PEER_IDS.length)
    expect(rows.map((r) => r.name).sort()).toEqual(['Holy Cross', 'St. Agnes'])
  })

  it('PEER-1.2 a ranked school OUTSIDE the peer group is not named or measured', () => {
    const rows = peerRowsFor(RANKED, PEER_IDS, COVERED)
    const names = rows.map((r) => r.name)
    expect(names).not.toContain('St. Aloysius')
    expect(names).not.toContain('Sacred Heart')
    // …and none of their verifiedPct values leak either, which is what would let a
    // model reconstruct the percentile the tool refuses to state.
    expect(rows.map((r) => r.verifiedPct)).not.toContain(18)
  })

  it('PEER-1.3 the two opposite rank scales do not share a key name', () => {
    const rows = peerRowsFor(RANKED, PEER_IDS, COVERED)
    for (const row of rows) {
      expect(Object.keys(row)).not.toContain('rank')
      expect(row).toHaveProperty('orgAttentionRank')
    }
    // The value is the org ATTENTION rank, unchanged — only its NAME is honest now.
    expect(rows.find((r) => r.name === 'Holy Cross')?.orgAttentionRank).toBe(3)
  })

  it('PEER-1.4 a peer the caller cannot see is DROPPED, never labelled "Peer A"', () => {
    // Fail-closed. `getPortfolio` is bounded by `resolveOrgScope` today, so this
    // branch cannot fire — which is exactly why it must not MINT a row if it ever
    // does. An anonymised placeholder is a school the model can talk about.
    const narrow = new Map<string, string>([['s-peer-1', 'owner']])
    const rows = peerRowsFor(RANKED, PEER_IDS, narrow)
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('St. Agnes')
    expect(JSON.stringify(rows)).not.toMatch(/Peer [A-Z]/)
  })

  it('PEER-1.5 an empty peer id list yields no rows at all', () => {
    expect(peerRowsFor(RANKED, [], COVERED)).toEqual([])
  })

  it('PEER-1.6 accepts a Set of covered ids as well as a role Map', () => {
    expect(peerRowsFor(RANKED, PEER_IDS, new Set(['s-peer-1', 's-peer-2']))).toHaveLength(2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PEER-2 — NAMING THE SCHOOL IS EXACT-MATCH ONLY.
//
// resolveStandardRef refuses a near miss rather than guessing, and refuseUnknownStandard
// says so out loud ("I won't guess at which one you meant"). The peer tool tried an
// exact match and then `.includes()`, so in a diocese holding "St. Mary Academy" and
// "St. Mary of the Angels", "compare St. Mary to its peers" resolved to whichever
// sorted first in the ATTENTION ranking and answered about the other one.
//
// SEEN RED: restore the `.includes()` fallback — PEER-2.1 reads
// "expected 'St. Mary Academy' to be null".
// ─────────────────────────────────────────────────────────────────────────────
describe('PEER-2 — a near miss is refused, not guessed', () => {
  const AMBIGUOUS = [
    { schoolId: 's-1', name: 'St. Mary Academy' },
    { schoolId: 's-2', name: 'St. Mary of the Angels' },
    { schoolId: 's-3', name: 'Holy Cross' },
  ]

  it('PEER-2.1 an ambiguous prefix resolves to NOTHING and lists what it matched', () => {
    const out = resolveFocusSchool(AMBIGUOUS, 'St. Mary', 's-3')
    expect(out.focus).toBeNull()
    expect(out.refusal?.reason).toBe('unknown_school')
    expect(out.refusal?.candidates).toEqual(['St. Mary Academy', 'St. Mary of the Angels'])
    expect(String(out.refusal?.message)).toMatch(/won’t guess/i)
  })

  it('PEER-2.2 an exact name (case- and space-insensitive) resolves', () => {
    expect(resolveFocusSchool(AMBIGUOUS, '  st. mary academy ', 's-3').focus?.schoolId).toBe('s-1')
  })

  it('PEER-2.3 a name matching nothing refuses, and names no candidate it did not match', () => {
    const out = resolveFocusSchool(AMBIGUOUS, 'St. Bede', 's-3')
    expect(out.focus).toBeNull()
    expect(out.refusal?.candidates).toEqual([])
    expect(String(out.refusal?.message)).not.toMatch(/St\. Mary/)
  })

  it('PEER-2.4 no name at all falls back to the ACTIVE school, with no refusal', () => {
    const out = resolveFocusSchool(AMBIGUOUS, '', 's-3')
    expect(out.focus?.schoolId).toBe('s-3')
    expect(out.refusal).toBeNull()
  })
})
