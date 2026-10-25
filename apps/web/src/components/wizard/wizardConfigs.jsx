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
// Optional config `title` names the wizard's PageHeader (default: "Get your X
// numbers in" for finance/enrollment, "Add X records" elsewhere). An embed
// option with `flush: true` mounts without the panel-body inset (the importer
// brings its own padding).
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
  BookOpen,
  ShieldCheck,
} from 'lucide-react'

import { HOME_TILES, tileLabel } from '../home/tileRegistry.jsx'

import TrialBalanceModalBody from '../datahub/TrialBalanceModalBody.jsx'
import FinanceUploadSorter from '../finance/FinanceUploadSorter.jsx'
import GovernanceImport from '../governance/GovernanceImport.jsx'
import RecordsImport from '../imports/RecordsImport.jsx'
import MonthlyActualsPanel from '../monthly/MonthlyActualsPanel.jsx'
import BudgetSetup from '../budget/BudgetSetup.jsx'
import RosterUpload from '../enrollment/RosterUpload.jsx'
import StudentImport from '../enrollment/StudentImport.jsx'
import { EnrollmentConnectEmbed } from './wizardEmbeds.jsx'
import WizardStrategyGoal from './WizardStrategyGoal.jsx'

// The multi-step multi-item record flows (kind:'flow'). The page *FormModal
// exports stay untouched — they remain the EDIT path on the register tabs.
import { recordFlows } from '../recordwizard/recordFlows.jsx'
import AssessmentUpload from '../academics/AssessmentUpload.jsx'
import GradebookUpload from '../academics/GradebookUpload.jsx'
import AcademicsSisCard from '../academics/AcademicsSisCard.jsx'

