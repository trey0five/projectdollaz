// ─────────────────────────────────────────────────────────────────────────────
// ScorecardView — the metrics TABLE per scope. School → the customizable Scorecard
// (shared /dashboard persistence). Compare → the CompareLeaderboard. Org (all
// schools) → the OrgScorecard (schools + roll-up row). Columns for the
// leaderboards are the user's visible-metric set (passed down) so all three
// scorecards agree.
// ─────────────────────────────────────────────────────────────────────────────
import { Table2 } from "lucide-react";
import Scorecard from "./Scorecard.jsx";
import { CompareLeaderboard, OrgScorecard } from "./Leaderboard.jsx";
import { AuroraSection } from "../../ui/aurora/index.js";

// Aurora: every scope's table opens under one "Scorecard" strip; the tables
// sit in white cards (`.fsub-tables`, the Finance sub-page sheet).
function Frame({ subtitle, children }) {
  return (
    <AuroraSection first icon={Table2} title="Scorecard" subtitle={subtitle}>
      <div className="fsub-tables">{children}</div>
    </AuroraSection>
  );
}

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
  if (scope === "compare")
    return (
      <Frame subtitle="Every measure, school by school">
        <CompareLeaderboard schools={compare.schools} columns={columns} />
      </Frame>
    );
  if (scope === "org")
    return (
      <Frame subtitle="Every school, plus the total">
        <OrgScorecard
          schools={org.schools}
          columns={columns}
          orgMetrics={org.orgMetrics}
        />
      </Frame>
    );
  return (
    <Frame subtitle="Every measure, most urgent first">
      <Scorecard
        scope={scope}
        schoolId={school.id}
        metricsByKey={school.metricsByKey}
        canCustomize={canCustomize}
        onCrossToChart={onCrossToChart}
        highlight={highlight}
        onHighlightConsumed={onHighlightConsumed}
      />
    </Frame>
  );
}
