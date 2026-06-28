// ─────────────────────────────────────────────────────────────────────────────
// SchedulesEmbed — the three Supporting-schedule workspaces (Capital Budget /
// Cash & Investments / Capital Campaign), mounted inside the Data hub modal as
// the SINGLE INPUT surface for schedules. A thin tab-strip wrapper mirroring
// SchedulesPage's tab mounting, minus the page chrome (TopBar/BillingBanner/
// period picker) — schoolId/periodId/canEdit are supplied by the hub.
//
// The three workspaces are reused UNFORKED with the SAME remount keys
// SchedulesPage uses (`cap:`/`cash:`/`camp:${schoolId}:${periodId}`) so their
// seed-on-key logic is unchanged. They self-fetch + autosave (no onSaved); the
// hub refetches the schedules status on modal close.
//
// React-Compiler safety: `tab` is read at render, set only from click handlers
// (no setState-in-render). The active workspace is rendered ONLY.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { motion } from 'framer-motion'
import { Landmark, Banknote, Target } from 'lucide-react'
import CapitalScheduleWorkspace from '../reports/schedules/CapitalScheduleWorkspace.jsx'
import CashScheduleWorkspace from '../reports/schedules/CashScheduleWorkspace.jsx'
import CampaignScheduleWorkspace from '../reports/schedules/CampaignScheduleWorkspace.jsx'

const TABS = [
  { id: 'capital', label: 'Capital Budget', Icon: Landmark },
  { id: 'cash', label: 'Cash & Investments', Icon: Banknote },
  { id: 'campaign', label: 'Capital Campaign', Icon: Target },
]

export default function SchedulesEmbed({ schoolId, periodId, canEdit }) {
  const [tab, setTab] = useState('capital')

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <p className="mb-4 text-[15px] leading-relaxed text-muted">
        Capital projects, cash &amp; investment accounts, and campaigns that round out your board
        packet. Fill in the tables for this period — the totals flow into your next board report
        automatically, and everything saves as you type.
      </p>

      <div
        role="tablist"
        aria-label="Supporting schedules"
        className="mb-5 flex flex-wrap gap-2"
      >
        {TABS.map((t) => {
          const Icon = t.Icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-[15px] font-semibold transition-all ${
                active
                  ? 'border-gold/60 bg-gold/10 text-navy shadow-card'
                  : 'border-rule/60 text-muted hover:border-gold/50 hover:text-navy'
              }`}
            >
              <Icon size={16} /> {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'capital' && (
        <CapitalScheduleWorkspace
          key={`cap:${schoolId}:${periodId}`}
          schoolId={schoolId}
          periodId={periodId}
          canEdit={canEdit}
        />
      )}
      {tab === 'cash' && (
        <CashScheduleWorkspace
          key={`cash:${schoolId}:${periodId}`}
          schoolId={schoolId}
          periodId={periodId}
          canEdit={canEdit}
        />
      )}
      {tab === 'campaign' && (
        <CampaignScheduleWorkspace
          key={`camp:${schoolId}:${periodId}`}
          schoolId={schoolId}
          periodId={periodId}
          canEdit={canEdit}
        />
      )}
    </motion.div>
  )
}