// Per-module hue lookup — read straight from tileRegistry (the single source).
const HUE = Object.fromEntries(HOME_TILES.map((t) => [t.key, t.hue]))

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
    // Every "Done" in Finance's add-data flow lands on the FULL overview (the
    // band, figures and warnings) — never the Records tab's Workspaces doors.
    finishTo: 'overview',
    // Finance → Add data opens on the upload sorter (#43): drop any financial
    // file and it lands on the right tile below with the file already loaded.
    defaultOption: 'upload',
    options: [
      {
        key: 'upload',
        kind: 'embed',
        Icon: Upload,
        label: 'Upload your financial files',
        blurb:
          'Drop your QuickBooks exports or spreadsheets — trial balance, Profit and Loss, Balance Sheet, month-end numbers, budget — and we figure out what each one is.',
        cta: 'Upload files',
        ownFinish: true,
        renderEmbed: (ctx, nav) => (
          <FinanceUploadSorter schoolId={ctx.schoolId} canEdit={ctx.canEdit} goToOption={nav.goToOption} />
        ),
      },
      {
        key: 'tb',
        kind: 'embed',
        // TrialBalanceModalBody carries its own px-5 + hairline sections, so the
        // wizard mounts it flush (no second panel-body inset around it).
        flush: true,
        Icon: FileSpreadsheet,
        label: 'Trial balance',
        blurb:
          'Your trial balance, or the Profit & Loss and Balance Sheet exported from QuickBooks — or connect QuickBooks to sync it automatically. We turn it into your four statements.',
        cta: 'Add trial balance',
        // The step ends ITSELF in one "Done — show my numbers" bar (inside the
        // intake, which knows whether the files are saved and sorted) that goes
        // straight to the overview: no wizard footer, no Step 3 screen.
        ownFinish: true,
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
            // ONE finish. The old path ended in four places — a "Does this look
            // right?" band (two buttons), a footer "I'm done", then a Step 3
            // "That's saved" screen whose "Done" opened the Workspaces tab. Now:
            // the period just saved becomes the overview's year, the figures
            // reload, and the full overview opens. The celebration stays one
            // click away there ("What changed").
            // `periodId` comes from a save made AT finish time (the retry of a
            // failed autosave); otherwise the period the intake just saved is
            // ctx.activePeriod (the autosave already re-rendered this).
            onFinish={(info) => {
              ctx.onFinished?.(info?.periodId ?? ctx.activePeriod?.id ?? null)
              nav.finishToOverview()
            }}
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
      // The one-by-one "Students" tile was removed (#45): a roster is a file, and
      // the register keeps its own Add button for the odd late arrival.
      {
        key: 'import-students',
        kind: 'embed',
        Icon: FileSpreadsheet,
        label: 'Import students with a review step',
        // THESE TWO CARDS ANSWER A PRODUCTION REPORT, TWICE OVER.
        //
        // First round: both accepted "a OneRoster CSV" and neither said which
        // one KEPT the students. A head of school picked the upload, saw
        // "Imported 436 students", found Records empty, and concluded the app
        // had lost their data. The cards were relabelled records-vs-headcount.
        //
        // That was honest and still wrong: the file they uploaded IS the roster,
        // and the split it described was between OUR TWO PARSERS, not between
        // two things a school wants. The upload now creates records too, so the
        // only real remaining difference is one-step vs reviewed — which is what
        // each card leads with. Anything here that still promises records are
        // NOT created is false; roster-upload-copy.spec.jsx fails on it.
        // SELF-CONTAINED ON PURPOSE. This card renders ABOVE the one-step upload,
        // so a blurb opening "same … as the other one" defined itself by a card
        // the reader had not reached yet — reintroducing, at the moment of
        // choosing, the very ambiguity between the two cards that caused the
        // report. It now names the thing itself: the same roster file.
        blurb:
          'Any Excel or CSV student list — we match your column names. Preview every row — new, updated, unchanged, skipped — fix what you need, then choose merge or replace. Saves the students and sets the current period’s enrollment. Up to 2,000 students per file. Best when you are not sure the file is clean.',
        cta: 'Preview and import',
        renderEmbed: (ctx) => (
          <StudentImport schoolId={ctx.schoolId} canEdit={ctx.canEdit} onApplied={ctx.onSaved} />
        ),
      },
      {
        key: 'roster',
        kind: 'embed',
        Icon: Upload,
        label: 'Upload a roster file',
        blurb:
          'Drop any Excel or CSV student list (or a OneRoster ZIP) and we do the whole job in one step — a student record for every row, plus the enrollment count by grade for the period the file is dated to. Re-uploads add and update; nothing is removed unless you choose Replace. Records are created for files of up to 10,000 students; above that the count still lands. Best when the file is already correct.',
        cta: 'Upload roster file',
        renderEmbed: (ctx) => (
          <RosterUpload
            schoolId={ctx.schoolId}
            canEdit={ctx.canEdit}
            onApplied={ctx.onSaved}
            /* The period the user is LOOKING AT, so the panel can say when the
               file landed in a different fiscal year. AddDataTab already resolves
               it into ctx; without it the mismatch is invisible. */
            activePeriodLabel={ctx.periodLabel}
            /* The school's fiscal years, so the form can ASK which one this
               roster counts for instead of deriving it from today's date. */
            periods={ctx.periods}
          />
        ),
      },
      {
        key: 'connect',
        kind: 'embed',
        external: true,
        Icon: Plug,
        label: 'Connect your SIS',
        blurb:
          'Connect Blackbaud SKY to pull enrollment on demand. More SIS connections are coming soon; a roster file works today.',
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
      // #46 — the roster and the committee list as FILES, first; the forms stay.
      {
        key: 'import-people',
        kind: 'embed',
        Icon: Upload,
        label: 'Upload a board roster',
        blurb:
          'A board roster, finance-team or staff list as Excel or CSV — any column names. People already on file are updated; the rest are added.',
        cta: 'Upload people',
        renderEmbed: (ctx) => (
          <GovernanceImport schoolId={ctx.schoolId} canEdit={ctx.canEdit} kind="people" defaultGroup="board" onApplied={ctx.onSaved} />
        ),
      },
      {
        key: 'import-committees',
        kind: 'embed',
        Icon: FileSpreadsheet,
        label: 'Upload a committee list',
        blurb:
          'Committees and who sits on them, as Excel or CSV — one row per member, or one row per committee with a Members cell. Missing committees and people are created.',
        cta: 'Upload committees',
        renderEmbed: (ctx) => (
          <GovernanceImport schoolId={ctx.schoolId} canEdit={ctx.canEdit} kind="committees" onApplied={ctx.onSaved} />
        ),
      },
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
      // #51 — the list as a FILE, first; the forms stay.
      {
        key: 'import-standards',
        kind: 'embed',
        Icon: Upload,
        label: 'Upload your standards',
        blurb:
          'Your accreditor’s standards or indicators as Excel or CSV — Code, Standard, Domain, Rating, Owner… any column names. Standards already on file (same code) are updated.',
        cta: 'Upload standards',
        renderEmbed: (ctx) => <RecordsImport schoolId={ctx.schoolId} canEdit={ctx.canEdit} target="standards" onApplied={ctx.onSaved} />,
      },

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
      // #51 — the list as a FILE, first; the forms stay.
      {
        key: 'import-maintenance',
        kind: 'embed',
        Icon: Upload,
        label: 'Upload a maintenance or asset list',
        blurb:
          'Your maintenance log or asset list as Excel or CSV — Item, Location, Due date, Vendor, Cost, Status… any column names.',
        cta: 'Upload list',
        renderEmbed: (ctx) => <RecordsImport schoolId={ctx.schoolId} canEdit={ctx.canEdit} target="maintenance" onApplied={ctx.onSaved} />,
      },

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
      // #51 — the list as a FILE, first; the forms stay.
      {
        key: 'import-gifts',
        kind: 'embed',
        Icon: Upload,
        label: 'Upload gifts and pledges',
        blurb:
          'A gift or pledge export as Excel or CSV — Donor, Date, Amount, Campaign, Type… any column names. Campaigns named in the file are created if missing.',
        cta: 'Upload gifts',
        renderEmbed: (ctx) => <RecordsImport schoolId={ctx.schoolId} canEdit={ctx.canEdit} target="gifts" onApplied={ctx.onSaved} />,
      },
      {
        key: 'import-campaigns',
        kind: 'embed',
        Icon: FileSpreadsheet,
        label: 'Upload a campaign list',
        blurb:
          'Your campaigns as Excel or CSV — Campaign, Goal, Raised, Fiscal year, Start, End, Status… any column names.',
        cta: 'Upload campaigns',
        renderEmbed: (ctx) => <RecordsImport schoolId={ctx.schoolId} canEdit={ctx.canEdit} target="campaigns" onApplied={ctx.onSaved} />,
      },

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

  academics: {
    // `module` is not optional: AddDataWizard resolves its heading, its aria
    // label and its back button from it, and without it the sole-option path
    // rendered a literal "Back to undefined overview".
    module: 'academics',
    title: 'Add results, marks and plans',
    hue: HUE.academics,
    options: [
      {
        key: 'assessment-file',
        kind: 'embed',
        Icon: FileSpreadsheet,
        label: 'Assessment results',
        blurb:
          'A network summary, a publisher export, or a student-level file. Title rows and odd column names are handled, and you see exactly what was read before anything saves.',
        cta: 'Upload results',
        // Both uploaders return null for a viewer, so without this the option
        // is offered to every role and the work panel comes up blank.
        requiresEdit: true,
        renderEmbed: (ctx) => (
          <AssessmentUpload schoolId={ctx.schoolId} canEdit={ctx.canEdit} onDone={ctx.onSaved} />
        ),
      },
      {
        key: 'gradebook-file',
        kind: 'embed',
        Icon: GraduationCap,
        label: 'Course marks',
        blurb:
          'A gradebook export — one row per mark, or one row per student with a column per course. Letter grades are converted and the letter is kept.',
        cta: 'Upload gradebook',
        requiresEdit: true,
        renderEmbed: (ctx) => (
          <GradebookUpload schoolId={ctx.schoolId} canEdit={ctx.canEdit} onDone={ctx.onSaved} />
        ),
      },
      {
        key: 'lesson-plan',
        kind: 'flow',
        Icon: BookOpen,
        label: 'Lesson plan',
        blurb: 'Add a plan to the classroom register — subject, grade, week and status.',
        cta: 'Add lesson plan',
        flow: recordFlows['academics.lessonPlan'],
      },
      {
        key: 'connect',
        kind: 'embed',
        external: true,
        Icon: Plug,
        label: 'Connect your SIS',
        blurb:
          'Academics reads the connection you already made under Enrollment rather than asking for a second set of credentials.',
        cta: 'See the connection',
        renderEmbed: (ctx) => <AcademicsSisCard schoolId={ctx.schoolId} />,
      },
    ],
  },

  strategy: {
    module: 'strategy',
    title: 'Build your strategic plan',
    hue: HUE.strategy,
    options: [
      {
        key: 'penny-draft',
        kind: 'handoff',
        Icon: Sparkles,
        label: 'Let KYRO draft it',
        blurb:
          'Hand it to KYRO — it reads your live numbers and drafts a full plan with pillars and measurable goals for you to review.',
        cta: 'Draft with KYRO',
        onHandoff: handoffDraftPlan,
        handoffNote:
          "KYRO is drafting your plan — review it in the chat and apply what you like. You can add or edit goals here anytime.",
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
    title: 'Add staffing and people records',
    hue: HUE.hr,
    options: [
      // #51 — the list as a FILE, first; the forms stay.
      {
        key: 'import-staff',
        kind: 'embed',
        Icon: Upload,
        label: 'Upload a staff list',
        blurb:
          'Your staff list as Excel or CSV — Name, Title, Email, Start date… any column names. People already on file are updated; the rest join the staff group.',
        cta: 'Upload staff',
        renderEmbed: (ctx) => <RecordsImport schoolId={ctx.schoolId} canEdit={ctx.canEdit} target="staff" onApplied={ctx.onSaved} />,
      },

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
      // AIC Phase K. Listed here for the reason the comment above records: Phase F
      // shipped a flow that was written, gated and DTO-correct — and unreachable,
      // because nothing listed it. These two close the last two visible holes in
      // the twin, so a school that cannot find them keeps two rules reporting
      // "not evaluated" forever while holding the very data that would answer them.
      {
        key: 'clearance',
        kind: 'flow',
        Icon: ShieldCheck,
        label: 'Safe-environment clearances',
        blurb:
          'Record a background check or safe-environment training against someone on your people register. Only your school sees who — the early warning counts, and never names anyone.',
        cta: 'Add clearances',
        flow: recordFlows['hr.clearance'],
      },
      {
        key: 'professional-development',
        kind: 'flow',
        Icon: GraduationCap,
        label: 'Professional development',
        blurb:
          'Record what your staff attended. Participation is counted per person over twelve months — never inferred from what it cost.',
        cta: 'Add PD records',
        flow: recordFlows['hr.professionalDevelopment'],
      },
    ],
  },

  // Phase 6 — Planning & Forecasting (/planning). The grade-by-grade enrollment
  // plan writer (plan source (2) for enrollment_vs_plan); the forecast workspace
  // itself lives on the module page's Overview.
  planning: {
    module: 'planning',
    title: 'Set your enrollment plan',
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
