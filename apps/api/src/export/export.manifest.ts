// ─────────────────────────────────────────────────────────────────────────────
// THE EXPORT MANIFEST — what "all of your data" actually means.
//
// This file answers a question a school's counsel will ask in procurement: if we
// leave, what exactly do we get? The answer has to be complete and it has to be
// checkable, so the list is DATA rather than sixty-nine hand-written queries,
// and `export.manifest.spec.ts` fails the build if a tenant-scoped model is
// added to the schema and not accounted for here.
//
// That guard is the point. An export that silently omits a table is worse than
// no export at all: the school believes it holds everything, deletes its
// account, and discovers the gap when the data is gone.
//
// TWO KINDS OF EXCLUSION, and the difference matters:
//   • `omit` — the row is exported, minus specific columns. Used for CREDENTIALS
//     (OAuth refresh tokens, invitation tokens). Those are not the school's
//     data; they are keys to other people's systems that we hold on the school's
//     behalf, and writing them into a zip that travels by email would be handing
//     out a QuickBooks session.
//   • `skip` — the whole table is left out, WITH A STATED REASON that is printed
//     into the archive's README. Nothing is omitted silently.
// ─────────────────────────────────────────────────────────────────────────────

export interface ExportTable {
  /** PrismaClient delegate name, e.g. 'assessmentResult'. */
  model: string
  /** Folder inside the archive. Grouped the way a school thinks, not the way the schema does. */
  folder: string
  /** File name without extension. */
  file: string
  /** Columns never written. Credentials and secrets only. */
  omit?: string[]
  /** Present = the table is deliberately not exported; the text is shown to the user. */
  skip?: string
}

/**
 * Every model carrying a schoolId. Folders are the school's mental model:
 * finance, enrollment, academics, governance, and so on — not Prisma's.
 */
