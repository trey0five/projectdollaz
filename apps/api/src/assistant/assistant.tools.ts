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
        'IMPORT the attached trial balance now; summarize the parsed rows (period, account count, net) for the user. Pass the attachmentId shown in the attachment digest. The server already holds the fully parsed account rows — NEVER retype or fabricate them. Optionally set the role (cy = current year, py = prior year, audit = audited) and a label.',
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
          label: { type: 'string', description: 'Optional period label, e.g. "FY2025".' },
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
        'PROPOSE filing an attached document into the Knowledge store for the user to CONFIRM before it is stored (like drafting a task — this does NOT file it; the user must confirm). Use ONLY when the user attached a document and wants to save/file it. Classify its domain and suggest a clear title plus domain tags (governance/compliance/finance/facilities/accreditation/advancement). Pass the attachmentId shown in the attachment digest — the server holds the file bytes, so NEVER retype the file. sourceType defaults to manual; set a non-manual sourceType + sourceRef ONLY when the user names a specific in-school entity (a policy, board report, standard, campaign, or maintenance item) to link it to.',
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
  get_corrective_action_plan: 'Reading the corrective action plan…',
  get_trend: 'Loading the trend…',
  set_budget: 'Setting the budget…',
  apply_driver_budget: 'Building the driver budget…',
  draft_cap_entry: 'Logging a corrective action…',
  create_task: 'Drafting a task…',
  file_document: 'Filing the document…',
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
  render_chart: 'Drawing a chart…',
  navigate_to_page: 'Taking you there…',
  start_walkthrough: 'Let me show you…',
  get_briefing: 'Reviewing what needs your attention…',
}
