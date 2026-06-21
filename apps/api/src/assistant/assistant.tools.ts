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
