// ─────────────────────────────────────────────────────────────────────────────
// wizardConfigs.js — the config that DRIVES the per-module "Add data" wizard.
//
// ONE reusable Choose → Enter/Upload → Confirm shell (AddDataWizard) is fed by
// these 9 module configs. The wizard is CHROME: it never reimplements an importer
// or a form. Each option is one of four kinds:
//   • 'embed'   — mount an existing importer/panel UNCHANGED (its own applied UI
//                 IS the Confirm). renderEmbed(ctx, nav) returns the element.
//   • 'flow'    — mount the multi-step multi-item RecordFlow INSIDE the work step,
//                 driven by a FlowDef from recordFlows.jsx (`flow` field). This is
//                 the ADD path for module records; the page *FormModals remain the
//                 EDIT path on the register tabs.
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
//   • accreditation EVIDENCE has no standalone exported *FormModal (page-private
//     inline form bound to a parent standard) and stays omitted here (added from
//     Records). Advancement GIFT is now covered by the 'gift' RecordFlow (nested
//     create under a campaign, campaign-gated).
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
  UserRound,
  Gift,
  GraduationCap,
} from 'lucide-react'

import { HOME_TILES, tileLabel } from '../home/tileRegistry.jsx'

import TrialBalanceModalBody from '../datahub/TrialBalanceModalBody.jsx'
import MonthlyActualsPanel from '../monthly/MonthlyActualsPanel.jsx'
import BudgetSetup from '../budget/BudgetSetup.jsx'
import RosterUpload from '../enrollment/RosterUpload.jsx'
import StudentImport from '../enrollment/StudentImport.jsx'
import { EnrollmentConnectEmbed } from './wizardEmbeds.jsx'
import WizardStrategyGoal from './WizardStrategyGoal.jsx'

// The multi-step multi-item record flows (kind:'flow'). The page *FormModal
// exports stay untouched — they remain the EDIT path on the register tabs.
import { recordFlows } from '../recordwizard/recordFlows.jsx'

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

