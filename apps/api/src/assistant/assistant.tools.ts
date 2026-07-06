// Phase 4D+ — the assistant's tool registry (OpenAI function schemas fed to the
// LLM). All read-only except render_chart, which returns a spec the frontend draws.
// Handlers live in AssistantService (they need the injected data services).

// SINGLE SOURCE OF TRUTH for the interactive-walkthrough target keys. Used BOTH as
// the start_walkthrough `target` enum (below) AND as the runtime validator set in
// AssistantService (imported there) so the two can never drift. MUST stay byte-
// identical to the FE registry keys in apps/web/src/components/penny/guide/targetRegistry.js.
export const WALKTHROUGH_TARGET_KEYS = [
  'nav.home',
  'nav.data',
  'nav.statements',
  'nav.analytics',
  'nav.budget',
  'nav.reports',
  'nav.readiness',
  'nav.settings',
  'dataHub.trialBalanceCard',
  'dataHub.monthlyCard',
  'dataHub.operationalCard',
  'dataHub.budgetCard',
  'dataHub.forecastCard',
  'dataHub.schedulesCard',
  'dataHub.complianceCard',
  'dataHub.tourButton',
  'dataHub.periodSelect',
  'trialBalance.uploadDrop',
  'trialBalance.saveButton',
  'budget.setupPanel',
  'budget.saveButton',
  'forecast.workspace',
  'forecast.feederInput',
  'budgetPage.tabBar',
  'analytics.aiInsight',
  'analytics.customizeBar',
  'reports.boardReportCard',
  'reports.generateButton',
  'schedules.capitalTab',
  'readiness.capPanel',
  'metric.operating_margin',
  'metric.days_cash_on_hand',
  'metric.months_operating_reserve',
  'metric.tuition_dependency',
  'metric.cost_per_pupil',
  'metric.net_tuition_per_student',
  'metric.financial_aid_per_student',
  'metric.aid_per_aided_student',
  'metric.tuition_discount_rate',
  'metric.pct_students_on_aid',
] as const

