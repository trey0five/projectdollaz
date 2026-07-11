// ─────────────────────────────────────────────────────────────────────────────
// wizardConfigs.js — the config that DRIVES the per-module "Add data" wizard.
//
// ONE reusable Choose → Enter/Upload → Confirm shell (AddDataWizard) is fed by
// these 8 module configs. The wizard is CHROME: it never reimplements an importer
// or a form. Each option is one of three kinds:
//   • 'embed'   — mount an existing importer/panel UNCHANGED (its own applied UI
//                 IS the Confirm). renderEmbed(ctx, nav) returns the element.
//   • 'modal'   — launch an existing exported *FormModal, wiring onSave = the real
//                 api.js create call (+ markSaved) and onClose. renderModal(ctx, h).
//   • 'handoff' — hand off to Penny (no wizard confirm of our own); onHandoff(ctx).
//
// NO in-render component defs live here — the render* fields are render-prop
// functions that return elements of module-scope components (the DataHubPage
// idiom). Hues come from tileRegistry (the ONE source of per-module color); the
// module accent is the only place a literal color is used (it is inherently
// per-module and cannot be a static token) — every other surface uses v2 tokens.
//
// DEVIATIONS from the arch table (built to the REAL exports; see report):
//   • finance monthly/budget/qbo + enrollment roster/connect + hr staff-counts are
//     EMBED (the importer owns its save) — there is no monthlyApi.upsertSnapshot /
//     budgetApi.putSpread to call from the wizard; those saves live in the panels.
//   • accreditation EVIDENCE and advancement GIFT have no standalone exported
//     *FormModal (they are page-private inline forms bound to a parent standard /
//     campaign). Wrapping them cleanly is out of the CHROME contract, so those
//     secondary options are omitted here (added from Records) and noted in the
//     report rather than reimplemented.
//   • enrollment MANUAL/plan has no manual-entry component to embed; the SIS card
//     already houses connect + roster upload, so it is the single "connect" option.
// ─────────────────────────────────────────────────────────────────────────────
import {
  FileSpreadsheet,
  CalendarClock,
  Wallet,
  Plug,
  Upload,
  ScrollText,
  ClipboardCheck,
  Wrench,
  HeartHandshake,
  Sparkles,
  Flag,
  Users,
} from 'lucide-react'

import { HOME_TILES, tileLabel } from '../home/tileRegistry.jsx'
import { policiesApi, accreditationApi, facilitiesApi, advancementApi } from '../../lib/api.js'

import TrialBalanceModalBody from '../datahub/TrialBalanceModalBody.jsx'
import MonthlyActualsPanel from '../monthly/MonthlyActualsPanel.jsx'
import BudgetSetup from '../budget/BudgetSetup.jsx'
import OperationalDataPanel from '../analytics/OperationalDataPanel.jsx'
import RosterUpload from '../enrollment/RosterUpload.jsx'
import { QboConnectEmbed, EnrollmentConnectEmbed } from './wizardEmbeds.jsx'
import WizardStrategyGoal from './WizardStrategyGoal.jsx'

// The exported page-private form modals (ENG-C1 adds the `export`; FROZEN names).
// If an import isn't in the tree yet the integrated build flags it — that is the
// documented counterpart dependency, not a wizard bug.
import { PolicyFormModal } from '../../pages/GovernancePage.jsx'
import { MaintenanceFormModal } from '../../pages/FacilitiesPage.jsx'
import { StandardFormModal } from '../../pages/AccreditationPage.jsx'
import { CampaignFormModal } from '../../pages/AdvancementPage.jsx'

// Per-module hue lookup — read straight from tileRegistry (the single source).
const HUE = Object.fromEntries(HOME_TILES.map((t) => [t.key, t.hue]))

/** hex (#RRGGBB) → rgba() string with alpha `a`. The wizard's ONLY color literal
 *  path — the module accent is inherently per-module and can't be a static token. */
