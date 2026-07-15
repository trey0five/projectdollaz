// ─────────────────────────────────────────────────────────────────────────────
// ScorecardView — the metrics TABLE per scope. School → the customizable Scorecard
// (shared /dashboard persistence). Compare → the CompareLeaderboard. Org (all
// schools) → the OrgScorecard (schools + roll-up row). Columns for the
// leaderboards are the user's visible-metric set (passed down) so all three
// scorecards agree.
// ─────────────────────────────────────────────────────────────────────────────
import Scorecard from './Scorecard.jsx'
import { CompareLeaderboard, OrgScorecard } from './Leaderboard.jsx'

export default function ScorecardView({
  scope,
  school,
  compare,
  org,
  columns,
  canCustomize,
  onCrossToChart,
  highlight,
  onHighlightConsumed,
}) {
  if (scope === 'compare') return <CompareLeaderboard schools={compare.schools} columns={columns} />
  if (scope === 'org')
    return <OrgScorecard schools={org.schools} columns={columns} orgMetrics={org.orgMetrics} />
  return (
    <Scorecard
      scope={scope}
      schoolId={school.id}
      metricsByKey={school.metricsByKey}
      canCustomize={canCustomize}
      onCrossToChart={onCrossToChart}
      highlight={highlight}
      onHighlightConsumed={onHighlightConsumed}
    />
  )
}
