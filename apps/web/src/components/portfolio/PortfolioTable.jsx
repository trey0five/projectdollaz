// ─────────────────────────────────────────────────────────────────────────────
// PortfolioTable — AIC Phase I. The ranked list a superintendent reads first.
//
// WHAT EVERY ROW MUST CARRY (spec §7.1): the band, the attention score, the
// urgency, the EVIDENCE-BACKED percentage, and its DRIVERS. A row that shows a
// rank and no reason is the thing this phase was built to stop shipping.
//
// THE TIEBREAK COLUMN IS `verifiedPct`, NOT `readinessPct`, AND THAT IS THE WHOLE
// POINT. `readinessPct` and `selfScoredPct` are dominated by what a school said
// about itself in a rubric. A portfolio that breaks ties on a self-score tells
// fourteen principals that the way to move down the superintendent's list is to
// score yourself more generously. `verifiedPct` is the evidence-backed term: the
// only way to move on it is to produce an artifact. Ranking on self-scores rewards
// optimistic self-assessment; ranking on evidence rewards evidence. WEB-3 pins the
// labelled column, because swapping one field name here is a one-character diff
// that reads as a tidy-up.
//
// THE ORDER IS THE SERVER'S. The comparator is frozen API-side (band, urgency,
// score, verifiedPct, name, schoolId) and there is deliberately no sort parameter
// anywhere in Phase I — so this component renders `ranked` IN THE ORDER IT
// ARRIVED and never sorts, re-sorts or "helpfully" stabilises anything. A click-
// to-sort header would make acceptance 6 (byte-identical ordering) unobservable.
//
// PERCENTILES ARE NEVER COMPUTED HERE (spec §7.2, §7.4, WEB-4). The API nulls
// `percentile` whenever a school has fewer than four peers, because a percentile
// over three peers is a statistic-shaped decoration. The rank still renders — that
// is a fact — and the percentile simply is not there.
// ─────────────────────────────────────────────────────────────────────────────
import AttentionBandChip, { UrgencyChip, bandTone, pctText, percentileText } from './AttentionBandChip.jsx'
import DriversList from './DriversList.jsx'
import { DemoChip } from '../accreditation/ReadinessTrendStrip.jsx'
import { DataTable } from '../ui/surface/index.js'
import { ListOrdered } from 'lucide-react'
import { AuroraEmpty, AuroraSection } from '../ui/aurora/index.js'
import '../../styles/pending/b1-domain.css'

/**
 * The peer floor, mirroring the API's `MIN_PEERS_FOR_PERCENTILE` (spec §7.4).
 *
 * The API is the authority and already nulls `percentile` below four peers; this
 * is the SECOND gate, not a second opinion. It can only ever withhold — there is
 * no branch in which the web shows a percentile the API did not send — and it
 * means a server-side regression that starts emitting a percentile over three
 * peers surfaces as a missing statistic rather than as a fabricated one. A
 * percentile over three peers is a statistic-shaped decoration, and it is exactly
 * the small schools (which have the fewest peers) that would wear it.
 */
export const MIN_PEERS_FOR_PERCENTILE = 4

/**
 * The peer cell. `rank` is always emitted; `percentile` only when the API judged
 * the sample big enough. Nothing here derives a percentile from a rank — that
 * would reinstate, in JSX, exactly the statistic the server declined to publish.
 */
export function PeerCell({ peers = null }) {
  if (!peers || !Number.isFinite(peers.peerCount)) {
    return <span className="text-[12.5px] text-ink2">No peer group</span>
  }
  const pctile =
    peers.peerCount >= MIN_PEERS_FOR_PERCENTILE ? percentileText(peers.percentile) : null
  const relaxed = Array.isArray(peers.relaxedDims) && peers.relaxedDims.length > 0
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className="whitespace-nowrap text-[12.5px] font-semibold tabular-nums text-ink">
        {Number.isFinite(peers.rank) ? `Rank ${peers.rank}` : 'Rank —'}
        <span className="font-normal text-ink2">
          {' '}
          · {peers.peerCount} {peers.peerCount === 1 ? 'peer' : 'peers'}
        </span>
      </span>
      {pctile ? (
        <span className="text-[11.5px] text-ink2">{pctile}</span>
      ) : (
        // Deliberately does not use the WORD either: a sentence containing
        // "percentile" in the cell where a percentile was withheld is the thing a
        // reader skims and mis-remembers as having seen one.
        <span className="text-[11.5px] text-ink2">Peer group too small to place it within</span>
      )}
      {relaxed && (
        <span className="text-[11px] text-ink2">
          Peer match relaxed: {peers.relaxedDims.join(', ')}
        </span>
      )}
    </span>
  )
}

