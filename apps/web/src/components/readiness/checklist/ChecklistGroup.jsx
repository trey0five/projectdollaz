// ─────────────────────────────────────────────────────────────────────────────
// Phase 2C — one checklist group, wrapped in the same collapsible MetricSection
// the six AUP sections use. Title = `${section} · ${title}` (DOCUMENTS group gets a
// friendly label); subtitle = item count. Renders a ChecklistItemRow per item.
// ─────────────────────────────────────────────────────────────────────────────
import MetricSection from '../../analytics/MetricSection.jsx'
import ChecklistItemRow from './ChecklistItemRow.jsx'
import { checklistGroupTitle } from '../../../lib/ChecklistMeta.js'

export default function ChecklistGroup({ group, drafts, onChange, canEdit }) {
  const count = group.items.length
  return (
    <MetricSection
      title={checklistGroupTitle(group.section, group.title)}
      subtitle={`${count} ${count === 1 ? 'item' : 'items'}`}
    >
      <div className="space-y-3">
        {group.items.map((item, i) => (
          <ChecklistItemRow
            key={item.id}
            item={item}
            draft={drafts[item.id]}
            onChange={onChange}
            canEdit={canEdit}
            index={i}
          />
        ))}
      </div>
    </MetricSection>
  )
}