// ── The 9 module configs ─────────────────────────────────────────────────────
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
          'Drop in your trial balance — or connect QuickBooks to sync it automatically. We turn it into your four statements.',
        cta: 'Add trial balance',
        renderEmbed: (ctx, nav) => (
          <TrialBalanceModalBody
            school={ctx.school}
            hydratedFiles={ctx.hydratedFiles}
            activePeriod={ctx.activePeriod}
            hydrationToken={ctx.hydrationToken}
            canEdit={ctx.canEdit}
            onOpenMonthly={() => nav.goToOption('monthly')}
            // AIC Phase E — `/finance?tab=add&add=tb&intake=bulk` lands on the
            // multi-year uploader. This is the v2 path the accreditation "Add
            // years" CTA actually reaches; without it the CTA opened the
            // single-period intake and the ask silently did nothing.
            initialTab={ctx.intake}
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
      // QuickBooks is NOT a separate option — connecting QBO syncs the trial
      // balance, so it lives as a tab INSIDE the Trial balance flow
      // (TrialBalanceModalBody) alongside the manual upload.
    ],
  },

  enrollment: {
    module: 'enrollment',
    hue: HUE.enrollment,
    options: [
      // Phase 5 — student-level roster (the Records-tab register's ADD paths).
      {
        key: 'students',
        kind: 'flow',
        Icon: GraduationCap,
        label: 'Students',
        blurb:
          'Add students to your roster one by one — name, grade, status and support flags. The register and analytics update live.',
        cta: 'Add students',
        flow: recordFlows['enrollment.student'],
      },
      {
        key: 'import-students',
        kind: 'embed',
        Icon: FileSpreadsheet,
        label: 'Import roster CSV',
        blurb:
          'Bring your whole roster in from a CSV — OneRoster users.csv or a simple student list. Preview every row, then merge or replace.',
        cta: 'Import students',
        renderEmbed: (ctx) => (
          <StudentImport schoolId={ctx.schoolId} canEdit={ctx.canEdit} onApplied={ctx.onSaved} />
        ),
      },
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
        key: 'person',
        kind: 'flow',
        Icon: UserRound,
        label: 'Board & finance people',
        blurb:
          'Add your board members and finance team — their titles, terms and groups. Credentials attach from their profile.',
        cta: 'Add people',
        flow: recordFlows['governance.person'],
      },
      {
        key: 'policy',
        kind: 'flow',
        Icon: ScrollText,
        label: 'Board policy',
        blurb: 'Record a board policy — its category, owner, status and next review date.',
        cta: 'Add policies',
        flow: recordFlows['governance.policy'],
      },
      {
        key: 'committee',
        kind: 'flow',
        Icon: Users,
        label: 'Committee',
        blurb: 'Add a board or standing committee — its chair, remit and status.',
        cta: 'Add committees',
        flow: recordFlows['governance.committee'],
      },
      {
        key: 'meeting',
        kind: 'flow',
        Icon: CalendarClock,
        label: 'Board meeting',
        blurb: 'Log a board or committee meeting — agenda, minutes and decisions.',
        cta: 'Add meetings',
        flow: recordFlows['governance.meeting'],
      },
    ],
  },

  accreditation: {
    module: 'accreditation',
    hue: HUE.accreditation,
    options: [
      {
        key: 'standard',
        kind: 'flow',
        Icon: ClipboardCheck,
        label: 'Standard',
        blurb: 'Add an accreditation standard to track its rating and gather evidence against it.',
        cta: 'Add standards',
        flow: recordFlows['accreditation.standard'],
      },
    ],
  },

  facilities: {
    module: 'facilities',
    hue: HUE.facilities,
    options: [
      {
        key: 'maintenance',
        kind: 'flow',
        Icon: Wrench,
        label: 'Maintenance item',
        blurb: 'Log a maintenance or capital item — its category, cadence, and expected cost.',
        cta: 'Add maintenance',
        flow: recordFlows['facilities.maintenance'],
      },
    ],
  },

  advancement: {
    module: 'advancement',
    hue: HUE.advancement,
    options: [
      {
        key: 'campaign',
        kind: 'flow',
        Icon: HeartHandshake,
        label: 'Campaign',
        blurb: 'Start a fundraising campaign — its goal, timeframe and status. Log gifts against it later.',
        cta: 'Add campaigns',
        flow: recordFlows['advancement.campaign'],
      },
      {
        key: 'gift',
        kind: 'flow',
        Icon: Gift,
        label: 'Gift or pledge',
        blurb: 'Record gifts and pledges against a campaign — amounts only, never donor names.',
        cta: 'Add gifts',
        flow: recordFlows['advancement.gift'],
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

  // Phase 6 — HR & Staffing (/hr). The staffing RecordFlow writes the operational
  // row (partial PUT — teaching/total FTE + notes only, never enrollment/aid); the
  // Data hub's OperationalDataPanel keeps owning the full operational intake,
  // untouched. AIC Phase F added the second option, the staff-evaluation register.
  hr: {
    module: 'hr',
    hue: HUE.hr,
    options: [
      {
        key: 'staffing',
        kind: 'flow',
        needsPeriod: true,
        Icon: Users,
        label: 'Staffing FTEs',
        blurb:
          'Enter this period’s teaching and total staff FTEs — they power the student-teacher ratio and your staffing mix.',
        cta: 'Enter staffing',
        flow: recordFlows['hr.staffing'],
      },
      // AIC Phase F. Without this the flow was written, gated, DTO-correct — and
      // unreachable: /hr's prominent "Add data" CTA listed only "Staffing FTEs",
      // so a user arriving from the Evidence Index's "Where this lives: HR" prompt
      // landed on a ratio chart with no visible way to record what they were sent
      // to record. (The "+ New" button only appears after switching the register
      // tab away from its default.) School-scoped, so NO `needsPeriod`.
      {
        key: 'staff-evaluation',
        kind: 'flow',
        Icon: ClipboardCheck,
        label: 'Staff evaluations',
        blurb:
          'Record an evaluation cycle against someone on your people register — and the accreditation evidence for it answers itself once you date the completion.',
        cta: 'Add evaluations',
        flow: recordFlows['hr.staffEvaluation'],
      },
    ],
  },

  // Phase 6 — Planning & Forecasting (/planning). The grade-by-grade enrollment
  // plan writer (plan source (2) for enrollment_vs_plan); the forecast workspace
  // itself lives on the module page's Overview.
  planning: {
    module: 'planning',
    hue: HUE.planning,
    options: [
      {
        key: 'enrollment-plan',
        kind: 'flow',
        needsPeriod: true,
        Icon: GraduationCap,
        label: 'Enrollment plan',
        blurb:
          'Plan next year grade by grade — the total powers actual-vs-plan even without a driver budget.',
        cta: 'Set the plan',
        flow: recordFlows['planning.enrollment_plan'],
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