function FrameworkLine({ row }) {
  const parts = []
  if (row?.frameworkName) parts.push(row.frameworkName)
  else if (row?.frameworkCode) parts.push(row.frameworkCode)
  if (row?.snapshotDate) parts.push(`as of ${row.snapshotDate}`)
  if (parts.length === 0) return null
  return <span className="text-[11.5px] text-ink2">{parts.join(' · ')}</span>
}

export default function PortfolioTable({ rows = [], indexComparable = true }) {
  const ranked = Array.isArray(rows) ? rows : []
  if (ranked.length === 0) {
    return (
      <AuroraSection icon={ListOrdered} title="Ranked by attention" subtitle="Schools that need you most, first">
        <AuroraEmpty
          icon={ListOrdered}
          text="No school in this organization can be ranked yet."
          sub="The sections below name what is missing."
        />
      </AuroraSection>
    )
  }

  // NO sortable column, on purpose: the order is the server's (see above).
  const columns = [
    { key: 'rank', header: '#', num: true, className: 'pf-c-rank', render: (row) => <span className="font-semibold text-ink2">{row?.rank ?? '—'}</span> },
    {
      key: 'school',
      header: 'School',
      className: 'pf-c-school',
      render: (row) => (
        <div className="flex min-w-[12rem] flex-col gap-0.5 py-2">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-ink">{row?.name ?? 'Unnamed school'}</span>
            {row?.demoData ? <DemoChip /> : null}
          </span>
          <FrameworkLine row={row} />
        </div>
      ),
    },
    // `pf-m-label` is the column's name, shown only on a phone, where each row
    // becomes a stacked card and the header row is off screen.
    {
      key: 'attention',
      header: 'Attention',
      className: 'pf-c-att',
      render: (row) => (
        <>
          <span className="pf-m-label">Attention</span>
          <AttentionBandChip band={row?.attentionBand} score={row?.attentionScore} />
        </>
      ),
    },
    {
      key: 'urgency',
      header: 'Urgency',
      className: 'pf-c-urg',
      render: (row) => (
        <>
          <span className="pf-m-label">Urgency</span>
          <UrgencyChip urgency={row?.urgency} reason={row?.urgencyReason} />
        </>
      ),
    },
    // THE TIEBREAK COLUMN. `verifiedPct` — the evidence-backed figure the server
    // broke ties on. Never `readinessPct`, never `selfScoredPct`.
    {
      key: 'verified',
      header: 'Evidence-backed',
      num: true,
      render: (row) => (
        <>
          <span className="pf-m-label">Evidence-backed</span>
          {pctText(row?.verifiedPct) ?? <span className="font-normal text-ink2">Not measured</span>}
        </>
      ),
      className: 'font-semibold pf-c-ev',
    },
    {
      key: 'peers',
      header: 'Peers',
      className: 'pf-c-peers',
      render: (row) => (
        <>
          <span className="pf-m-label">Peers</span>
          <PeerCell peers={row?.peers ?? null} />
        </>
      ),
    },
    {
      key: 'why',
      header: 'Why',
      className: 'min-w-[16rem] max-w-[26rem] !py-2 align-top pf-c-why',
      render: (row) => (
        <>
          <span className="pf-m-label">Why</span>
          <DriversList drivers={row?.drivers} />
        </>
      ),
    },
  ]

  return (
    <AuroraSection
      aria-labelledby="portfolio-ranked"
      icon={ListOrdered}
      title={<span id="portfolio-ranked">Ranked by attention</span>}
      subtitle={
        indexComparable
          ? 'Band, then urgency, then evidence — never by index'
          : 'Index scores are not compared across frameworks.'
      }
      count={`${ranked.length} ${ranked.length === 1 ? 'school' : 'schools'}`}
    >
      {/* Wide content scrolls inside its own card — the page never scrolls
          sideways. The order is the server's: band, then urgency, then
          attention, then evidence coverage. */}
      <div className="au-card au-card-flat au-register min-w-0">
        <DataTable
          caption="Schools ranked by attention"
          columns={columns}
          rows={ranked}
          rowKey={(row, i) => row?.schoolId ?? row?.rank ?? i}
          markOf={(row) => bandTone(row?.attentionBand)}
          className="pf-stack pf-ranked [&_.dt]:min-w-[52rem]"
        />
      </div>
    </AuroraSection>
  )
}
