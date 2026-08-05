// ─────────────────────────────────────────────────────────────────────────────
// recordFlows.jsx — the 7 FlowDef configs that drive RecordFlow (kind:'flow'
// options in the Add-data wizard). Pure config: NO hooks, NO styling — the
// recordwizard framework (RecordFlow/FlowField/FlowReview…) owns all rendering.
//
// PAYLOAD CONTRACT (highest risk): the API runs a global forbidNonWhitelisted
// ValidationPipe — ANY unexpected body key 400s. Every toBody below is built
// key-by-key (never a spread of values) and mirrors the page modals' body
// builders VERBATIM, each verified against its create DTO in apps/api/src.
// Enum constants are re-declared locally, each commented with its DTO path
// (the DTO is the authority).
//
// defaults = the page EMPTY_* objects verbatim (they are page-private, so they
// are copied, not imported — the modals stay untouched for the EDIT path).
// Loaders are plain promise factories resolving to FINAL values (api.js returns
// axios responses, so each .then(r => r.data) lives here in the config).
// ─────────────────────────────────────────────────────────────────────────────
import {
  ScrollText,
  Users,
  UserRound,
  CalendarClock,
  ClipboardCheck,
  Wrench,
  HeartHandshake,
  Gift,
  GraduationCap,
  ShieldCheck,
} from 'lucide-react'

import {
  policiesApi,
  committeesApi,
  meetingsApi,
  governancePeopleApi,
  accreditationApi,
  facilitiesApi,
  advancementApi,
  enrollmentApi,
  analyticsApi,
  hrApi,
} from '../../lib/api.js'
// AIC Phase F — the WEB-side display authority for MaintenanceItem.complianceKind
// and for StaffEvaluation's status vocabulary. Imported rather than re-declared:
// each is already a documented hard-copy of its DTO array, and a third copy would
// be a third thing to keep in step.
import {
  COMPLIANCE_KIND_OPTIONS,
  complianceKindLabel,
} from '../facilities/complianceKindMeta.js'
import {
  STAFF_EVALUATION_STATUSES,
  statusLabel as staffEvaluationStatusLabel,
} from '../hr/staffEvaluationMeta.js'
// AIC Phase K — the same discipline for the two new HR registers.
import {
  CLEARANCE_KINDS,
  PD_CATEGORIES,
  clearanceKindLabel,
  pdCategoryLabel,
} from '../hr/clearanceMeta.js'
// Grade vocab for the planning enrollment-plan grid — the DRIVER grade row
// (PK3…12), which is exactly the EnrollmentByGradeDto whitelist.
import { GRADE_ROW, GRADE_LABELS as DRIVER_GRADE_LABELS } from '../budget/driverModel.js'
import {
  GRADE_KEYS,
  STUDENT_STATUS_KEYS,
  STUDENT_STATUS_LABELS,
  GENDER_KEYS,
  GENDER_LABELS,
  RACE_KEYS,
  RACE_LABELS,
  ETHNICITY_KEYS,
  ETHNICITY_LABELS,
} from '../../lib/demographicVocab.js'

// ── Enum sets (LOCAL mirrors — the DTO files are the source of truth) ─────────
// apps/api/src/governance/dto/create-policy.dto.ts (POLICY_STATUSES)
const POLICY_STATUSES = ['active', 'draft', 'retired']
// GovernancePage COMMITTEE_KINDS — DTO (create-committee.dto.ts) keeps `kind`
// free text (@MaxLength 80, no @IsIn); the select is a UX nicety, not a gate.
const COMMITTEE_KINDS = ['board', 'finance', 'governance', 'advancement', 'academic', 'other']
// apps/api/src/governance/dto/create-meeting.dto.ts (MEETING_STATUSES / MINUTES_STATUSES)
const MEETING_STATUSES = ['scheduled', 'held', 'cancelled']
const MINUTES_STATUSES = ['none', 'draft', 'pending_approval', 'approved']
// @finrep/compliance STANDARD_RATINGS via apps/api/src/accreditation/dto/create-standard.dto.ts
const STANDARD_RATINGS = ['not_started', 'not_met', 'partially_met', 'met']
// apps/api/src/facilities/dto/create-maintenance.dto.ts
const MAINTENANCE_PRIORITIES = ['low', 'medium', 'high', 'critical']
const MAINTENANCE_STATUSES = ['open', 'scheduled', 'in_progress', 'resolved']
const MAINTENANCE_RECURRENCES = ['none', 'weekly', 'monthly', 'quarterly', 'annual']
// apps/api/src/advancement/dto/create-campaign.dto.ts (CAMPAIGN_STATUSES);
// campaignType is free text in the DTO — the closed select mirrors the page modal.
const CAMPAIGN_TYPES = ['annual_fund', 'capital', 'other']
const CAMPAIGN_STATUSES = ['planned', 'active', 'closed']
// apps/api/src/advancement/dto/create-gift.dto.ts (GIFT_KINDS; status is NEVER
// client-sent — the service derives it from kind/amount/receivedAmount).
const GIFT_KINDS = ['gift', 'pledge']

// ── Tiny display helpers (labels only — never used to build payloads) ─────────
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
/** 'pending_approval' → 'Pending approval', 'annual_fund' → 'Annual fund'. */
const human = (s) => cap(String(s ?? '').replace(/_/g, ' '))
const opt = (arr) => arr.map((v) => ({ value: v, label: human(v) }))
const orDash = (v) => (v && String(v).trim() ? String(v).trim() : '—')
const moneyDash = (v) => {
  const t = String(v ?? '').trim()
  return t === '' || Number.isNaN(Number(t)) ? '—' : `$${Number(t).toLocaleString()}`
}
/** Review-row label for a select value via its options list. */
const pick = (options, v) => options.find((o) => o.value === v)?.label ?? orDash(v)

// Grade labels for the enrollment.student flow (PK3/PK4/K read as-is; numerics
// read 'Grade N'). Vocab mirrors @finrep/analytics via lib/demographicVocab.
const gradeOpt = GRADE_KEYS.map((g) => ({
  value: g,
  label: /^\d+$/.test(g) ? `Grade ${g}` : g,
}))
const keyedOpt = (keys, labels) => keys.map((k) => ({ value: k, label: labels[k] ?? k }))

