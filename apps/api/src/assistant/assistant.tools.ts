// Phase 4D+ — the assistant's tool registry (OpenAI function schemas fed to the
// LLM). All read-only except render_chart, which returns a spec the frontend draws.
// Handlers live in AssistantService (they need the injected data services).
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
        'PROPOSE a budget change (does NOT apply — the user must confirm). Set a single category line (categoryKey + categoryType + amount) and/or the top-line totalRevenue/totalExpenses for a period.',
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
        'PROPOSE filling a corrective-action-plan entry (does NOT apply — the user must confirm). Provide the ruleId (from get_corrective_action_plan) and the fields to draft.',
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
        "The diocese-wide CONSOLIDATED budget across every school in this organization the user can see: each school's budgeted revenue/expense and the consolidated category totals for the fiscal year. Use for 'across the diocese' / 'all our schools' budget questions.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'apply_driver_budget',
      description:
        'PROPOSE building the budget from driver assumptions (does NOT apply — the user must confirm). Provide ONLY the levers the user mentioned; everything else keeps its current value. Enrollment drives tuition; staffing drives salaries; other lines grow from last year by inflationPct.',
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
            description: 'Students per grade, e.g. {"K":50,"1":48}. Keys: PK0–PK4, K, 1–8.',
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
]
