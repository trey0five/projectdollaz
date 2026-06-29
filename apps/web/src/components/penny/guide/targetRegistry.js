// ─────────────────────────────────────────────────────────────────────────────
// TARGET-ELEMENT REGISTRY (FROZEN — contract section C).
//
// Maps each frozen TargetKey to a stable DOM id + the page (and optional DataHub
// modal) the element lives on. The Penny "walkthrough" tool (backend) embeds ONLY
// the KEY strings as its schema `enum`; the LLM never sees raw DOM ids. The agent
// guide path (PennyContext.runAgentGuide) resolves each key here into the domId
// Penny.jsx measures + glides to, plus the per-step navigation it needs first.
//
// To extend: add a row here AND the matching key string to the backend
// start_walkthrough schema enum (the two MUST stay byte-identical). domIds follow
// the simple convention (nav-*, datahub-card-*, …) — NOT penny-*.
// ─────────────────────────────────────────────────────────────────────────────

export const TARGET_REGISTRY = {
  // ── Primary nav (TopBar desktop links) ──────────────────────────────────────
  'nav.home': { domId: 'nav-home', page: 'home' },
  'nav.data': { domId: 'nav-data', page: 'data' },
  'nav.statements': { domId: 'nav-statements', page: 'statements' },
  'nav.analytics': { domId: 'nav-analytics', page: 'analytics' },
  'nav.budget': { domId: 'nav-budget', page: 'budget' },
  'nav.reports': { domId: 'nav-reports', page: 'reports' },
  'nav.readiness': { domId: 'nav-readiness', page: 'readiness' },
  'nav.settings': { domId: 'nav-settings', page: 'settings' },

  // ── Data hub checklist cards + controls ─────────────────────────────────────
  'dataHub.trialBalanceCard': { domId: 'datahub-card-trialBalances', page: 'data' },
  'dataHub.monthlyCard': { domId: 'datahub-card-monthly', page: 'data' },
  'dataHub.operationalCard': { domId: 'datahub-card-operational', page: 'data' },
  'dataHub.budgetCard': { domId: 'datahub-card-budget', page: 'data' },
  'dataHub.forecastCard': { domId: 'datahub-card-forecast', page: 'data' },
  'dataHub.schedulesCard': { domId: 'datahub-card-schedules', page: 'data' },
  'dataHub.complianceCard': { domId: 'datahub-card-compliance', page: 'data' },
  'dataHub.tourButton': { domId: 'datahub-tour-button', page: 'data' },
  'dataHub.periodSelect': { domId: 'datahub-period-select', page: 'data' },

  // ── Data hub modal interiors ────────────────────────────────────────────────
  'trialBalance.uploadDrop': { domId: 'tb-upload-drop', page: 'data', openModal: 'trialBalances' },
  'trialBalance.saveButton': { domId: 'tb-save-button', page: 'data', openModal: 'trialBalances' },
  'budget.setupPanel': { domId: 'budget-setup-panel', page: 'data', openModal: 'budget' },
  'budget.saveButton': { domId: 'budget-save-button', page: 'data', openModal: 'budget' },
  'forecast.workspace': { domId: 'forecast-workspace', page: 'data', openModal: 'forecast' },
  'forecast.feederInput': { domId: 'forecast-feeder-input', page: 'data', openModal: 'forecast' },

  // ── Page-level controls ─────────────────────────────────────────────────────
  'budgetPage.tabBar': { domId: 'budgetpage-driver-tab', page: 'budget' },
  'analytics.aiInsight': { domId: 'analytics-ai-insight', page: 'analytics' },
  'analytics.customizeBar': { domId: 'analytics-customize-bar', page: 'analytics' },
  'reports.boardReportCard': { domId: 'reports-board-card', page: 'reports' },
  'reports.generateButton': { domId: 'reports-generate-button', page: 'reports' },
  'schedules.capitalTab': { domId: 'schedules-capital-tab', page: 'schedules' },
  'readiness.capPanel': { domId: 'readiness-cap-panel', page: 'readiness' },

  // Individual analytics KPI tiles — each metric card carries id=`metric-<key>`
  // (MetricCard / HeroVitalTile). Lets Penny glide to a specific metric when the
  // user asks to be shown it (e.g. "show me net tuition per student"). Only the
  // metrics in the user's current layout are mounted; a hidden one parks the coin.
  'metric.operating_margin': { domId: 'metric-operating_margin', page: 'analytics' },
  'metric.days_cash_on_hand': { domId: 'metric-days_cash_on_hand', page: 'analytics' },
  'metric.months_operating_reserve': { domId: 'metric-months_operating_reserve', page: 'analytics' },
  'metric.tuition_dependency': { domId: 'metric-tuition_dependency', page: 'analytics' },
  'metric.cost_per_pupil': { domId: 'metric-cost_per_pupil', page: 'analytics' },
  'metric.net_tuition_per_student': { domId: 'metric-net_tuition_per_student', page: 'analytics' },
  'metric.financial_aid_per_student': { domId: 'metric-financial_aid_per_student', page: 'analytics' },
  'metric.aid_per_aided_student': { domId: 'metric-aid_per_aided_student', page: 'analytics' },
  'metric.tuition_discount_rate': { domId: 'metric-tuition_discount_rate', page: 'analytics' },
  'metric.pct_students_on_aid': { domId: 'metric-pct_students_on_aid', page: 'analytics' },
}

export const TARGET_KEYS = Object.keys(TARGET_REGISTRY)

export const resolveTarget = (key) => TARGET_REGISTRY[key] ?? null