export const recordFlows = {
  // ══════════════════════ ENROLLMENT · STUDENT (Phase 5 roster) ══════════════
  // The school's own roster record — DATA-MINIMAL by FERPA design (no address/
  // phone/medical text; support needs are coarse booleans). Optional empties are
  // OMITTED from the body (CreateStudentDto is @IsOptional-per-field); the three
  // flags are always sent as REAL booleans (@IsBoolean).
  'enrollment.student': {
    key: 'enrollment.student',
    noun: 'student',
    nounPlural: 'students',
    Icon: GraduationCap,
    defaults: {
      firstName: '',
      lastName: '',
      grade: 'K',
      birthDate: '',
      gender: '',
      race: '',
      ethnicity: '',
      status: 'enrolled',
      enrolledOn: '',
      withdrawnOn: '',
      hasIep: false,
      has504: false,
      ell: false,
      notes: '',
      externalId: '',
    },
    steps: [
      {
        key: 'identity',
        label: 'Identity',
        title: 'First, who they are',
        blurb: 'Their name and grade — a birth date if you have it.',
        fields: [
          {
            key: 'firstName',
            label: 'First name',
            type: 'text',
            required: true,
            requiredMsg: 'Give them a first name',
            maxLength: 120,
            placeholder: 'e.g. Maria',
          },
          {
            key: 'lastName',
            label: 'Last name',
            type: 'text',
            required: true,
            requiredMsg: 'Give them a last name',
            maxLength: 120,
            placeholder: 'e.g. Alvarez',
          },
          { key: 'grade', label: 'Grade', type: 'select', options: gradeOpt },
          {
            key: 'birthDate',
            label: 'Birth date',
            type: 'date',
            hint: 'Age is always derived — never stored.',
          },
        ],
      },
      {
        key: 'demographics',
        label: 'Demographics',
        title: 'Demographics (optional)',
        optional: true,
        blurb: 'Feeds the aggregate mix analytics only. Leave anything as "Prefer not to record".',
        fields: [
          {
            key: 'gender',
            label: 'Gender',
            type: 'select',
            emptyOptionLabel: 'Prefer not to record',
            options: keyedOpt(GENDER_KEYS, GENDER_LABELS),
          },
          {
            key: 'race',
            label: 'Race',
            type: 'select',
            emptyOptionLabel: 'Prefer not to record',
            options: keyedOpt(RACE_KEYS, RACE_LABELS),
          },
          {
            key: 'ethnicity',
            label: 'Ethnicity',
            type: 'select',
            emptyOptionLabel: 'Prefer not to record',
            options: keyedOpt(ETHNICITY_KEYS, ETHNICITY_LABELS),
          },
        ],
      },
      {
        key: 'status',
        label: 'Status',
        title: 'Status & support',
        optional: true,
        blurb: 'Everything here is optional — status defaults to Enrolled.',
        fields: [
          {
            key: 'status',
            label: 'Status',
            type: 'select',
            options: keyedOpt(STUDENT_STATUS_KEYS, STUDENT_STATUS_LABELS),
          },
          { key: 'enrolledOn', label: 'Enrolled on', type: 'date' },
          {
            key: 'withdrawnOn',
            label: 'Withdrawn on',
            type: 'date',
            hint: 'Needs status Withdrawn or Graduated.',
            validate: (raw, v) =>
              raw && !['withdrawn', 'graduated'].includes(v.status)
                ? 'Set status to Withdrawn or Graduated when a withdrawal date is set'
                : null,
          },
          { key: 'hasIep', label: 'IEP', type: 'checkbox', placeholder: 'Has an IEP' },
          { key: 'has504', label: '504 plan', type: 'checkbox', placeholder: 'Has a 504 plan' },
          { key: 'ell', label: 'ELL', type: 'checkbox', placeholder: 'English language learner' },
          {
            key: 'notes',
            label: 'Notes',
            type: 'textarea',
            rows: 3,
            maxLength: 2000,
            span: 2,
            fold: true,
            hint: 'Operational notes only — do not record medical or diagnostic details.',
          },
          {
            key: 'externalId',
            label: 'SIS id',
            type: 'text',
            maxLength: 120,
            fold: true,
            hint: 'Matches CSV re-imports to this record.',
          },
        ],
      },
    ],
    // CreateStudentDto ✓ — names/grade/status + REAL booleans always; optional
    // empties OMITTED (never '' — @IsIn/@IsDateString would 400 on '').
    toBody: (v) => {
      const body = {
        firstName: v.firstName.trim(),
        lastName: v.lastName.trim(),
        grade: v.grade,
        status: v.status || 'enrolled',
        hasIep: !!v.hasIep,
        has504: !!v.has504,
        ell: !!v.ell,
      }
      if (v.birthDate) body.birthDate = v.birthDate
      if (v.gender) body.gender = v.gender
      if (v.race) body.race = v.race
      if (v.ethnicity) body.ethnicity = v.ethnicity
      if (v.enrolledOn) body.enrolledOn = v.enrolledOn
      if (v.withdrawnOn) body.withdrawnOn = v.withdrawnOn
      if (v.notes.trim()) body.notes = v.notes.trim()
      if (v.externalId.trim()) body.externalId = v.externalId.trim()
      return body
    },
    submit: (ctx, body) => enrollmentApi.students.create(ctx.schoolId, body),
    // Basket confirm goes through the transactional POST /students/batch (frozen
    // spec): all-or-nothing, ONE audit row, ONE roster-snapshot sync. `submit`
    // stays as the schema-required per-item fallback.
    submitAll: (ctx, bodies) => enrollmentApi.students.batch(ctx.schoolId, bodies),
    itemLabel: (v) => `${v.firstName.trim()} ${v.lastName.trim()}`.trim(),
    itemSub: (v) => {
      const g = /^\d+$/.test(v.grade) ? `Grade ${v.grade}` : v.grade
      return `student · ${g}`
    },
    reviewPairs: (v) => [
      ['Name', `${orDash(v.firstName)} ${v.lastName.trim() ? v.lastName.trim() : ''}`.trim()],
      ['Grade', /^\d+$/.test(v.grade) ? `Grade ${v.grade}` : v.grade],
      ['Birth date', orDash(v.birthDate)],
      ['Gender', v.gender ? (GENDER_LABELS[v.gender] ?? v.gender) : 'Not recorded'],
      ['Race', v.race ? (RACE_LABELS[v.race] ?? v.race) : 'Not recorded'],
      ['Ethnicity', v.ethnicity ? (ETHNICITY_LABELS[v.ethnicity] ?? v.ethnicity) : 'Not recorded'],
      ['Status', STUDENT_STATUS_LABELS[v.status] ?? human(v.status)],
      ['Enrolled on', orDash(v.enrolledOn)],
      ['Withdrawn on', orDash(v.withdrawnOn)],
      [
        'Support',
        [v.hasIep && 'IEP', v.has504 && '504', v.ell && 'ELL'].filter(Boolean).join(', ') || '—',
      ],
      ['Notes', orDash(v.notes)],
      ['SIS id', orDash(v.externalId)],
    ],
  },

  // ══════════════════════ GOVERNANCE · POLICY ════════════════════════════════
  'governance.policy': {
    key: 'governance.policy',
    noun: 'policy',
    nounPlural: 'policies',
    Icon: ScrollText,
    defaults: {
      // EMPTY_POLICY verbatim (GovernancePage.jsx:184)
      title: '',
      category: '',
      status: 'active',
      owner: '',
      adoptedDate: '',
      lastReviewedDate: '',
      reviewIntervalMonths: 12,
      notes: '',
    },
    steps: [
      {
        key: 'basics',
        label: 'Basics',
        title: 'First, the basics',
        blurb: 'Just the name and where it belongs.',
        fields: [
          {
            key: 'title',
            label: 'What’s this policy called?',
            type: 'text',
            required: true,
            requiredMsg: 'Give it a title',
            maxLength: 200,
            span: 2,
            placeholder: 'e.g. Conflict of Interest Policy',
          },
          {
            key: 'category',
            label: 'Category',
            type: 'text',
            required: true,
            requiredMsg: 'Pick a category — anything that makes sense to you',
            maxLength: 80,
            span: 2,
            placeholder: 'Financial, HR, Safety…',
            hint: 'Free text — schools name their own categories.',
          },
        ],
      },
      {
        key: 'details',
        label: 'Details',
        title: 'Add what you have',
        optional: true,
        blurb: 'Everything here is optional — add as much as you have.',
        fields: [
          { key: 'status', label: 'Status', type: 'select', options: opt(POLICY_STATUSES) },
          { key: 'owner', label: 'Owner', type: 'text', maxLength: 200, placeholder: 'e.g. Board chair' },
          {
            key: 'reviewIntervalMonths',
            label: 'Review every (months)',
            type: 'number',
            integer: true,
            min: 1,
            max: 120,
            hint: 'Defaults to 12.',
          },
          { key: 'adoptedDate', label: 'Adopted date', type: 'date' },
          { key: 'lastReviewedDate', label: 'Last reviewed', type: 'date' },
          { key: 'notes', label: 'Notes', type: 'textarea', rows: 3, maxLength: 4000, span: 2, fold: true },
        ],
      },
    ],
    // policyBody() verbatim (GovernancePage.jsx:195) — CreatePolicyDto ✓
    toBody: (v) => ({
      title: v.title.trim(),
      category: v.category.trim(),
      status: v.status,
      owner: v.owner.trim() ? v.owner.trim() : null,
      adoptedDate: v.adoptedDate ? v.adoptedDate : null,
      lastReviewedDate: v.lastReviewedDate ? v.lastReviewedDate : null,
      reviewIntervalMonths: Number(v.reviewIntervalMonths) || 12,
      notes: v.notes.trim() ? v.notes.trim() : null,
    }),
    submit: (ctx, body) => policiesApi.create(ctx.schoolId, body),
    itemLabel: (v) => v.title.trim(),
    itemSub: (v) => (v.category.trim() ? `policy · ${v.category.trim()}` : 'policy'),
    reviewPairs: (v) => [
      ['Title', orDash(v.title)],
      ['Category', orDash(v.category)],
      ['Status', cap(v.status)],
      ['Owner', orDash(v.owner)],
      ['Review every', `${Number(v.reviewIntervalMonths) || 12} months`],
      ['Adopted', orDash(v.adoptedDate)],
      ['Last reviewed', orDash(v.lastReviewedDate)],
      ['Notes', orDash(v.notes)],
    ],
  },

  // ══════════════════════ GOVERNANCE · COMMITTEE ═════════════════════════════
  'governance.committee': {
    key: 'governance.committee',
    noun: 'committee',
    nounPlural: 'committees',
    Icon: Users,
    defaults: {
      // EMPTY_COMMITTEE verbatim (GovernancePage.jsx:302)
      name: '',
      kind: 'board',
      chair: '',
      description: '',
      active: true,
    },
    steps: [
      {
        key: 'basics',
        label: 'Basics',
        title: 'First, the basics',
        blurb: 'What the committee is called and what kind it is.',
        fields: [
          {
            key: 'name',
            label: 'What’s this committee called?',
            type: 'text',
            required: true,
            requiredMsg: 'Give it a name',
            maxLength: 200,
            span: 2,
            placeholder: 'e.g. Finance Committee',
          },
          { key: 'kind', label: 'Kind', type: 'select', options: opt(COMMITTEE_KINDS) },
        ],
      },
      {
        key: 'details',
        label: 'Details',
        title: 'Add what you have',
        optional: true,
        blurb: 'Everything here is optional — add as much as you have.',
        fields: [
          { key: 'chair', label: 'Chair', type: 'text', maxLength: 200, placeholder: 'e.g. Jane Alvarez' },
          { key: 'active', label: 'Active committee', type: 'checkbox' },
          {
            key: 'description',
            label: 'Description',
            type: 'textarea',
            rows: 3,
            maxLength: 2000,
            span: 2,
            fold: true,
          },
        ],
      },
    ],
    // committeeBody() verbatim (GovernancePage.jsx:304) — CreateCommitteeDto ✓
    // (`active` must be a REAL boolean — @IsBoolean).
    toBody: (v) => ({
      name: v.name.trim(),
      kind: v.kind || 'other',
      chair: v.chair.trim() ? v.chair.trim() : null,
      description: v.description.trim() ? v.description.trim() : null,
      active: !!v.active,
    }),
    submit: (ctx, body) => committeesApi.create(ctx.schoolId, body),
    itemLabel: (v) => v.name.trim(),
    itemSub: (v) => `committee · ${human(v.kind || 'other').toLowerCase()}`,
    reviewPairs: (v) => [
      ['Name', orDash(v.name)],
      ['Kind', human(v.kind || 'other')],
      ['Chair', orDash(v.chair)],
      ['Active', v.active ? 'Yes' : 'No'],
      ['Description', orDash(v.description)],
    ],
  },

  // ══════════════════════ GOVERNANCE · MEETING ═══════════════════════════════
  'governance.meeting': {
    key: 'governance.meeting',
    noun: 'meeting',
    nounPlural: 'meetings',
    Icon: CalendarClock,
    loaders: {
      committees: (ctx) => committeesApi.list(ctx.schoolId).then((r) => r.data.committees ?? []),
    },
    defaults: {
      // EMPTY_MEETING verbatim (GovernancePage.jsx:390)
      title: '',
      committeeId: '',
      scheduledAt: '',
      location: '',
      status: 'scheduled',
      agenda: '',
      minutes: '',
      decisions: '',
      minutesStatus: 'none',
    },
    steps: [
      {
        key: 'basics',
        label: 'Basics',
        title: 'First, the basics',
        blurb: 'What the meeting is, when it happens, and whose it is.',
        fields: [
          {
            key: 'title',
            label: 'What’s this meeting called?',
            type: 'text',
            required: true,
            requiredMsg: 'Give it a title',
            maxLength: 200,
            span: 2,
            placeholder: 'e.g. September board meeting',
          },
          {
            key: 'scheduledAt',
            label: 'Meeting date',
            type: 'date',
            required: true,
            requiredMsg: 'Pick a meeting date',
          },
          {
            key: 'committeeId',
            label: 'Committee',
            type: 'select',
            emptyOptionLabel: '— none —',
            lookupKey: 'committees',
            options: (data) => (data.committees ?? []).map((c) => ({ value: c.id, label: c.name })),
            hint: 'Committees still in your list can’t be picked yet — save them first.',
          },
        ],
      },
      {
        key: 'details',
        label: 'Details',
        title: 'Add what you have',
        optional: true,
        blurb: 'Everything here is optional — agenda and minutes can come later.',
        fields: [
          { key: 'location', label: 'Location', type: 'text', maxLength: 200, placeholder: 'e.g. Library' },
          { key: 'status', label: 'Status', type: 'select', options: opt(MEETING_STATUSES) },
          { key: 'minutesStatus', label: 'Minutes status', type: 'select', options: opt(MINUTES_STATUSES) },
          { key: 'agenda', label: 'Agenda', type: 'textarea', rows: 3, maxLength: 20000, span: 2, fold: true },
          { key: 'minutes', label: 'Minutes', type: 'textarea', rows: 3, maxLength: 20000, span: 2, fold: true },
          {
            key: 'decisions',
            label: 'Decisions',
            type: 'textarea',
            rows: 3,
            maxLength: 20000,
            span: 2,
            fold: true,
          },
        ],
      },
    ],
    // meetingBody() verbatim (GovernancePage.jsx:402) EXCEPT scheduledAt is sent
    // DIRECTLY — the flow requires it (CreateMeetingDto @IsDateString scheduledAt!
    // is REQUIRED; the modal's undefined-when-empty would 400). NEVER send
    // minutesApprovedAt / minutesApprovedByUserId (server-only → 400). ✓
    toBody: (v) => ({
      title: v.title.trim(),
      committeeId: v.committeeId ? v.committeeId : null,
      scheduledAt: v.scheduledAt,
      location: v.location.trim() ? v.location.trim() : null,
      status: v.status,
      agenda: v.agenda.trim() ? v.agenda.trim() : null,
      minutes: v.minutes.trim() ? v.minutes.trim() : null,
      decisions: v.decisions.trim() ? v.decisions.trim() : null,
      minutesStatus: v.minutesStatus,
    }),
    submit: (ctx, body) => meetingsApi.create(ctx.schoolId, body),
    itemLabel: (v) => v.title.trim(),
    itemSub: (v) => (v.scheduledAt ? `meeting · ${v.scheduledAt}` : 'meeting'),
    reviewPairs: (v, data) => [
      ['Title', orDash(v.title)],
      ['Date', orDash(v.scheduledAt)],
      ['Committee', (data?.committees ?? []).find((c) => c.id === v.committeeId)?.name ?? '—'],
      ['Location', orDash(v.location)],
      ['Status', human(v.status)],
      ['Minutes status', human(v.minutesStatus)],
      ['Agenda', orDash(v.agenda)],
      ['Minutes', orDash(v.minutes)],
      ['Decisions', orDash(v.decisions)],
    ],
  },

  // ══════════════════════ GOVERNANCE · PERSON (Phase 2) ══════════════════════
  // Board / finance team / staff roster. `groups` is a string[] in the API
  // (PERSON_GROUPS in apps/api/src/governance/dto/person.dto.ts: 'board' |
  // 'finance_team' | 'staff') — the flow renders three checkboxes and toBody
  // assembles the array (the framework has no multi-chip field type). Optional
  // empties are OMITTED (never '' — every field is DTO-bounded).
  'governance.person': {
    key: 'governance.person',
    noun: 'person',
    nounPlural: 'people',
    Icon: UserRound,
    defaults: {
      name: '',
      title: '',
      groupBoard: true,
      groupFinance: false,
      groupStaff: false,
      termStart: '',
      termEnd: '',
      email: '',
      bio: '',
    },
    steps: [
      {
        key: 'basics',
        label: 'Basics',
        title: 'First, who they are',
        blurb: 'Their name, what they do, and which groups they belong to.',
        fields: [
          {
            key: 'name',
            label: 'What’s their name?',
            type: 'text',
            required: true,
            requiredMsg: 'Give them a name',
            maxLength: 200,
            span: 2,
            placeholder: 'e.g. Jane Alvarez',
          },
          {
            key: 'title',
            label: 'Title',
            type: 'text',
            maxLength: 200,
            span: 2,
            placeholder: 'Board Chair, Trustee, CFO, Business Manager…',
          },
          { key: 'groupBoard', label: 'Board', type: 'checkbox', placeholder: 'On the board' },
          {
            key: 'groupFinance',
            label: 'Finance team',
            type: 'checkbox',
            placeholder: 'On the finance team',
          },
          { key: 'groupStaff', label: 'Staff', type: 'checkbox', placeholder: 'On staff' },
        ],
      },
      {
        key: 'details',
        label: 'Details',
        title: 'Add what you have',
        optional: true,
        blurb: 'Everything here is optional — terms and bios can come later.',
        fields: [
          { key: 'termStart', label: 'Term start', type: 'date' },
          {
            key: 'termEnd',
            label: 'Term end',
            type: 'date',
            validate: (raw, v) =>
              raw && v.termStart && raw < v.termStart ? 'The term can’t end before it starts' : null,
          },
          {
            key: 'email',
            label: 'Email',
            type: 'text',
            maxLength: 200,
            placeholder: 'jane@example.org',
            validate: (raw) => {
              const t = String(raw ?? '').trim()
              return t && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)
                ? 'That email address doesn’t look right'
                : null
            },
          },
          {
            key: 'bio',
            label: 'Bio / qualifications',
            type: 'textarea',
            rows: 3,
            maxLength: 2000,
            span: 2,
            fold: true,
          },
        ],
      },
    ],
    // CreatePersonDto ✓ — name + groups always; optional empties OMITTED (the
    // create DTO is @IsOptional-per-field; null-clears are a PATCH-only concern).
    toBody: (v) => {
      const groups = []
      if (v.groupBoard) groups.push('board')
      if (v.groupFinance) groups.push('finance_team')
      if (v.groupStaff) groups.push('staff')
      const body = { name: v.name.trim(), groups }
      if (v.title.trim()) body.title = v.title.trim()
      if (v.termStart) body.termStart = v.termStart
      if (v.termEnd) body.termEnd = v.termEnd
      if (v.email.trim()) body.email = v.email.trim()
      if (v.bio.trim()) body.bio = v.bio.trim()
      return body
    },
    submit: (ctx, body) => governancePeopleApi.create(ctx.schoolId, body),
    itemLabel: (v) => v.name.trim(),
    itemSub: (v) => {
      const g = []
      if (v.groupBoard) g.push('board')
      if (v.groupFinance) g.push('finance team')
      if (v.groupStaff) g.push('staff')
      return g.length ? `person · ${g.join(' + ')}` : 'person'
    },
    reviewPairs: (v) => [
      ['Name', orDash(v.name)],
      ['Title', orDash(v.title)],
      [
        'Groups',
        [v.groupBoard && 'Board', v.groupFinance && 'Finance team', v.groupStaff && 'Staff']
          .filter(Boolean)
          .join(', ') || '—',
      ],
      ['Term start', orDash(v.termStart)],
      ['Term end', orDash(v.termEnd)],
      ['Email', orDash(v.email)],
      ['Bio', orDash(v.bio)],
    ],
  },

  // ══════════════════════ ACCREDITATION · STANDARD ═══════════════════════════
  'accreditation.standard': {
    key: 'accreditation.standard',
    noun: 'standard',
    nounPlural: 'standards',
    Icon: ClipboardCheck,
    loaders: {
      // Fixes today's modal-in-wizard gap (standards={[]} meant no parent select).
      standards: (ctx) => accreditationApi.listStandards(ctx.schoolId).then((r) => r.data.standards ?? []),
    },
    defaults: {
      // EMPTY_FORM verbatim (AccreditationPage.jsx:225)
      code: '',
      title: '',
      category: '',
      parentId: '',
      rating: 'not_started',
      reviewDate: '',
      owner: '',
      notes: '',
    },
    steps: [
      {
        key: 'basics',
        label: 'Basics',
        title: 'First, the basics',
        blurb: 'The framework code and what the standard says.',
        fields: [
          {
            key: 'code',
            label: 'Code',
            type: 'text',
            required: true,
            requiredMsg: 'Give it a code',
            maxLength: 40,
            placeholder: 'e.g. MSA-3',
          },
          {
            key: 'title',
            label: 'Title',
            type: 'text',
            required: true,
            requiredMsg: 'Give it a title',
            maxLength: 200,
            span: 2,
            placeholder: 'e.g. The school engages in strategic planning',
          },
        ],
      },
      {
        key: 'details',
        label: 'Details',
        title: 'Add what you have',
        optional: true,
        blurb: 'Everything here is optional — add as much as you have.',
        fields: [
          { key: 'category', label: 'Category', type: 'text', maxLength: 80, hint: 'e.g. Governance' },
          { key: 'rating', label: 'Rating', type: 'select', options: opt(STANDARD_RATINGS) },
          {
            key: 'parentId',
            label: 'Parent standard',
            type: 'select',
            emptyOptionLabel: 'Top-level (no parent)',
            lookupKey: 'standards',
            options: (data) =>
              (data.standards ?? []).map((s) => ({ value: s.id, label: `${s.code} — ${s.title}` })),
            hint: 'Items still in your list can’t be picked yet — save first, then add children.',
          },
          { key: 'owner', label: 'Owner', type: 'text', maxLength: 200, placeholder: 'e.g. Head of School' },
          { key: 'reviewDate', label: 'Review date', type: 'date' },
          { key: 'notes', label: 'Notes', type: 'textarea', rows: 3, maxLength: 4000, span: 2, fold: true },
        ],
      },
    ],
    // toStandardBody() verbatim (AccreditationPage.jsx:236) — CreateStandardDto ✓
    toBody: (v) => ({
      code: v.code.trim(),
      title: v.title.trim(),
      category: v.category.trim() ? v.category.trim() : null,
      parentId: v.parentId ? v.parentId : null,
      rating: v.rating || 'not_started',
      reviewDate: v.reviewDate ? v.reviewDate : null,
      owner: v.owner.trim() ? v.owner.trim() : null,
      notes: v.notes.trim() ? v.notes.trim() : null,
    }),
    submit: (ctx, body) => accreditationApi.createStandard(ctx.schoolId, body),
    itemLabel: (v) => {
      const c = v.code.trim()
      const t = v.title.trim()
      return c && t ? `${c} — ${t}` : t || c
    },
    itemSub: () => 'standard',
    reviewPairs: (v, data) => [
      ['Code', orDash(v.code)],
      ['Title', orDash(v.title)],
      ['Category', orDash(v.category)],
      ['Rating', human(v.rating || 'not_started')],
      [
        'Parent',
        v.parentId
          ? ((data?.standards ?? []).find((s) => s.id === v.parentId)
              ? `${(data.standards.find((s) => s.id === v.parentId)).code} — ${
                  data.standards.find((s) => s.id === v.parentId).title
                }`
              : '—')
          : 'Top-level',
      ],
      ['Owner', orDash(v.owner)],
      ['Review date', orDash(v.reviewDate)],
      ['Notes', orDash(v.notes)],
    ],
  },

  // ══════════════════════ FACILITIES · MAINTENANCE ═══════════════════════════
  'facilities.maintenance': {
    key: 'facilities.maintenance',
    noun: 'maintenance item',
    nounPlural: 'maintenance items',
    Icon: Wrench,
    loaders: {
      vendors: (ctx) => facilitiesApi.listVendors(ctx.schoolId).then((r) => r.data.vendors ?? []),
    },
    defaults: {
      // EMPTY_FORM verbatim (FacilitiesPage.jsx:187) + vendorId (vendor register)
      title: '',
      location: '',
      category: '',
      vendor: '',
      vendorId: '',
      priority: 'medium',
      status: 'open',
      estimatedCost: '',
      actualCost: '',
      targetDate: '',
      recurrence: 'none',
      complianceKind: '',
      notes: '',
    },
    steps: [
      {
        key: 'basics',
        label: 'Basics',
        title: 'First, the basics',
        blurb: 'What needs doing and where.',
        fields: [
          {
            key: 'title',
            label: 'What needs doing?',
            type: 'text',
            required: true,
            requiredMsg: 'Give it a title',
            maxLength: 200,
            span: 2,
            placeholder: 'e.g. Replace gym roof membrane',
          },
          { key: 'location', label: 'Location', type: 'text', maxLength: 200, placeholder: 'e.g. Gymnasium' },
          { key: 'category', label: 'Category', type: 'text', maxLength: 80, placeholder: 'e.g. Roofing' },
        ],
      },
      {
        key: 'details',
        label: 'Details',
        title: 'Add what you have',
        optional: true,
        blurb: 'Everything here is optional — costs and dates can come later.',
        fields: [
          {
            key: 'vendorId',
            label: 'Vendor',
            type: 'select',
            emptyOptionLabel: '— none —',
            lookupKey: 'vendors',
            options: (data) =>
              (data.vendors ?? [])
                .filter((v) => v.active !== false)
                .map((v) => ({ value: v.id, label: v.name })),
            hint: 'Pick from your vendor register, or type a name below.',
          },
          { key: 'vendor', label: 'Or vendor name (free text)', type: 'text', maxLength: 160, placeholder: 'e.g. Acme Roofing' },
          { key: 'priority', label: 'Priority', type: 'select', options: opt(MAINTENANCE_PRIORITIES) },
          { key: 'status', label: 'Status', type: 'select', options: opt(MAINTENANCE_STATUSES) },
          { key: 'estimatedCost', label: 'Estimated cost ($)', type: 'number', money: true, min: 0 },
          { key: 'actualCost', label: 'Actual cost ($)', type: 'number', money: true, min: 0 },
          { key: 'targetDate', label: 'Target date', type: 'date' },
          {
            key: 'recurrence',
            label: 'Repeats',
            type: 'select',
            options: opt(MAINTENANCE_RECURRENCES),
            hint: 'Preventive maintenance — resolving one spawns the next.',
          },
          // AIC Phase F — WHAT KIND of regulatory inspection this item is. Blank
          // (the default) means an ordinary maintenance item, which is what almost
          // every item is. NEVER inferred from title/category/location.
          {
            key: 'complianceKind',
            label: 'Compliance inspection',
            type: 'select',
            emptyOptionLabel: '— not a compliance inspection —',
            options: COMPLIANCE_KIND_OPTIONS,
            hint: 'We only call something an inspection when you tell us it is one.',
          },
          { key: 'notes', label: 'Notes', type: 'textarea', rows: 3, maxLength: 4000, span: 2, fold: true },
        ],
      },
    ],
    // toItemBody() verbatim (FacilitiesPage.jsx:201) — CreateMaintenanceDto ✓
    // NO recurrenceUntil (DTO allows it; the modal never sends it — keep parity),
    // NEVER seriesId (server-only → 400).
    toBody: (v) => {
      const cost = String(v.estimatedCost ?? '').trim()
      const actual = String(v.actualCost ?? '').trim()
      return {
        title: v.title.trim(),
        location: v.location.trim() ? v.location.trim() : null,
        category: v.category.trim() ? v.category.trim() : null,
        vendor: v.vendor.trim() ? v.vendor.trim() : null,
        vendorId: v.vendorId ? v.vendorId : null,
        priority: v.priority,
        status: v.status,
        estimatedCost: cost === '' ? null : Number(cost),
        actualCost: actual === '' ? null : Number(actual),
        targetDate: v.targetDate ? v.targetDate : null,
        recurrence: v.recurrence,
        // AIC Phase F — blank → null CLEARS the kind (an ordinary maintenance
        // item). The vocabulary is closed with no catch-all on purpose.
        complianceKind: v.complianceKind ? v.complianceKind : null,
        notes: v.notes.trim() ? v.notes.trim() : null,
      }
    },
    submit: (ctx, body) => facilitiesApi.createMaintenance(ctx.schoolId, body),
    itemLabel: (v) => v.title.trim(),
    itemSub: (v) => `maintenance · ${human(v.priority).toLowerCase()}`,
    reviewPairs: (v, data) => [
      ['Title', orDash(v.title)],
      ['Location', orDash(v.location)],
      ['Category', orDash(v.category)],
      [
        'Vendor',
        v.vendorId
          ? ((data?.vendors ?? []).find((vv) => vv.id === v.vendorId)?.name ?? '—')
          : orDash(v.vendor),
      ],
      ['Priority', human(v.priority)],
      ['Status', human(v.status)],
      ['Estimated cost', moneyDash(v.estimatedCost)],
      ['Actual cost', moneyDash(v.actualCost)],
      ['Target date', orDash(v.targetDate)],
      ['Repeats', human(v.recurrence)],
      [
        'Compliance inspection',
        v.complianceKind ? complianceKindLabel(v.complianceKind) : 'Not an inspection',
      ],
      ['Notes', orDash(v.notes)],
    ],
  },

  // ══════════════════════ ADVANCEMENT · CAMPAIGN ═════════════════════════════
  'advancement.campaign': {
    key: 'advancement.campaign',
    noun: 'campaign',
    nounPlural: 'campaigns',
    Icon: HeartHandshake,
    defaults: {
      // EMPTY_FORM verbatim (AdvancementPage.jsx:212)
      name: '',
      campaignType: '',
      goalAmount: '',
      raisedAmount: '',
      fiscalYear: '',
      startDate: '',
      closeDate: '',
      status: 'active',
      notes: '',
    },
    steps: [
      {
        key: 'basics',
        label: 'Basics',
        title: 'First, the basics',
        blurb: 'What the campaign is called and where it stands.',
        fields: [
          {
            key: 'name',
            label: 'What’s this campaign called?',
            type: 'text',
            required: true,
            requiredMsg: 'Give it a name',
            maxLength: 200,
            span: 2,
            placeholder: 'e.g. 2026 Annual Fund',
          },
          { key: 'campaignType', label: 'Type', type: 'select', emptyOptionLabel: '—', options: opt(CAMPAIGN_TYPES) },
          { key: 'status', label: 'Status', type: 'select', options: opt(CAMPAIGN_STATUSES) },
        ],
      },
      {
        key: 'details',
        label: 'Details',
        title: 'Add what you have',
        optional: true,
        blurb: 'Everything here is optional — goals and dates can come later.',
        fields: [
          { key: 'goalAmount', label: 'Goal ($)', type: 'number', money: true, min: 0 },
          {
            key: 'raisedAmount',
            label: 'Raised so far ($)',
            type: 'number',
            money: true,
            min: 0,
            hint: 'Leave blank for 0.',
          },
          { key: 'fiscalYear', label: 'Fiscal year', type: 'number', integer: true, min: 2000, max: 2100 },
          { key: 'startDate', label: 'Start date', type: 'date' },
          { key: 'closeDate', label: 'Close date', type: 'date' },
          { key: 'notes', label: 'Notes', type: 'textarea', rows: 3, maxLength: 4000, span: 2, fold: true },
        ],
      },
    ],
    // toCampaignBody() verbatim (AdvancementPage.jsx:224) — CreateCampaignDto ✓
    // (raisedAmount '' → 0, goal/fiscalYear '' → null — never '').
    toBody: (v) => {
      const goal = String(v.goalAmount ?? '').trim()
      const raised = String(v.raisedAmount ?? '').trim()
      const fy = String(v.fiscalYear ?? '').trim()
      return {
        name: v.name.trim(),
        campaignType: v.campaignType ? v.campaignType : null,
        goalAmount: goal === '' ? null : Number(goal),
        raisedAmount: raised === '' ? 0 : Number(raised),
        fiscalYear: fy === '' ? null : Number(fy),
        startDate: v.startDate ? v.startDate : null,
        closeDate: v.closeDate ? v.closeDate : null,
        status: v.status,
        notes: v.notes.trim() ? v.notes.trim() : null,
      }
    },
    submit: (ctx, body) => advancementApi.createCampaign(ctx.schoolId, body),
    itemLabel: (v) => v.name.trim(),
    itemSub: (v) => `campaign · ${human(v.status).toLowerCase()}`,
    reviewPairs: (v) => [
      ['Name', orDash(v.name)],
      ['Type', v.campaignType ? human(v.campaignType) : '—'],
      ['Status', human(v.status)],
      ['Goal', moneyDash(v.goalAmount)],
      ['Raised so far', String(v.raisedAmount ?? '').trim() === '' ? '$0' : moneyDash(v.raisedAmount)],
      ['Fiscal year', orDash(v.fiscalYear)],
      ['Start date', orDash(v.startDate)],
      ['Close date', orDash(v.closeDate)],
      ['Notes', orDash(v.notes)],
    ],
  },

  // ══════════════════════ ADVANCEMENT · GIFT / PLEDGE ════════════════════════
  'advancement.gift': {
    key: 'advancement.gift',
    noun: 'gift or pledge',
    nounPlural: 'gifts & pledges',
    Icon: Gift,
    loaders: {
      campaigns: (ctx) => advancementApi.listCampaigns(ctx.schoolId).then((r) => r.data.campaigns ?? []),
    },
    // Gifts REQUIRE a campaign to live under (the create URL is nested).
    gate: (data) =>
      data.campaigns == null
        ? {
            title: 'We couldn’t load your campaigns',
            body: 'Refresh and try again — gifts need a campaign to live under.',
          }
        : data.campaigns.length === 0
          ? {
              title: 'Create a campaign first',
              body: 'Gifts and pledges are logged against a campaign. Start one and come back.',
              action: { label: 'Start a campaign', goToOptionKey: 'campaign' },
            }
          : null,
    defaults: {
      // GiftForm initial (AdvancementPage.jsx:394) + campaignId
      campaignId: '',
      kind: 'gift',
      amount: '',
      receivedAmount: '',
      occurredOn: '',
      label: '',
      source: '',
      note: '',
    },
    steps: [
      {
        key: 'basics',
        label: 'Basics',
        title: 'First, the basics',
        blurb: 'Which campaign, how much, and when.',
        fields: [
          {
            key: 'campaignId',
            label: 'Campaign',
            type: 'select',
            required: true,
            requiredMsg: 'Pick a campaign',
            lookupKey: 'campaigns',
            options: (data) => (data.campaigns ?? []).map((c) => ({ value: c.id, label: c.name })),
            hint: 'Only saved campaigns appear here — queued ones show up after you save.',
          },
          {
            key: 'kind',
            label: 'Type',
            type: 'select',
            options: [
              { value: 'gift', label: 'Gift' },
              { value: 'pledge', label: 'Pledge' },
            ],
          },
          {
            key: 'amount',
            label: 'Amount ($)',
            type: 'number',
            required: true,
            requiredMsg: 'Enter a valid amount',
            money: true,
            min: 0,
            placeholder: 'e.g. 5000',
          },
          {
            key: 'occurredOn',
            label: 'Date',
            type: 'date',
            required: true,
            requiredMsg: 'Pick a date',
          },
        ],
      },
      {
        key: 'details',
        label: 'Details',
        title: 'Add what you have',
        optional: true,
        blurb: 'Everything here is optional — amounts only, never donor names.',
        fields: [
          {
            key: 'receivedAmount',
            label: 'Received so far ($)',
            type: 'number',
            money: true,
            min: 0,
            showIf: (v) => v.kind === 'pledge',
            placeholder: '0',
            validate: (raw, v) => {
              const a = Number(v.amount)
              const r = String(raw ?? '').trim() === '' ? 0 : Number(raw)
              return r > a ? 'Received must be between 0 and the pledged amount' : null
            },
          },
          {
            key: 'label',
            label: 'Label',
            type: 'text',
            maxLength: 120,
            hint: 'No donor names — e.g. Spring appeal',
          },
          { key: 'source', label: 'Source', type: 'text', maxLength: 60, placeholder: 'e.g. event · online · grant' },
          { key: 'note', label: 'Note', type: 'textarea', rows: 3, maxLength: 2000, span: 2, fold: true },
        ],
      },
    ],
    // GiftForm body verbatim (AdvancementPage.jsx:412) — CreateGiftDto ✓
    // campaignId is a URL SEGMENT, never a body key. receivedAmount ONLY for a
    // pledge ('' → 0, ≤ amount client-validated). NEVER send status (server derives).
    toBody: (v) => {
      const body = {
        kind: v.kind,
        amount: Number(v.amount),
        occurredOn: v.occurredOn,
        label: v.label.trim() ? v.label.trim() : null,
        source: v.source.trim() ? v.source.trim() : null,
        note: v.note.trim() ? v.note.trim() : null,
      }
      if (v.kind === 'pledge') {
        const rec = String(v.receivedAmount ?? '').trim()
        body.receivedAmount = rec === '' ? 0 : Number(rec)
      }
      return body
    },
    submit: (ctx, body, values) => advancementApi.createGift(ctx.schoolId, values.campaignId, body),
    itemLabel: (v) =>
      String(v.amount ?? '').trim() && !Number.isNaN(Number(v.amount))
        ? `$${Number(v.amount).toLocaleString()} · ${v.occurredOn || '—'}`
        : '',
    itemSub: (v) => v.kind,
    reviewPairs: (v, data) => {
      const pairs = [
        ['Campaign', (data?.campaigns ?? []).find((c) => c.id === v.campaignId)?.name ?? '—'],
        ['Type', pick([{ value: 'gift', label: 'Gift' }, { value: 'pledge', label: 'Pledge' }], v.kind)],
        ['Amount', moneyDash(v.amount)],
      ]
      if (v.kind === 'pledge') {
        pairs.push([
          'Received so far',
          String(v.receivedAmount ?? '').trim() === '' ? '$0' : moneyDash(v.receivedAmount),
        ])
      }
      pairs.push(
        ['Date', orDash(v.occurredOn)],
        ['Label', orDash(v.label)],
        ['Source', orDash(v.source)],
        ['Note', orDash(v.note)],
      )
      return pairs
    },
  },

  // ══════════════════════ HR · STAFFING FTEs (Phase 6) ═══════════════════════
  // NOT a register record — a partial PUT onto the period's operational row
  // (UpsertOperationalDto): ONLY the keys the user actually touched are sent
  // (omit ≠ null — an explicit null CLEARS a stored field, so untouched fields
  // are OMITTED and the Data-hub enrollment/aid entries can never be clobbered).
  // The service enforces teachingFte <= totalStaffFte AFTER merging with the
  // stored row; the client mirrors the in-form case inline for UX.
  'hr.staffing': {
    key: 'hr.staffing',
    noun: 'staffing entry',
    nounPlural: 'staffing entries',
    Icon: Users,
    defaults: {
      teachingFte: '',
      totalStaffFte: '',
      notes: '',
    },
    // The save is a per-PERIOD partial PUT — without a period there is nothing
    // to write onto (needsPeriod only guards 'embed' options, so flows gate).
    gate: (data, ctx) =>
      ctx.periodId
        ? null
        : {
            title: 'No fiscal period yet',
            body: 'Staffing FTEs attach to a period — add one first: upload a trial balance from Finance → Add data.',
          },
    steps: [
      {
        key: 'fte',
        label: 'Staffing',
        title: 'This period’s staffing FTEs',
        blurb:
          'Full-time-equivalents, not headcount — 2 half-time teachers = 1 FTE. Teaching is the instructional subset of total staff. Leave a field blank to keep what’s stored.',
        fields: [
          {
            key: 'teachingFte',
            label: 'Teaching FTE',
            type: 'number',
            min: 0,
            max: 1000000,
            placeholder: 'e.g. 42.5',
            hint: 'Instructional staff only — drives the student-teacher ratio.',
            // ≤2dp (UpsertOperationalDto @IsNumber maxDecimalPlaces 2) + the
            // in-form teaching ≤ total mirror of the server rule.
            validate: (raw, v) => {
              const t = String(raw ?? '').trim()
              if (t !== '' && !/^\d+(\.\d{1,2})?$/.test(t)) return 'Use at most 2 decimal places'
              const total = String(v.totalStaffFte ?? '').trim()
              if (t !== '' && total !== '' && Number(t) > Number(total))
                return `Can’t exceed total staff (${Number(total)})`
              return null
            },
          },
          {
            key: 'totalStaffFte',
            label: 'Total staff FTE',
            type: 'number',
            min: 0,
            max: 1000000,
            placeholder: 'e.g. 61',
            hint: 'All staff — teachers, admin, facilities.',
            validate: (raw) => {
              const t = String(raw ?? '').trim()
              return t !== '' && !/^\d+(\.\d{1,2})?$/.test(t) ? 'Use at most 2 decimal places' : null
            },
          },
          {
            key: 'notes',
            label: 'Notes',
            type: 'textarea',
            rows: 3,
            maxLength: 2000,
            span: 2,
            fold: true,
            hint: 'Optional context — shared with the operational-data panel.',
          },
        ],
      },
    ],
    // UpsertOperationalDto ✓ — partial PUT: ONLY touched keys, OMIT untouched
    // (never null — explicit null clears). No enrollment/aid passthrough.
    toBody: (v) => {
      const body = {}
      if (String(v.teachingFte ?? '').trim() !== '') body.teachingFte = Number(v.teachingFte)
      if (String(v.totalStaffFte ?? '').trim() !== '') body.totalStaffFte = Number(v.totalStaffFte)
      if (v.notes.trim()) body.notes = v.notes.trim()
      return body
    },
    submit: (ctx, body) => analyticsApi.saveOperational(ctx.schoolId, ctx.periodId, body),
    itemLabel: (v) => {
      const parts = []
      if (String(v.teachingFte ?? '').trim() !== '') parts.push(`${Number(v.teachingFte)} teaching`)
      if (String(v.totalStaffFte ?? '').trim() !== '') parts.push(`${Number(v.totalStaffFte)} total`)
      return parts.length ? `Staffing · ${parts.join(' / ')}` : ''
    },
    itemSub: () => 'staffing FTEs',
    reviewPairs: (v) => [
      ['Teaching FTE', String(v.teachingFte ?? '').trim() === '' ? 'kept as stored' : String(Number(v.teachingFte))],
      ['Total staff FTE', String(v.totalStaffFte ?? '').trim() === '' ? 'kept as stored' : String(Number(v.totalStaffFte))],
      ['Notes', orDash(v.notes)],
    ],
  },

  // ══════════════════ HR · STAFF EVALUATION (AIC Phase F) ════════════════════
  // The staff-evaluation CYCLE record: who, when it was due, when it was done.
  //
  // ADULT-STAFF EMPLOYMENT PII. This flow WRITES a name-bearing record and is
  // therefore reachable only where the server already allows it: the create route
  // is @Roles('owner','accountant') behind @RequiresModule('hr'), so a viewer
  // never reaches a successful submit here either.
  //
  // The person comes from the EXISTING governance people register — there is no
  // second person table, and there never will be. That register lives behind the
  // GOVERNANCE module, so the loader can legitimately fail with a 402 for an
  // HR-only school; the gate says so plainly instead of showing an empty select.
  //
  // MOUNTED at `hr` → "Staff evaluations" in ../wizard/wizardConfigs.jsx, so /hr's
  // "Add data" CTA offers it. The second ADD path is the "+ New" button on the HR
  // command center's Evaluations register, which opens StaffEvaluationFormModal
  // against the same create DTO.
  'hr.staffEvaluation': {
    key: 'hr.staffEvaluation',
    noun: 'staff evaluation',
    nounPlural: 'staff evaluations',
    Icon: ClipboardCheck,
    loaders: {
      // Filtered to the staff group on BOTH sides: the server accepts only a
      // GovernancePerson of this school whose `groups` contains 'staff'.
      people: (ctx) =>
        governancePeopleApi.list(ctx.schoolId, { group: 'staff' }).then((r) => {
          const list = Array.isArray(r.data) ? r.data : (r.data?.people ?? [])
          return list.filter((p) => (p.groups ?? []).includes('staff'))
        }),
    },
    gate: (data) =>
      data.people == null
        ? {
            title: 'We couldn’t load your people',
            body: 'Evaluations attach to someone on your people register, which lives in the Governance module. Refresh and try again — and if Governance isn’t on your plan yet, that’s why.',
          }
        : data.people.length === 0
          ? {
              title: 'No one is in your Staff group yet',
              body: 'Evaluations attach to a person on your people register. Add your staff in Governance first — we never keep a second copy of a person.',
            }
          : null,
    defaults: {
      personId: '',
      cycleLabel: '',
      dueDate: '',
      completedDate: '',
      evaluatorName: '',
      status: 'scheduled',
      notes: '',
    },
    steps: [
      {
        key: 'person',
        label: 'Person',
        title: 'First, who it’s for',
        blurb: 'From your existing people register — the same person, one record.',
        fields: [
          {
            key: 'personId',
            label: 'Member of staff',
            type: 'select',
            required: true,
            requiredMsg: 'Pick the member of staff',
            emptyOptionLabel: '— pick a person —',
            lookupKey: 'people',
            span: 2,
            options: (data) =>
              (data.people ?? []).map((p) => ({
                value: p.id,
                label: p.title ? `${p.name} — ${p.title}` : p.name,
              })),
          },
        ],
      },
      {
        key: 'cycle',
        label: 'Cycle',
        title: 'Which cycle, and when was it due',
        blurb:
          'The due date is the clock the overdue count reads — a record without one can be neither overdue nor current, so it is required.',
        fields: [
          {
            key: 'cycleLabel',
            label: 'Cycle',
            type: 'text',
            required: true,
            requiredMsg: 'Name the cycle',
            maxLength: 80,
            span: 2,
            placeholder: 'e.g. 2025-26 annual cycle',
          },
          {
            key: 'dueDate',
            label: 'Due date',
            type: 'date',
            required: true,
            requiredMsg: 'Pick the date it was due',
          },
          { key: 'completedDate', label: 'Completed date', type: 'date' },
        ],
      },
      {
        key: 'status',
        label: 'Status',
        title: 'Where it stands',
        optional: true,
        blurb: 'A completed date counts as done whatever the status says.',
        fields: [
          {
            key: 'status',
            label: 'Status',
            type: 'select',
            options: STAFF_EVALUATION_STATUSES.map((s) => ({
              value: s,
              label: staffEvaluationStatusLabel(s),
            })),
          },
          {
            key: 'evaluatorName',
            label: 'Evaluator',
            type: 'text',
            maxLength: 200,
            placeholder: 'e.g. Head of School',
          },
          { key: 'notes', label: 'Notes', type: 'textarea', rows: 3, maxLength: 4000, span: 2, fold: true },
        ],
      },
    ],
    // CreateStaffEvaluationDto ✓ — key by key, no spread. `personId` is CREATE-only
    // (PATCH does not whitelist it: re-pointing an evaluation is a delete plus a
    // create, and a stray key 400s).
    toBody: (v) => ({
      personId: v.personId,
      cycleLabel: v.cycleLabel.trim(),
      dueDate: v.dueDate,
      completedDate: v.completedDate ? v.completedDate : null,
      evaluatorName: v.evaluatorName.trim() ? v.evaluatorName.trim() : null,
      status: v.status,
      notes: v.notes.trim() ? v.notes.trim() : null,
    }),
    submit: (ctx, body) => hrApi.createStaffEvaluation(ctx.schoolId, body),
    itemLabel: (v) => v.cycleLabel.trim(),
    itemSub: (v) => `evaluation · ${staffEvaluationStatusLabel(v.status).toLowerCase()}`,
    reviewPairs: (v, data) => [
      [
        'Member of staff',
        (data?.people ?? []).find((p) => p.id === v.personId)?.name ?? '—',
      ],
      ['Cycle', orDash(v.cycleLabel)],
      ['Due date', orDash(v.dueDate)],
      ['Completed date', orDash(v.completedDate)],
      ['Status', staffEvaluationStatusLabel(v.status)],
      ['Evaluator', orDash(v.evaluatorName)],
      ['Notes', orDash(v.notes)],
    ],
  },

  // ═══════════════ HR · SAFE-ENVIRONMENT CLEARANCE (AIC Phase K) ═════════════
  // The most sensitive record a school enters in this product. Everything the
  // register holds stays on the register: the twin reads two date columns, and
  // the finding it produces is four counts with no name in it.
  'hr.clearance': {
    key: 'hr.clearance',
    noun: 'clearance',
    nounPlural: 'clearances',
    Icon: ShieldCheck,
    loaders: {
      // Filtered to the staff group on BOTH sides, exactly as the evaluation flow
      // does: the server accepts only a GovernancePerson of this school whose
      // `groups` contains 'staff'.
      people: (ctx) =>
        governancePeopleApi.list(ctx.schoolId, { group: 'staff' }).then((r) => {
          const list = Array.isArray(r.data) ? r.data : (r.data?.people ?? [])
          return list.filter((p) => (p.groups ?? []).includes('staff'))
        }),
    },
    gate: (data) =>
      data.people == null
        ? {
            title: 'We couldn’t load your people',
            body: 'These records attach to someone on your people register, which lives in the Governance module. Refresh and try again — and if Governance isn’t on your plan yet, that’s why.',
          }
        : data.people.length === 0
          ? {
              title: 'No one is in your Staff group yet',
              body: 'These records attach to a person on your people register. Add your staff in Governance first — we never keep a second copy of a person.',
            }
          : null,
    defaults: {
      personId: '',
      kind: 'background_check',
      issuedOn: '',
      expiresOn: '',
      verifiedBy: '',
      notes: '',
    },
    steps: [
      {
        key: 'person',
        label: 'Person',
        title: 'First, who it’s for',
        blurb: 'From your existing people register — the same person, one record.',
        fields: [
          {
            key: 'personId',
            label: 'Member of staff',
            type: 'select',
            required: true,
            requiredMsg: 'Pick the member of staff',
            emptyOptionLabel: '— pick a person —',
            lookupKey: 'people',
            span: 2,
            options: (data) =>
              (data.people ?? []).map((p) => ({
                value: p.id,
                label: p.title ? `${p.name} — ${p.title}` : p.name,
              })),
          },
        ],
      },
      {
        key: 'dates',
        label: 'Clearance',
        title: 'What was cleared, and when',
        blurb:
          'The expiry date is the clock the lapsed count reads. Leave it blank if this clearance does not expire — blank is never treated as lapsed.',
        fields: [
          {
            key: 'kind',
            label: 'Kind',
            type: 'select',
            required: true,
            requiredMsg: 'Pick the kind of clearance',
            span: 2,
            options: CLEARANCE_KINDS.map((k) => ({ value: k, label: clearanceKindLabel(k) })),
          },
          {
            key: 'issuedOn',
            label: 'Issued on',
            type: 'date',
            required: true,
            requiredMsg: 'Pick the date it was issued',
          },
          { key: 'expiresOn', label: 'Expires on', type: 'date' },
        ],
      },
      {
        key: 'record',
        label: 'Record',
        title: 'Who verified it',
        optional: true,
        blurb: 'Kept on the register for your own audit trail. It never leaves it.',
        fields: [
          {
            key: 'verifiedBy',
            label: 'Verified by',
            type: 'text',
            maxLength: 120,
            placeholder: 'e.g. Business Manager',
          },
          { key: 'notes', label: 'Notes', type: 'textarea', rows: 3, maxLength: 2000, span: 2, fold: true },
        ],
      },
    ],
    // CreateClearanceDto ✓ — key by key, no spread.
    toBody: (v) => ({
      personId: v.personId,
      kind: v.kind,
      issuedOn: v.issuedOn,
      ...(v.expiresOn ? { expiresOn: v.expiresOn } : {}),
      ...(v.verifiedBy.trim() ? { verifiedBy: v.verifiedBy.trim() } : {}),
      ...(v.notes.trim() ? { notes: v.notes.trim() } : {}),
    }),
    submit: (ctx, body) => hrApi.createClearance(ctx.schoolId, body),
    itemLabel: (v) => clearanceKindLabel(v.kind),
    itemSub: (v) => `clearance · issued ${v.issuedOn || '—'}`,
    reviewPairs: (v, data) => [
      ['Member of staff', (data?.people ?? []).find((p) => p.id === v.personId)?.name ?? '—'],
      ['Kind', clearanceKindLabel(v.kind)],
      ['Issued on', orDash(v.issuedOn)],
      ['Expires on', v.expiresOn ? v.expiresOn : 'Does not expire'],
      ['Verified by', orDash(v.verifiedBy)],
      ['Notes', orDash(v.notes)],
    ],
  },

  // ═══════════════ HR · PROFESSIONAL DEVELOPMENT (AIC Phase K) ═══════════════
  // PARTICIPATION, NEVER SPEND. There is no cost field on this form because
  // there is no cost column on the register: one expensive conference for one
  // person would otherwise score as a healthy faculty.
  'hr.professionalDevelopment': {
    key: 'hr.professionalDevelopment',
    noun: 'PD record',
    nounPlural: 'PD records',
    Icon: GraduationCap,
    loaders: {
      // Filtered to the staff group on BOTH sides, exactly as the evaluation flow
      // does: the server accepts only a GovernancePerson of this school whose
      // `groups` contains 'staff'.
      people: (ctx) =>
        governancePeopleApi.list(ctx.schoolId, { group: 'staff' }).then((r) => {
          const list = Array.isArray(r.data) ? r.data : (r.data?.people ?? [])
          return list.filter((p) => (p.groups ?? []).includes('staff'))
        }),
    },
    gate: (data) =>
      data.people == null
        ? {
            title: 'We couldn’t load your people',
            body: 'These records attach to someone on your people register, which lives in the Governance module. Refresh and try again — and if Governance isn’t on your plan yet, that’s why.',
          }
        : data.people.length === 0
          ? {
              title: 'No one is in your Staff group yet',
              body: 'These records attach to a person on your people register. Add your staff in Governance first — we never keep a second copy of a person.',
            }
          : null,
    defaults: {
      personId: '',
      title: '',
      activityDate: '',
      category: 'instructional',
      hours: '',
      verified: false,
      notes: '',
    },
    steps: [
      {
        key: 'person',
        label: 'Person',
        title: 'First, who it’s for',
        blurb: 'From your existing people register — the same person, one record.',
        fields: [
          {
            key: 'personId',
            label: 'Member of staff',
            type: 'select',
            required: true,
            requiredMsg: 'Pick the member of staff',
            emptyOptionLabel: '— pick a person —',
            lookupKey: 'people',
            span: 2,
            options: (data) =>
              (data.people ?? []).map((p) => ({
                value: p.id,
                label: p.title ? `${p.name} — ${p.title}` : p.name,
              })),
          },
        ],
      },
      {
        key: 'activity',
        label: 'Activity',
        title: 'What they did, and when',
        blurb:
          'Participation is counted per person over the last twelve months. Hours are recorded for your own register and never score anything.',
        fields: [
          {
            key: 'title',
            label: 'Activity',
            type: 'text',
            required: true,
            requiredMsg: 'Name the activity',
            maxLength: 160,
            span: 2,
            placeholder: 'e.g. Orton-Gillingham Level 1',
          },
          {
            key: 'activityDate',
            label: 'Date',
            type: 'date',
            required: true,
            requiredMsg: 'Pick the date it happened',
          },
          {
            key: 'category',
            label: 'Category',
            type: 'select',
            options: PD_CATEGORIES.map((c) => ({ value: c, label: pdCategoryLabel(c) })),
          },
        ],
      },
      {
        key: 'evidence',
        label: 'Evidence',
        title: 'Hours and evidence',
        optional: true,
        blurb: 'Both are for your register. Neither changes the participation count.',
        fields: [
          { key: 'hours', label: 'Contact hours', type: 'number', min: 0, max: 9999 },
          { key: 'verified', label: 'Certificate sighted', type: 'checkbox' },
          { key: 'notes', label: 'Notes', type: 'textarea', rows: 3, maxLength: 2000, span: 2, fold: true },
        ],
      },
    ],
    // CreateProfessionalDevelopmentDto ✓ — and NO cost key, because none exists.
    toBody: (v) => ({
      personId: v.personId,
      title: v.title.trim(),
      activityDate: v.activityDate,
      category: v.category,
      ...(String(v.hours).trim() !== '' ? { hours: Number(v.hours) } : {}),
      verified: !!v.verified,
      ...(v.notes.trim() ? { notes: v.notes.trim() } : {}),
    }),
    submit: (ctx, body) => hrApi.createProfessionalDevelopment(ctx.schoolId, body),
    itemLabel: (v) => v.title.trim(),
    itemSub: (v) => `PD · ${pdCategoryLabel(v.category).toLowerCase()}`,
    reviewPairs: (v, data) => [
      ['Member of staff', (data?.people ?? []).find((p) => p.id === v.personId)?.name ?? '—'],
      ['Activity', orDash(v.title)],
      ['Date', orDash(v.activityDate)],
      ['Category', pdCategoryLabel(v.category)],
      ['Contact hours', orDash(String(v.hours))],
      ['Certificate sighted', v.verified ? 'Yes' : 'No'],
      ['Notes', orDash(v.notes)],
    ],
  },

  // ═══════════════ PLANNING · ENROLLMENT PLAN BY GRADE (Phase 6) ═════════════
  // The missing WRITER for PeriodOperationalData.plannedEnrollmentByGrade — a
  // sparse grade grid saved via the SAME operational partial PUT (the DTO field
  // is whitelisted; ZERO api change). Its total is plan source (2) for the
  // enrollment_vs_plan metric — the fallback when no driver budget exists.
  'planning.enrollment_plan': {
    key: 'planning.enrollment_plan',
    noun: 'enrollment plan',
    nounPlural: 'enrollment plans',
    Icon: GraduationCap,
    defaults: Object.fromEntries(GRADE_ROW.map((g) => [g, ''])),
    // The STORED plan grid, so a sparse edit MERGES instead of replacing (a
    // 10-grade plan re-opened to bump one grade must not collapse to 1 grade).
    // Never rejects: `ok:false` marks a failed read so the gate blocks the
    // editor rather than letting a save clobber a plan we couldn't see.
    loaders: {
      stored: (ctx) =>
        ctx.schoolId && ctx.periodId
          ? analyticsApi
              .operational(ctx.schoolId, ctx.periodId)
              .then((r) => ({ ok: true, grid: r.data?.plannedEnrollmentByGrade ?? null }))
              .catch(() => ({ ok: false, grid: null }))
          : Promise.resolve({ ok: true, grid: null }),
    },
    // Per-period write — same gate rationale as hr.staffing; PLUS fail-safe on a
    // stored-plan read error (merging against an unreadable grid = replace).
    gate: (data, ctx) => {
      if (!ctx.periodId) {
        return {
          title: 'No fiscal period yet',
          body: 'The enrollment plan attaches to a period — add one first: upload a trial balance from Finance → Add data.',
        }
      }
      if (data?.stored && !data.stored.ok) {
        return {
          title: 'Couldn’t load the stored plan',
          body: 'Editing without it could overwrite grades you already planned. Check your connection and reopen this flow.',
        }
      }
      return null
    },
    steps: [
      {
        key: 'plan',
        label: 'Plan by grade',
        title: 'Planned enrollment, grade by grade',
        blurb:
          'The headcount you’re planning for this period, per grade — leave a grade blank to keep what’s stored, enter 0 to clear one. If you’ve built a driver budget, its enrollment grid is the active plan — this grid is the fallback.',
        fields: GRADE_ROW.map((g) => ({
          key: g,
          label: DRIVER_GRADE_LABELS[g] ?? g,
          type: 'number',
          integer: true,
          min: 0,
          max: 100000,
          placeholder: '0',
        })),
      },
    ],
    // UpsertOperationalDto.plannedEnrollmentByGrade ✓ (EnrollmentByGradeDto keys
    // = GRADE_ROW). SPARSE EDIT: entered grades are MERGED onto the stored grid
    // (blank = keep stored, 0 = clear — the hr.staffing contract) because the
    // PUT replaces the whole object. The ONE key sent — the partial PUT can
    // never touch enrollment/aid/FTE fields.
    toBody: (v, data) => {
      const stored = data?.stored?.grid ?? null
      const grid = {}
      for (const g of GRADE_ROW) {
        const kept = Number(stored?.[g])
        if (Number.isFinite(kept)) grid[g] = kept
        const t = String(v[g] ?? '').trim()
        if (t !== '') grid[g] = Number(t)
      }
      return { plannedEnrollmentByGrade: grid }
    },
    submit: (ctx, body) => analyticsApi.saveOperational(ctx.schoolId, ctx.periodId, body),
    itemLabel: (v) => {
      let total = 0
      let grades = 0
      for (const g of GRADE_ROW) {
        const t = String(v[g] ?? '').trim()
        if (t !== '') {
          grades += 1
          total += Number(t)
        }
      }
      // "entered", not "planned" — untouched stored grades also count toward the
      // saved plan but aren't visible to this label (see reviewPairs for totals).
      return grades ? `Enrollment plan · ${total.toLocaleString()} students entered` : ''
    },
    itemSub: () => 'planned enrollment',
    reviewPairs: (v, data) => {
      const stored = data?.stored?.grid ?? null
      const pairs = GRADE_ROW.filter((g) => String(v[g] ?? '').trim() !== '').map((g) => [
        DRIVER_GRADE_LABELS[g] ?? g,
        String(Number(v[g])),
      ])
      // Merged saved-plan total (what the server will actually store): stored
      // grades survive unless overridden; only positive counts join the plan.
      let total = 0
      let kept = 0
      for (const g of GRADE_ROW) {
        const t = String(v[g] ?? '').trim()
        const storedN = Number(stored?.[g])
        if (t !== '') {
          total += Number(t)
        } else if (Number.isFinite(storedN)) {
          total += storedN
          kept += 1
        }
      }
      if (kept > 0) pairs.push(['Kept as stored', `${kept} grade${kept === 1 ? '' : 's'}`])
      pairs.push(['Total planned', total.toLocaleString()])
      return pairs
    },
  },
}