export function hueRgba(hex, a = 1) {
  const h = String(hex || '#2563EB').replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

/** Hand off to Penny to draft a full strategic plan (server emits the
 *  draft_strategy_plan proposal → ProposalCard/DraftPlanProposalCard own it). */
export function handoffDraftPlan() {
  window.dispatchEvent(
    new CustomEvent('penny:ai-ask', {
      detail: {
        text: 'Draft a strategic plan for our school based on our current numbers, with pillars and measurable goals.',
      },
    }),
  )
}

// ── The 8 module configs ─────────────────────────────────────────────────────
export const wizardConfigs = {
  finance: {
    module: 'finance',
    hue: HUE.finance,
    options: [
      {
        key: 'tb',
        kind: 'embed',
        Icon: FileSpreadsheet,
        label: 'Trial balance',
        blurb:
          "Drop in your trial balance — the one list of every account and its balance. We turn it into your four statements automatically.",
        cta: 'Add trial balance',
        renderEmbed: (ctx, nav) => (
          <TrialBalanceModalBody
            school={ctx.school}
            hydratedFiles={ctx.hydratedFiles}
            activePeriod={ctx.activePeriod}
            hydrationToken={ctx.hydrationToken}
            canEdit={ctx.canEdit}
            onOpenMonthly={() => nav.goToOption('monthly')}
          />
        ),
      },
      {
        key: 'monthly',
        kind: 'embed',
        needsPeriod: true,
        Icon: CalendarClock,
        label: 'Monthly numbers',
        blurb:
          'Add a month-end trial balance for each month to power your month-by-month board report.',
        cta: 'Manage months',
        renderEmbed: (ctx) => (
          <MonthlyActualsPanel schoolId={ctx.schoolId} periodId={ctx.periodId} canEdit={ctx.canEdit} />
        ),
      },
      {
        key: 'budget',
        kind: 'embed',
        needsPeriod: true,
        Icon: Wallet,
        label: 'Budget',
        blurb: 'Import your budget so every report can show budget vs. actual.',
        cta: 'Set up budget',
        renderEmbed: (ctx) => (
          <BudgetSetup
            schoolId={ctx.schoolId}
            periodId={ctx.periodId}
            canEdit={ctx.canEdit}
            onSaved={ctx.onSaved}
          />
        ),
      },
      {
        key: 'qbo',
        kind: 'embed',
        external: true,
        Icon: Plug,
        label: 'QuickBooks',
        blurb:
          'Connect QuickBooks Online to sync your trial balance automatically — no more manual uploads.',
        cta: 'Connect QuickBooks',
        renderEmbed: (ctx) => <QboConnectEmbed schoolId={ctx.schoolId} periodId={ctx.periodId} />,
      },
    ],
  },

  enrollment: {
    module: 'enrollment',
    hue: HUE.enrollment,
    options: [
      {
        key: 'roster',
        kind: 'embed',
        Icon: Upload,
        label: 'Upload a roster',
        blurb:
          'Upload a roster file (OneRoster ZIP/CSV) to track headcount by grade and compare against plan.',
        cta: 'Upload roster file',
        renderEmbed: (ctx) => (
          <RosterUpload schoolId={ctx.schoolId} canEdit={ctx.canEdit} onApplied={ctx.onSaved} />
        ),
      },
      {
        key: 'connect',
        kind: 'embed',
        external: true,
        Icon: Plug,
        label: 'Connect your SIS',
        blurb:
          'Connect a student information system (Blackbaud, FACTS, Veracross, OneRoster) to pull enrollment on demand.',
        cta: 'Connect a system',
        renderEmbed: (ctx) => (
          <EnrollmentConnectEmbed schoolId={ctx.schoolId} canEdit={ctx.canEdit} onSaved={ctx.onSaved} />
        ),
      },
    ],
  },

  governance: {
    module: 'governance',
    hue: HUE.governance,
    options: [
      {
        key: 'policy',
        kind: 'modal',
        Icon: ScrollText,
        label: 'Board policy',
        blurb: 'Record a board policy — its category, owner, status and next review date.',
        cta: 'Add a policy',
        renderModal: (ctx, { onClose, markSaved }) => (
          <PolicyFormModal
            initial={null}
            reduce={ctx.reduce}
            onClose={onClose}
            onSave={async (body) => {
              await policiesApi.create(ctx.schoolId, body)
              markSaved()
            }}
          />
        ),
      },
    ],
  },

  accreditation: {
    module: 'accreditation',
    hue: HUE.accreditation,
    options: [
      {
        key: 'standard',
        kind: 'modal',
        Icon: ClipboardCheck,
        label: 'Standard',
        blurb: 'Add an accreditation standard to track its rating and gather evidence against it.',
        cta: 'Add a standard',
        renderModal: (ctx, { onClose, markSaved }) => (
          <StandardFormModal
            open
            initial={null}
            standards={[]}
            editingId={null}
            reduce={ctx.reduce}
            onClose={onClose}
            onSave={async (body) => {
              await accreditationApi.createStandard(ctx.schoolId, body)
              markSaved()
            }}
          />
        ),
      },
    ],
  },

  facilities: {
    module: 'facilities',
    hue: HUE.facilities,
    options: [
      {
        key: 'maintenance',
        kind: 'modal',
        Icon: Wrench,
        label: 'Maintenance item',
        blurb: 'Log a maintenance or capital item — its category, cadence, and expected cost.',
        cta: 'Add maintenance',
        renderModal: (ctx, { onClose, markSaved }) => (
          <MaintenanceFormModal
            open
            initial={null}
            reduce={ctx.reduce}
            onClose={onClose}
            onSave={async (body) => {
              await facilitiesApi.createMaintenance(ctx.schoolId, body)
              markSaved()
            }}
          />
        ),
      },
    ],
  },

  advancement: {
    module: 'advancement',
    hue: HUE.advancement,
    options: [
      {
        key: 'campaign',
        kind: 'modal',
        Icon: HeartHandshake,
        label: 'Campaign',
        blurb: 'Start a fundraising campaign — its goal, timeframe and status. Log gifts against it later.',
        cta: 'Add a campaign',
        renderModal: (ctx, { onClose, markSaved }) => (
          <CampaignFormModal
            initial={null}
            reduce={ctx.reduce}
            onClose={onClose}
            onSave={async (body) => {
              await advancementApi.createCampaign(ctx.schoolId, body)
              markSaved()
            }}
          />
        ),
      },
    ],
  },

  strategy: {
    module: 'strategy',
    hue: HUE.strategy,
    options: [
      {
        key: 'penny-draft',
        kind: 'handoff',
        Icon: Sparkles,
        label: 'Let Penny draft it',
        blurb:
          'Hand it to Penny — she reads your live numbers and drafts a full plan with pillars and measurable goals for you to review.',
        cta: 'Draft with Penny',
        onHandoff: handoffDraftPlan,
        handoffNote:
          "Penny is drafting your plan — review it in the chat and apply what you like. You can add or edit goals here anytime.",
      },
      {
        key: 'manual-goal',
        kind: 'modal',
        Icon: Flag,
        label: 'Add a goal yourself',
        blurb:
          'Write a measurable goal by hand — pick a live metric to track it against, or check off milestones.',
        cta: 'Add a goal',
        renderModal: (ctx, { onClose, markSaved }) => (
          <WizardStrategyGoal
            schoolId={ctx.schoolId}
            reduce={ctx.reduce}
            onClose={onClose}
            markSaved={markSaved}
          />
        ),
      },
    ],
  },

  // Page-less today (no /hr route) — SHIPPED but inert; nothing mounts it until HR
  // gets a page. staff-counts reuses the operational panel (per-student ratios).
  hr: {
    module: 'hr',
    hue: HUE.hr,
    options: [
      {
        key: 'staff-counts',
        kind: 'embed',
        needsPeriod: true,
        Icon: Users,
        label: 'Staffing & enrollment',
        blurb: 'Enter enrollment, aid and staffing so we can compute per-student costs and key ratios.',
        cta: 'Enter the numbers',
        renderEmbed: (ctx) => (
          <OperationalDataPanel
            schoolId={ctx.schoolId}
            periodId={ctx.periodId}
            periodLabel={ctx.periodLabel}
            canEdit={ctx.canEdit}
            onSaved={ctx.onSaved}
          />
        ),
      },
    ],
  },
}

/** Config for a module key, or null (AddDataTab renders its own teach state). */
export function wizardConfigFor(module) {
  return wizardConfigs[module] || null
}

/** Friendly module label for headings (always via tileRegistry/MODULE_META). */
export function wizardModuleLabel(module) {
  return tileLabel(module)
}