export const EXPORT_TABLES: ExportTable[] = [
  // ── Finance ───────────────────────────────────────────────────────────────
  { model: 'fiscalPeriod', folder: 'finance', file: 'fiscal-periods' },
  { model: 'statementSnapshot', folder: 'finance', file: 'statement-snapshots' },
  { model: 'monthlySnapshot', folder: 'finance', file: 'monthly-snapshots' },
  { model: 'periodBudget', folder: 'finance', file: 'budgets' },
  { model: 'periodOperationalData', folder: 'finance', file: 'operational-data' },
  { model: 'periodInsight', folder: 'finance', file: 'insights' },
  { model: 'mapping', folder: 'finance', file: 'account-mappings' },
  { model: 'import', folder: 'finance', file: 'imports' },
  { model: 'arApAgingSnapshot', folder: 'finance', file: 'ar-ap-aging' },
  { model: 'cashFlowSnapshot', folder: 'finance', file: 'cash-flow-snapshots' },
  { model: 'cashProjectionRun', folder: 'finance', file: 'cash-projection-runs' },
  { model: 'cashAssumptions', folder: 'finance', file: 'cash-assumptions' },
  { model: 'cashSchedule', folder: 'finance', file: 'cash-schedules' },
  { model: 'cashCommitment', folder: 'finance', file: 'cash-commitments' },
  { model: 'cashFlowLineAdjustment', folder: 'finance', file: 'cash-flow-adjustments' },
  { model: 'capitalSchedule', folder: 'finance', file: 'capital-schedules' },
  { model: 'scholarshipDisbursement', folder: 'finance', file: 'scholarship-disbursements' },
  { model: 'vendor', folder: 'finance', file: 'vendors' },

  // ── Enrollment ────────────────────────────────────────────────────────────
  { model: 'student', folder: 'enrollment', file: 'students' },
  { model: 'enrollmentSnapshot', folder: 'enrollment', file: 'enrollment-snapshots' },
  { model: 'enrollmentImport', folder: 'enrollment', file: 'enrollment-imports' },
  {
    model: 'enrollmentSource',
    folder: 'enrollment',
    file: 'sis-connection',
    // Every key to the school's SIS. The spec beside this file caught these by
    // reading the schema — I had guessed the column names and got two wrong,
    // which would have shipped a live API secret inside a downloadable zip.
    omit: ['accessToken', 'refreshToken', 'apiKeyId', 'apiKeySecret', 'subscriptionKey'],
  },
  { model: 'schoolNameAlias', folder: 'enrollment', file: 'school-name-aliases' },

  // ── Academics ─────────────────────────────────────────────────────────────
  { model: 'assessmentResult', folder: 'academics', file: 'assessment-results' },
  { model: 'assessmentSchoolAggregate', folder: 'academics', file: 'assessment-school-averages' },
  { model: 'assessmentObjectiveAggregate', folder: 'academics', file: 'assessment-objectives' },
  { model: 'assessmentImport', folder: 'academics', file: 'assessment-imports' },
  { model: 'course', folder: 'academics', file: 'courses' },
  { model: 'gradeRecord', folder: 'academics', file: 'grade-records' },
  { model: 'lessonPlan', folder: 'academics', file: 'lesson-plans' },

  // ── Governance ────────────────────────────────────────────────────────────
  { model: 'governancePerson', folder: 'governance', file: 'people' },
  { model: 'committee', folder: 'governance', file: 'committees' },
  { model: 'committeeMembership', folder: 'governance', file: 'committee-memberships' },
  { model: 'meeting', folder: 'governance', file: 'meetings' },
  { model: 'policy', folder: 'governance', file: 'policies' },
  { model: 'clearance', folder: 'governance', file: 'clearances' },
  { model: 'professionalDevelopment', folder: 'governance', file: 'professional-development' },
  { model: 'staffEvaluation', folder: 'governance', file: 'staff-evaluations' },

  // ── Accreditation ─────────────────────────────────────────────────────────
  { model: 'accreditationStandard', folder: 'accreditation', file: 'standards' },
  // WS1/WS3 — the per-framework profile: division/seal choice, upgrade
  // provenance, and the six-year-cycle anchor. School-entered metadata → export.
  { model: 'accreditationFrameworkProfile', folder: 'accreditation', file: 'framework-profiles' },
  { model: 'accreditationEvidence', folder: 'accreditation', file: 'evidence' },
  { model: 'accreditationFinding', folder: 'accreditation', file: 'findings' },
  { model: 'accreditationReadinessSnapshot', folder: 'accreditation', file: 'readiness-snapshots' },
  { model: 'priorVisitFinding', folder: 'accreditation', file: 'prior-visit-findings' },
  { model: 'periodChecklistItem', folder: 'accreditation', file: 'checklist-items' },
  { model: 'periodComplianceInputs', folder: 'accreditation', file: 'compliance-inputs' },
  { model: 'periodCorrectiveAction', folder: 'accreditation', file: 'corrective-actions' },

  // ── Facilities ────────────────────────────────────────────────────────────
  { model: 'maintenanceItem', folder: 'facilities', file: 'maintenance-items' },
  { model: 'maintenanceBid', folder: 'facilities', file: 'maintenance-bids' },
  { model: 'facilitiesSetting', folder: 'facilities', file: 'settings' },

  // ── Advancement ───────────────────────────────────────────────────────────
  { model: 'advancementCampaign', folder: 'advancement', file: 'campaigns' },
  { model: 'advancementGift', folder: 'advancement', file: 'gifts' },

  // ── Strategy & improvement ────────────────────────────────────────────────
  { model: 'strategicPlan', folder: 'strategy', file: 'plans' },
  { model: 'strategyPillar', folder: 'strategy', file: 'pillars' },
  { model: 'strategyGoal', folder: 'strategy', file: 'goals' },
  { model: 'improvementInitiative', folder: 'strategy', file: 'initiatives' },
  { model: 'improvementProgressEvent', folder: 'strategy', file: 'progress-events' },

  // ── Documents & reporting ─────────────────────────────────────────────────
  { model: 'knowledgeDocument', folder: 'documents', file: 'document-index' },
  { model: 'boardReport', folder: 'reports', file: 'board-reports' },
  { model: 'reportSchedule', folder: 'reports', file: 'report-schedules' },
  { model: 'analyticsDashboard', folder: 'reports', file: 'saved-dashboards' },
  { model: 'campaignSchedule', folder: 'reports', file: 'campaign-schedules' },

  // ── Account & activity ────────────────────────────────────────────────────
  { model: 'task', folder: 'account', file: 'tasks' },
  { model: 'alert', folder: 'account', file: 'alerts' },
  { model: 'membership', folder: 'account', file: 'members' },
  { model: 'auditLog', folder: 'account', file: 'audit-log' },
  // NOTE: audit-log and members identify people by a bare userId. The service
  // writes an extra account/people.csv resolving those ids to the name and email
  // of the users who hold a membership at this school — without it both files
  // are columns of uuids and the audit trail is unreadable, which is the
  // opposite of what an audit trail is for.
  // The token is a live credential — anyone holding it can join the school.
  { model: 'invitation', folder: 'account', file: 'invitations', omit: ['token'] },

  // ── Deliberately excluded ─────────────────────────────────────────────────
  {
    model: 'qboConnection',
    folder: 'account',
    file: 'quickbooks-connection',
    skip:
      'Your QuickBooks connection holds OAuth tokens that are keys to Intuit, not data about your school. ' +
      'Exporting them would put live access to your accounting system in a downloadable file. Your accounting ' +
      'data itself is in the finance folder.',
  },
  {
    model: 'orgQboMapping',
    folder: 'account',
    file: 'quickbooks-mapping',
    skip: 'Configuration for the QuickBooks connection above, meaningless without it.',
  },
  {
    model: 'dataExport',
    folder: 'account',
    file: 'export-history',
    skip:
      'The record of your previous exports — job status and file sizes. It describes this archive rather than ' +
      'your school, so including it would only tell you that you asked for it.',
  },
  {
    model: 'subscription',
    folder: 'account',
    file: 'subscription',
    skip:
      'Your billing record is held with our payment processor and is available on request; it contains their ' +
      'identifiers rather than data about your school.',
  },
]

/** Tables actually written, in archive order. */
export const EXPORTED_TABLES = EXPORT_TABLES.filter((t) => !t.skip)
/** Tables deliberately left out, each with the reason shown to the user. */
export const SKIPPED_TABLES = EXPORT_TABLES.filter((t) => t.skip)