export const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'list_periods',
      description:
        "List this school's fiscal periods (id, label, end date, and whether statements have been generated). Use this to find the period a question refers to.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_metrics',
      description:
        'Financial KPIs for a period: operating margin, days cash on hand, months of operating reserve, tuition dependency, cost per pupil, net tuition per student, revenue/expense mix (with category breakdown), each with value, unit, health status, and change vs. the prior period.',
      parameters: {
        type: 'object',
        properties: {
          periodId: { type: 'string', description: 'Fiscal period id; omit to use the current period.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_compliance',
      description:
        'AUP scholarship-compliance findings for a period: counts of material/reportable exceptions and the list of flagged findings with status and statute citation.',
      parameters: {
        type: 'object',
        properties: { periodId: { type: 'string' } },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_reconciliation',
      description:
        'Scholarship reconciliation for a period: total disbursed (funding org) vs. recorded scholarship revenue, the variance, and the status (matched / variance / needs data).',
      parameters: {
        type: 'object',
        properties: { periodId: { type: 'string' } },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_budget_vs_actual',
      description:
        'Budget vs. actual for a period: budgeted revenue/expenses by category and the actuals, with variances.',
      parameters: {
        type: 'object',
        properties: { periodId: { type: 'string' } },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_trend',
      description:
        "A metric's value across all of the school's periods (a time series), for trend questions. Example metricKey values: operating_margin, days_cash_on_hand, months_operating_reserve, tuition_dependency, cost_per_pupil.",
      parameters: {
        type: 'object',
        properties: { metricKey: { type: 'string' } },
        required: ['metricKey'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_corrective_action_plan',
      description:
        'The corrective action plan for a period: each entry’s ruleId, title, severity, status, and current/suggested root cause + corrective action. Use this to find the ruleId before drafting an entry.',
      parameters: {
        type: 'object',
        properties: { periodId: { type: 'string' } },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_budget',
      description:
        'APPLY a budget change immediately, then tell the user what changed (reversible in the UI). Set a single category line (categoryKey + categoryType + amount) and/or the top-line totalRevenue/totalExpenses for a period.',
      parameters: {
        type: 'object',
        properties: {
          periodId: { type: 'string' },
          categoryKey: { type: 'string', description: 'Budget line key, e.g. tuition.' },
          categoryType: { type: 'string', enum: ['revenue', 'expense'] },
          amount: { type: 'number' },
          totalRevenue: { type: 'number' },
          totalExpenses: { type: 'number' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'draft_cap_entry',
      description:
        'APPLY a corrective-action-plan entry immediately, then tell the user what changed (reversible in the UI). Provide the ruleId (from get_corrective_action_plan) and the fields to fill.',
      parameters: {
        type: 'object',
        properties: {
          periodId: { type: 'string' },
          ruleId: { type: 'string' },
          rootCause: { type: 'string' },
          correctiveAction: { type: 'string' },
          responsibleParty: { type: 'string' },
          targetDate: { type: 'string', description: 'YYYY-MM-DD' },
          status: { type: 'string', enum: ['open', 'in_progress', 'complete'] },
        },
        required: ['ruleId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_budget',
      description:
        "The current saved BUDGET PLAN for a period (not actuals): where it came from (imported monthly spread, driver model, or manual), budgeted revenue/expense by category, totals, surplus/(deficit), and — if a driver model was applied — its assumptions and KPIs (enrollment, cost per pupil, net tuition per student).",
      parameters: {
        type: 'object',
        properties: { periodId: { type: 'string' } },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_budget_rollup',
      description:
        "The organization-wide CONSOLIDATED budget across every school in this organization the user can see: each school's budgeted revenue/expense and the consolidated category totals for the fiscal year. Use for 'across your organization' / 'all our schools' budget questions.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_schools_status',
      description:
        "Organization-wide status roster across every school in this organization the user oversees — which schools have reported (current trial balance + statements) vs are BEHIND (notReported), and each school's count of critical/warn attention items. Use for cross-school questions like 'which schools are behind on their trial balance' or 'which schools need attention'.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'apply_driver_budget',
      description:
        'APPLY a budget built from driver assumptions immediately, then tell the user what changed (reversible in the UI). Provide ONLY the levers the user mentioned; everything else keeps its current value. Enrollment drives tuition; staffing drives salaries; other lines grow from last year by inflationPct.',
      parameters: {
        type: 'object',
        properties: {
          periodId: { type: 'string' },
          enrollmentTotal: {
            type: 'number',
            description: 'Total students; spread evenly across grades. Use this OR enrollmentByGrade.',
          },
          enrollmentByGrade: {
            type: 'object',
            description: 'Students per grade, e.g. {"K":50,"1":48}. Keys: PK3, PK4, K, 1–12.',
          },
          tuitionRates: {
            type: 'object',
            description: 'Annual tuition by band: {prek3, prek5, elem, middle}.',
          },
          tuitionProgramSplit: {
            type: 'object',
            description: 'How tuition is paid, summing to 100: {parent, ftc, fes}.',
          },
          feePerStudent: { type: 'number' },
          staffing: {
            type: 'object',
            description:
              '{teachers:{count,avgSalary}, admin:{count,avgSalary}, facilities:{count,avgSalary}, benefitsPct}.',
          },
          inflationPct: { type: 'number', description: 'Growth % applied to all non-driver lines.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_board_report',
      description:
        "The current Board Report (NBOA-style finance-committee packet) for a period: title/committee settings, the MD&A narrative + source, the budget-vs-actual operations variances (revenue/expense lines with budget/variance/explanation, totals, net surplus), and the key indicators. Read-only.",
      parameters: {
        type: 'object',
        properties: { periodId: { type: 'string' } },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_board_narrative',
      description:
        'Draft the Management Discussion & Analysis (MD&A) narrative for a period from its real financials (rule baseline, optionally upgraded by the LLM). Returns the text only — it does NOT save it; the user reviews/edits, then saves.',
      parameters: {
        type: 'object',
        properties: {
          periodId: { type: 'string' },
          tone: { type: 'string', enum: ['concise', 'standard', 'detailed'] },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_explanation',
      description:
        'APPLY a per-line variance explanation/comment for the Board Report immediately, then tell the user what changed (reversible in the UI). Provide the period, the category type (revenue or expense), the category key (e.g. tuition, instructional), and the explanation text.',
      parameters: {
        type: 'object',
        properties: {
          periodId: { type: 'string' },
          categoryType: { type: 'string', enum: ['revenue', 'expense'] },
          categoryKey: { type: 'string', description: 'Budget line key, e.g. tuition or instructional.' },
          text: { type: 'string' },
        },
        required: ['categoryType', 'categoryKey', 'text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_forecast',
      description:
        "The current saved FY-END FORECAST for a period (an assumption-driven re-projection, NOT actuals-to-date): whether one exists, its projected revenue/expense KPIs, the largest forecast-vs-budget variances, the anticipated feeder enrollment total, and the assumptions summary. Read-only. Call this (and get_budget) before proposing a forecast change.",
      parameters: {
        type: 'object',
        properties: { periodId: { type: 'string' } },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'apply_forecast',
      description:
        'APPLY a recomputed FY-end forecast immediately from revised driver assumptions plus anticipated feeder enrollment, then tell the user what changed (reversible in the UI). Provide ONLY the levers the user mentioned; everything else keeps the saved forecast / driver values. feederEnrollmentByGrade is anticipated INCOMING students ADDED ON TOP of projected enrollment, which raises projected tuition. The result is compared to the active budget for variance.',
      parameters: {
        type: 'object',
        properties: {
          periodId: { type: 'string' },
          enrollmentTotal: {
            type: 'number',
            description: 'Total base students; spread evenly across grades. Use this OR enrollmentByGrade.',
          },
          enrollmentByGrade: {
            type: 'object',
            description: 'Base students per grade, e.g. {"K":50,"1":48}. Keys: PK3, PK4, K, 1–12.',
          },
          tuitionRates: {
            type: 'object',
            description: 'Annual tuition by band: {prek3, prek5, elem, middle}.',
          },
          tuitionProgramSplit: {
            type: 'object',
            description: 'How tuition is paid, summing to 100: {parent, ftc, fes}.',
          },
          feePerStudent: { type: 'number' },
          staffing: {
            type: 'object',
            description:
              '{teachers:{count,avgSalary}, admin:{count,avgSalary}, facilities:{count,avgSalary}, benefitsPct}.',
          },
          inflationPct: { type: 'number', description: 'Growth % applied to all non-driver lines.' },
          feederEnrollmentByGrade: {
            type: 'object',
            description:
              'Anticipated INCOMING (net-new) students per grade, e.g. {"PK4":12,"K":8}. Added ON TOP of the base enrollment to drive forecast tuition. Keys: PK3, PK4, K, 1–12.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_feeder_enrollment',
      description:
        'APPLY the anticipated feeder enrollment (net-new incoming students by grade) for a period immediately, then tell the user what changed (reversible in the UI). This sets the INPUT only; run apply_forecast afterwards to re-project the forecast tuition from it.',
      parameters: {
        type: 'object',
        properties: {
          periodId: { type: 'string' },
          feederEnrollmentByGrade: {
            type: 'object',
            description: 'Incoming students per grade, e.g. {"PK4":12,"K":8}. Keys: PK3, PK4, K, 1–12.',
          },
        },
        required: ['feederEnrollmentByGrade'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_capital_schedule',
      description:
        'The Capital Budget Summary for a period: capital projects grouped (prior-year rollover/construction vs current-year), each with actual YTD, budget, and over/(under), plus group subtotals and the capital grand total. Read-only.',
      parameters: {
        type: 'object',
        properties: { periodId: { type: 'string' } },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_cash_schedule',
      description:
        'The Cash & Investments Summary for a period: bank/investment accounts grouped by restriction (unrestricted / temporarily / permanently restricted) with balances, insured vs uninsured portions, vehicle, maturity, and rate, plus subtotals, grand total, and total insured/uninsured. Read-only.',
      parameters: {
        type: 'object',
        properties: { periodId: { type: 'string' } },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_campaign_schedule',
      description:
        'The Capital Campaign tracker for a period: line items grouped by free-text division, each with original Budget, current Estimate, and Difference to Budget (budget − estimate; positive = under budget/favorable), plus group subtotals and the campaign total. Read-only.',
      parameters: {
        type: 'object',
        properties: { periodId: { type: 'string' } },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_import_trial_balance',
      description:
        'IMPORT the attached trial balance now; summarize the parsed rows (period, account count, net) for the user. Pass the attachmentId shown in the attachment digest. The server already holds the fully parsed account rows — NEVER retype or fabricate them. Optionally set the role (cy = current year, py = prior year, audit = audited) and a label. If the digest shows the period is INFERRED/unconfirmed (or the import reports it could not determine the period), ASK the user for the period-ending date and pass it as periodEndDate — do not guess.',
      parameters: {
        type: 'object',
        properties: {
          attachmentId: {
            type: 'string',
            description: 'The attachmentId from the attachment digest for the spreadsheet to import.',
          },
          role: {
            type: 'string',
            enum: ['cy', 'py', 'audit'],
            description: 'Which slot to import into. Defaults to cy (current year).',
          },
          periodEndDate: {
            type: 'string',
            description:
              "The period-ending date as YYYY-MM-DD (e.g. a June-30 fiscal-year end). ONLY pass this when the file's period couldn't be read and the USER has told you the date/fiscal year — never a guess of your own.",
          },
          label: { type: 'string', description: 'Optional period label, e.g. "FY2025".' },
        },
        required: ['attachmentId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'import_monthly_actuals',
      description:
        'IMPORT an attached MONTHLY (as-of month-end, cumulative YTD) trial balance now, storing it as that month’s actuals; then summarize what you imported (month, account count, net). Use this — NOT propose_import_trial_balance — for a sheet the digest marks as MONTHLY (isMonthly / monthKey). A multi-sheet workbook lists one attachmentId per sheet; call this ONCE PER MONTH with that sheet’s attachmentId. The server already holds the fully parsed account rows — NEVER retype or fabricate them. monthKey (YYYY-MM) is taken from the sheet automatically; pass it ONLY to override an undetected month.',
      parameters: {
        type: 'object',
        properties: {
          attachmentId: {
            type: 'string',
            description: 'The attachmentId from the attachment digest for the monthly sheet to import.',
          },
          monthKey: {
            type: 'string',
            description: 'YYYY-MM of the month this sheet represents. Omit to use the month detected from the sheet.',
          },
        },
        required: ['attachmentId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_task',
      description:
        'PROPOSE a new workflow Task for the user to CONFIRM before it is created (like drafting a corrective action — this does NOT create the task itself; the user must confirm). Use when the user asks to create or assign a task, or to "turn this into a task / make a task for the chair to review this" off a briefing or governance attention item — pull the title and source from the referenced item. assignee is "me" (the current user), a school member’s email address, or omitted (unassigned); it can ONLY be an active member of this school. dueDate is yyyy-mm-dd — only pass one the user actually stated; never invent one. Task, not period-scoped.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Short task title, e.g. "Review overdue conflict-of-interest policy".',
          },
          dueDate: {
            type: 'string',
            description: 'YYYY-MM-DD; when the task is due. Omit unless the user stated one.',
          },
          assignee: {
            type: 'string',
            description:
              'Who to assign to: "me" for the current user, or a school member’s email address. Omit to leave unassigned.',
          },
          priority: { type: 'string', enum: ['low', 'normal', 'high'] },
          sourceType: {
            type: 'string',
            enum: ['manual', 'policy', 'metric', 'compliance'],
            description:
              'The kind of item this task came from (from a briefing/governance item). Defaults to manual.',
          },
          sourceRef: {
            type: 'string',
            description:
              'The id of the source item (e.g. the policy id or briefing item id) for the deep-link back.',
          },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'file_document',
      description:
        'PROPOSE filing an attached document into one of the school’s modules for the user to CONFIRM before it is stored (like drafting a task — this does NOT file it; the user must confirm). Use ONLY when the user attached a document and wants to save/file it. CLASSIFY where the document belongs across four destinations and set `destination` accordingly: a fire-safety / boiler / HVAC / building inspection or facilities report → "facilities"; an accreditation self-study or evidence artifact → "accreditation"; board minutes, bylaws, or a policy → "governance"; anything else (general reference, finance, contracts, etc.) → "knowledge". Also set `confidence` (0–100) and a short one-line `rationale` explaining WHY that destination. Default `destination` to "knowledge" when unsure. Still suggest a clear `title` plus domain `tags`. Pass the attachmentId shown in the attachment digest — the server holds the file bytes, so NEVER retype the file. sourceType defaults to manual; set a non-manual sourceType + sourceRef ONLY when the user names a specific in-school entity (a policy, board report, standard, campaign, or maintenance item) to link it to.',
      parameters: {
        type: 'object',
        properties: {
          attachmentId: {
            type: 'string',
            description: 'The attachmentId from the attachment digest for the file to file.',
          },
          title: {
            type: 'string',
            description: 'Short document title, e.g. "FY2026 Conflict-of-Interest Policy".',
          },
          destination: {
            type: 'string',
            enum: ['knowledge', 'facilities', 'accreditation', 'governance'],
            description:
              'Which module this document belongs in. facilities = inspections / building reports; accreditation = self-study / evidence; governance = board minutes / policies; knowledge = everything else. Defaults to knowledge.',
          },
          confidence: {
            type: 'number',
            description: 'How confident the destination is, 0–100.',
          },
          rationale: {
            type: 'string',
            description: 'One short line explaining WHY this destination (≤400 chars).',
          },
          description: { type: 'string', description: 'Optional one-line description.' },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Domain tags, e.g. ["governance","compliance"].',
          },
          sourceType: {
            type: 'string',
            enum: ['manual', 'policy', 'board_report', 'standard', 'campaign', 'maintenance'],
            description: 'Domain this doc links FROM. Defaults to manual (standalone).',
          },
          sourceRef: {
            type: 'string',
            description: 'UUID of the linked in-school entity — ONLY when sourceType is not manual.',
          },
        },
        required: ['attachmentId', 'title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_policy',
      description:
        'PROPOSE a new governance Policy for the user to CONFIRM before it is created (like create_task — this does NOT create it; the user must confirm). Use when the user asks to add/file a policy to the Policy Register, or to turn a briefing/governance attention item (e.g. a missing or overdue policy) into a real record — pull the title and category from the referenced item. category is FREE TEXT (e.g. "board", "finance", "hr"). status defaults to active. Dates are yyyy-mm-dd; only pass ones the user stated. Policy, not period-scoped.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Policy title, e.g. "Conflict of Interest".' },
          category: { type: 'string', description: 'Free-text category, e.g. "board" or "finance".' },
          status: { type: 'string', enum: ['active', 'draft', 'retired'] },
          owner: { type: 'string', description: 'Who owns/maintains the policy. Omit if unknown.' },
          adoptedDate: { type: 'string', description: 'YYYY-MM-DD; when adopted. Omit unless stated.' },
          reviewIntervalMonths: {
            type: 'number',
            description: 'How often it is reviewed, in months (1–120). Defaults to 12.',
          },
          notes: { type: 'string', description: 'Optional notes.' },
        },
        required: ['title', 'category'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_committee',
      description:
        'PROPOSE a new governance Committee for the user to CONFIRM before it is created (this does NOT create it; the user must confirm). Use when the user asks to add a committee to the Governance register. kind is FREE TEXT (e.g. "board", "finance", "advancement"). Committee, not period-scoped.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Committee name, e.g. "Finance Committee".' },
          kind: { type: 'string', description: 'Free-text kind, e.g. "board" or "finance".' },
          chair: { type: 'string', description: 'Who chairs the committee. Omit if unknown.' },
          description: { type: 'string', description: 'Optional one- or two-line description.' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_meeting',
      description:
        'PROPOSE a new governance Meeting for the user to CONFIRM before it is created (this does NOT create it; the user must confirm). Use when the user asks to schedule/log a board or committee meeting. Pass committeeId (a uuid) ONLY when the user names a committee you have already resolved; the server verifies it belongs to this school. scheduledAt is yyyy-mm-dd. Meeting, not period-scoped.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Meeting title, e.g. "Q1 Board Meeting".' },
          scheduledAt: { type: 'string', description: 'YYYY-MM-DD; the meeting date. Required.' },
          committeeId: {
            type: 'string',
            description: 'UUID of the committee this meeting belongs to. Omit if standalone.',
          },
          location: { type: 'string', description: 'Where it is held. Omit if unknown.' },
          agenda: { type: 'string', description: 'Optional agenda text.' },
        },
        required: ['title', 'scheduledAt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_standard',
      description:
        'PROPOSE a new accreditation Standard for the user to CONFIRM before it is created (this does NOT create it; the user must confirm). Use when the user asks to add a standard to the Accreditation register. code and category are FREE TEXT (schools name their own framework codes/domains). reviewDate is yyyy-mm-dd. Standard, not period-scoped.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Framework code, e.g. "1.2" or "GOV-3".' },
          title: { type: 'string', description: 'Standard title.' },
          category: { type: 'string', description: 'Free-text domain, e.g. "governance". Omit if unknown.' },
          reviewDate: { type: 'string', description: 'YYYY-MM-DD; next review. Omit unless stated.' },
          owner: { type: 'string', description: 'Who owns this standard. Omit if unknown.' },
          notes: { type: 'string', description: 'Optional notes.' },
        },
        required: ['code', 'title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_maintenance_item',
      description:
        'PROPOSE a new facilities deferred-maintenance item for the user to CONFIRM before it is created (this does NOT create it; the user must confirm). Use when the user asks to log a maintenance/repair item to the Facilities register. category and location are FREE TEXT. targetDate is yyyy-mm-dd. Maintenance item, not period-scoped.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Item title, e.g. "Replace HVAC compressor".' },
          location: { type: 'string', description: 'Where, e.g. "Gym roof". Omit if unknown.' },
          category: { type: 'string', description: 'Free-text category, e.g. "HVAC". Omit if unknown.' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          estimatedCost: { type: 'number', description: 'Estimated cost in USD. Omit if unknown.' },
          targetDate: { type: 'string', description: 'YYYY-MM-DD; target completion. Omit unless stated.' },
          notes: { type: 'string', description: 'Optional notes.' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_campaign',
      description:
        'PROPOSE a new advancement fundraising Campaign for the user to CONFIRM before it is created (this does NOT create it; the user must confirm). Use when the user asks to add a campaign to the Advancement register. campaignType is FREE TEXT (e.g. "annual", "capital"). closeDate is yyyy-mm-dd. Campaign, not period-scoped.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Campaign name, e.g. "2026 Annual Fund".' },
          campaignType: { type: 'string', description: 'Free-text type, e.g. "annual" or "capital".' },
          goalAmount: { type: 'number', description: 'Fundraising goal in USD. Omit if unknown.' },
          closeDate: { type: 'string', description: 'YYYY-MM-DD; when the campaign closes. Omit unless stated.' },
          notes: { type: 'string', description: 'Optional notes.' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_alert',
      description:
        'PROPOSE a standing alert / proactive request for the user to CONFIRM before it is created (like create_task — this does NOT create it; the user must confirm). Use when the user asks to be notified/emailed on a schedule or when a metric crosses a line, e.g. "email me a cash summary every Monday" or "alert me if days-cash drops below 30". Set type="digest" for a recurring email summary (also set cadence: daily/weekly/monthly), OR type="threshold" for a metric watch (also set metricKey, operator lt/gt, and a numeric threshold). Valid metricKey values: operating_margin, days_cash_on_hand, months_operating_reserve, tuition_dependency, cost_per_pupil, net_tuition_per_student, financial_aid_per_student, aid_per_aided_student, tuition_discount_rate, pct_students_on_aid, enrollment_change_yoy, student_teacher_ratio. Threshold is the raw metric value (a percent like operating_margin is a whole number, e.g. 5 for 5%; days/months/currency are their own units). The email goes to the current user by default. Alert, not period-scoped.',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['digest', 'threshold'],
            description: 'digest = scheduled email summary; threshold = metric-crossing watch.',
          },
          cadence: {
            type: 'string',
            enum: ['daily', 'weekly', 'monthly'],
            description: 'For a digest: how often to email. Defaults to weekly.',
          },
          metricKey: {
            type: 'string',
            description: 'For a threshold: which metric to watch, e.g. days_cash_on_hand.',
          },
          operator: {
            type: 'string',
            enum: ['lt', 'gt'],
            description: 'For a threshold: lt = alert when below, gt = alert when above.',
          },
          threshold: {
            type: 'number',
            description: 'For a threshold: the raw metric value to compare against, e.g. 30.',
          },
          label: { type: 'string', description: 'Optional short label for the alert.' },
        },
        required: ['type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'invite_member',
      description:
        'PROPOSE inviting a teammate to this school by email (they receive an email invitation) for the user to CONFIRM before it is sent (like create_task — this does NOT send it; the user must confirm). Use when the user wants to add a member — e.g. someone to assign tasks to when the school has no suitable member yet. Ask for the person’s email and role if not given. role is one of owner/accountant/viewer (accountant = finance edit access; viewer = board / read-only). Set orgWide=true ONLY if the user explicitly wants the person on every school in the organization. OWNER-ONLY: only a school owner can invite members.',
      parameters: {
        type: 'object',
        properties: {
          email: { type: 'string', description: 'The teammate’s email address.' },
          role: {
            type: 'string',
            enum: ['owner', 'accountant', 'viewer'],
            description:
              'Membership role: owner, accountant (finance edit), or viewer (board / read-only).',
          },
          orgWide: {
            type: 'boolean',
            description:
              'True = access to EVERY school in the organization (multi-school orgs only). Omit/false = this school only.',
          },
        },
        required: ['email', 'role'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'render_chart',
      description:
        'Draw a chart for the user. Call this to visualize numbers you have already fetched (a trend, a comparison, a breakdown). Pick the chart type that fits and give a clear title.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          chartType: { type: 'string', enum: ['bar', 'line', 'pie'] },
          data: {
            type: 'array',
            description: 'The data points to plot.',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                value: { type: 'number' },
              },
              required: ['label', 'value'],
            },
          },
        },
        required: ['title', 'chartType', 'data'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'navigate_to_page',
      description:
        'Move the user to a whole PAGE, Data-hub modal, or Settings section (no pointing). Read-only — changes no data. Use this ONLY when the destination is a page in general, NOT a specific control. If the user asks WHERE a specific metric/button/field is, or to SHOW / POINT OUT / GO TO a specific item that has a target key, use start_walkthrough instead (it both navigates AND glides Penny to the exact element). Do not use navigate_to_page to "show" a specific metric.',
      parameters: {
        type: 'object',
        properties: {
          page: {
            type: 'string',
            enum: [
              'home',
              'data',
              'statements',
              'analytics',
              'budget',
              'readiness',
              'reports',
              'schedules',
              'settings',
            ],
            description: 'Which page to open.',
          },
          section: {
            type: 'string',
            enum: [
              'account',
              'members',
              'school',
              'organization',
              'reports',
              'integrations',
              'billing',
            ],
            description: 'Only when page is settings: which settings section to open.',
          },
          openModal: {
            type: 'string',
            enum: [
              'trialBalances',
              'monthly',
              'operational',
              'budget',
              'forecast',
              'schedules',
              'compliance',
            ],
            description: 'Only when page is data: which Data-hub modal to open.',
          },
        },
        required: ['page'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'start_walkthrough',
      description:
        'Make Penny physically glide to a specific on-screen control and point it out. THIS IS THE TOOL for "where is X?", "show me X", "point out X", "take me to the X metric/button" — give it a SINGLE step targeting that element (it auto-navigates to the right page/modal first, then glides). Also use it for multi-step "walk me through …" processes (an ORDERED list of steps). Each step: a target key (allowed keys only — incl. metric.* for analytics KPIs like metric.net_tuition_per_student), a short message, and optionally a page / Data-hub modal to open first. Prefer this over navigate_to_page whenever a matching target key exists.',
      parameters: {
        type: 'object',
        properties: {
          steps: {
            type: 'array',
            minItems: 1,
            maxItems: 8,
            description: 'Ordered walkthrough steps; Penny glides to each target in turn.',
            items: {
              type: 'object',
              properties: {
                target: {
                  type: 'string',
                  enum: WALKTHROUGH_TARGET_KEYS,
                  description:
                    'The control Penny glides to. Use only these provided keys. The metric.* keys point at a specific analytics KPI tile on the Analytics page.',
                },
                message: {
                  type: 'string',
                  description: 'What Penny says at this step (one or two short sentences).',
                },
                page: {
                  type: 'string',
                  enum: [
                    'home',
                    'data',
                    'statements',
                    'analytics',
                    'budget',
                    'readiness',
                    'reports',
                    'schedules',
                    'settings',
                  ],
                  description: 'Optional: navigate to this page before this step.',
                },
                openModal: {
                  type: 'string',
                  enum: [
                    'trialBalances',
                    'monthly',
                    'operational',
                    'budget',
                    'forecast',
                    'schedules',
                    'compliance',
                  ],
                  description: 'Optional (only with page=data): open this Data-hub modal first.',
                },
              },
              required: ['target', 'message'],
            },
          },
        },
        required: ['steps'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_open_tasks',
      description:
        "List this school's OPEN and in-progress workflow tasks (read-only) so you can resolve a task the user names into its taskId BEFORE calling submit_for_approval or decide_approval. Returns each task's id, title, status, approvalStatus, and the current designated approver's email (or null). Always call this first when the user refers to a task by name.",
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'submit_for_approval',
      description:
        'PROPOSE routing an existing task to one or more approvers for sign-off, for the user to CONFIRM (this does NOT submit until the user confirms). approvers is an ORDERED list of "me" (the current user) and/or school-member email addresses — sign-off happens in that order (step 1, then 2, …). Resolve the task the user names to its taskId first via list_open_tasks. Each approver must be an active member of this school.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'The task id (uuid) to route for approval.' },
          approvers: {
            type: 'array',
            items: { type: 'string' },
            description: 'Ordered approvers: "me" or member email addresses. One or more.',
          },
        },
        required: ['taskId', 'approvers'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'decide_approval',
      description:
        'PROPOSE recording YOUR approval decision on a task awaiting your sign-off, for you to CONFIRM (this does NOT record until you confirm). You may only decide a task where YOU are the current designated approver — the server enforces this (403 otherwise). decision is "approve" or "reject"; note is an optional rationale.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'The task id (uuid) to decide.' },
          decision: { type: 'string', enum: ['approve', 'reject'] },
          note: { type: 'string', description: 'Optional decision rationale.' },
        },
        required: ['taskId', 'decision'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_briefing',
      description:
        "The prioritised attention briefing for a period — the SAME ranked, plain-language list the Home screen shows the user: everything that needs their decision right now (off-band financial metrics, AUP readiness/compliance gaps, scholarship reconciliation variance, open corrective actions, or data-not-yet-generated). Returns summary counts (total / critical / warn / info) and an ORDERED items[] already sorted critical→warn→info and lens-shaped for the caller's role: each item has severity, source (metric|compliance|data), title, why (a plain-language reason), an optional metricKey/value, a client link (deep-link route), an optional dueDate, and a voice tone hint. Call this FIRST when the user says 'brief me', 'what needs my attention', 'good morning', or asks broadly 'how are we doing', then narrate the items in order and offer to act on them. The list is already role-correct and complete; read-only, and NEVER invent, add, drop, or re-rank items beyond what this returns.",
      parameters: {
        type: 'object',
        properties: {
          periodId: { type: 'string', description: 'Fiscal period id; omit to use the current period.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_account_transactions',
      description:
        'The actual QuickBooks transactions behind a computed figure — answers "what\'s in this number?". ' +
        "Give a statement line (statement SOA|SFP + lineKey like 'tuition'/'instructional', variant cy|py|audit) " +
        'OR a metricKey (e.g. net_tuition_per_student). Returns each transaction\'s date, type, payee, and amount, ' +
        'plus a reconciliation of the transactions to the line total (whether they tie, and any opening-balance plug). ' +
        'ONLY works when the period was synced from QuickBooks — it is QuickBooks-only. Ratios and calculated subtotals ' +
        'are NOT drillable (it says so, and names the component lines to drill instead). ' +
        'State ONLY the figures this tool returns — never invent a transaction or amount.',
      parameters: {
        type: 'object',
        properties: {
          periodId: { type: 'string', description: 'Fiscal period id; omit to use the current period.' },
          statement: { type: 'string', enum: ['SOA', 'SFP'] },
          lineKey: {
            type: 'string',
            description: "Statement line key, e.g. tuition, instructional, cash.",
          },
          variant: { type: 'string', enum: ['cy', 'py', 'audit'], description: 'Which column; defaults cy.' },
          metricKey: {
            type: 'string',
            description: 'Use INSTEAD of statement/lineKey to drill a dollar metric.',
          },
          limit: { type: 'number', description: 'Max transactions to return (default 15 for chat).' },
        },
        required: [],
      },
    },
  },
]

/** Status-line labels shown while a tool runs (present tense; agentic). */
export const TOOL_LABELS: Record<string, string> = {
  list_periods: 'Looking up periods…',
  get_metrics: 'Reading the financial metrics…',
  get_compliance: 'Checking compliance findings…',
  get_reconciliation: 'Reviewing the reconciliation…',
  get_budget_vs_actual: 'Pulling budget vs. actual…',
  get_budget: 'Reading the budget…',
  get_budget_rollup: 'Consolidating your organization budget…',
  list_schools_status: "Checking all schools' status…",
  get_corrective_action_plan: 'Reading the corrective action plan…',
  get_trend: 'Loading the trend…',
  set_budget: 'Setting the budget…',
  apply_driver_budget: 'Building the driver budget…',
  draft_cap_entry: 'Logging a corrective action…',
  create_task: 'Drafting a task…',
  file_document: 'Filing the document…',
  create_policy: 'Filing a policy…',
  create_committee: 'Setting up a committee…',
  create_meeting: 'Scheduling a meeting…',
  create_standard: 'Adding a standard…',
  create_maintenance_item: 'Logging a maintenance item…',
  create_campaign: 'Starting a campaign…',
  create_alert: 'Setting up an alert…',
  invite_member: 'Inviting a teammate…',
  list_open_tasks: 'Reading your open tasks…',
  submit_for_approval: 'Routing for sign-off…',
  decide_approval: 'Recording your decision…',
  get_board_report: 'Reading the board report…',
  generate_board_narrative: 'Drafting the board narrative…',
  set_explanation: 'Saving the explanation…',
  get_forecast: 'Reading the FY-end forecast…',
  get_capital_schedule: 'Reading the capital budget…',
  get_cash_schedule: 'Reading cash & investments…',
  get_campaign_schedule: 'Reading the capital campaign…',
  apply_forecast: 'Updating the forecast…',
  set_feeder_enrollment: 'Updating feeder enrollment…',
  propose_import_trial_balance: 'Importing the trial balance…',
  import_monthly_actuals: 'Importing the monthly actuals…',
  render_chart: 'Drawing a chart…',
  navigate_to_page: 'Taking you there…',
  start_walkthrough: 'Let me show you…',
  get_briefing: 'Reviewing what needs your attention…',
  get_account_transactions: 'Pulling the transactions behind that number…',
}
