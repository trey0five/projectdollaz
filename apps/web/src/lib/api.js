// ─────────────────────────────────────────────────────────────────────────────
// Axios API client with token storage + PROACTIVE refresh (ported from smartbot's
// interceptor idea, adapted to finrep's JSON-body /auth/refresh contract).
//
// - Access + refresh tokens live in localStorage (keys ACCESS_KEY / REFRESH_KEY).
// - Request interceptor attaches the Bearer access token and, if it expires
//   within REFRESH_SKEW_MS, proactively rotates it first (deduped via a single
//   in-flight promise) so normal use never hits a hard 401.
// - Response interceptor does a one-shot 401 retry through /auth/refresh.
// - On a failed refresh we clear tokens and dispatch an 'auth:logout' event the
//   AuthContext listens for (it owns the actual redirect, so the client stays
//   router-agnostic).
// ─────────────────────────────────────────────────────────────────────────────
import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

export const ACCESS_KEY = 'finrep_access_token'
export const REFRESH_KEY = 'finrep_refresh_token'

// Refresh this long before the access token actually expires.
const REFRESH_SKEW_MS = 2 * 60 * 1000

export const tokenStore = {
  getAccess: () => localStorage.getItem(ACCESS_KEY),
  getRefresh: () => localStorage.getItem(REFRESH_KEY),
  set(access, refresh) {
    if (access) localStorage.setItem(ACCESS_KEY, access)
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh)
  },
  setAccess(access) {
    if (access) localStorage.setItem(ACCESS_KEY, access)
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
  },
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Decode a JWT's `exp` (ms) without a library. Returns null on any malformed token.
function getTokenExpiry(token) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(part))
    return payload.exp ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

// Single in-flight refresh shared by every caller (dedupe stampede).
let refreshPromise = null

function notifyLoggedOut() {
  tokenStore.clear()
  window.dispatchEvent(new CustomEvent('auth:logout'))
}

// Rotate the refresh token via the API. Persists BOTH new tokens (the backend
// rotates the refresh token on every /auth/refresh) and returns the access one.
async function doRefresh() {
  const refresh = tokenStore.getRefresh()
  if (!refresh) return null
  try {
    const res = await axios.post(`${API_BASE_URL}/auth/refresh`, {
      refresh_token: refresh,
    })
    const { access_token, refresh_token } = res.data
    tokenStore.set(access_token, refresh_token)
    return access_token
  } catch {
    notifyLoggedOut()
    return null
  } finally {
    refreshPromise = null
  }
}

function refreshOnce() {
  if (!refreshPromise) refreshPromise = doRefresh()
  return refreshPromise
}

const isAuthEndpoint = (url = '') =>
  url.includes('/auth/login') ||
  url.includes('/auth/register') ||
  url.includes('/auth/refresh') ||
  url.includes('/auth/verify-email') ||
  url.includes('/auth/resend-verification') ||
  url.includes('/auth/forgot-password') ||
  url.includes('/auth/reset-password')

// Request: attach Bearer + proactive refresh shortly before expiry.
api.interceptors.request.use(async (config) => {
  if (isAuthEndpoint(config.url)) return config
  let token = tokenStore.getAccess()
  if (token) {
    const exp = getTokenExpiry(token)
    if (exp && exp - Date.now() < REFRESH_SKEW_MS) {
      const fresh = await refreshOnce()
      if (fresh) token = fresh
    }
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response: one-shot 401 retry through refresh.
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config || {}
    if (error.response?.status === 401 && !isAuthEndpoint(original.url) && !original._retry) {
      const fresh = await refreshOnce()
      if (fresh) {
        original._retry = true
        original.headers = original.headers || {}
        original.headers.Authorization = `Bearer ${fresh}`
        return api.request(original)
      }
      notifyLoggedOut()
    }
    return Promise.reject(error)
  },
)

// Pull a friendly message out of a Nest error response.
export function apiErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  const data = err?.response?.data
  if (!data) return err?.message || fallback
  if (typeof data.message === 'string') return data.message
  if (Array.isArray(data.message)) return data.message.join(' ')
  if (typeof data === 'string') return data
  return fallback
}

// The backend signals an unverified-email login with a 403 + code.
export function isEmailNotVerified(err) {
  return err?.response?.data?.code === 'EMAIL_NOT_VERIFIED'
}

// ── Typed-ish endpoint wrappers ──────────────────────────────────────────────
export const authApi = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  updateMe: (data) => api.patch('/auth/me', data),
  changePassword: (data) => api.post('/auth/change-password', data),
  verifyEmail: (token) => api.post('/auth/verify-email', { token }),
  resendVerification: (email) => api.post('/auth/resend-verification', { email }),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (data) => api.post('/auth/reset-password', data),
  refresh: (refresh_token) => api.post('/auth/refresh', { refresh_token }),
}

export const schoolsApi = {
  list: () => api.get('/schools'),
  create: (data) => api.post('/schools', data),
  update: (schoolId, data) => api.patch(`/schools/${schoolId}`, data),
  members: (schoolId) => api.get(`/schools/${schoolId}/members`),
  updateMemberRole: (schoolId, userId, data) =>
    api.patch(`/schools/${schoolId}/members/${userId}`, data),
  removeMember: (schoolId, userId) => api.delete(`/schools/${schoolId}/members/${userId}`),
  invite: (schoolId, data) => api.post(`/schools/${schoolId}/invitations`, data),
  listInvitations: (schoolId) => api.get(`/schools/${schoolId}/invitations`),
  revokeInvitation: (schoolId, invitationId) =>
    api.delete(`/schools/${schoolId}/invitations/${invitationId}`),
  acceptInvite: (token) => api.post('/invitations/accept', { token }),
}

export const orgsApi = {
  me: () => api.get('/organizations/me'),
  update: (orgId, data) => api.patch(`/organizations/${orgId}`, data),
}

// ── Phase 1C: persistence / history / comparatives ───────────────────────────
export const periodsApi = {
  list: (schoolId) => api.get(`/schools/${schoolId}/periods`),
  createOrGet: (schoolId, data) => api.post(`/schools/${schoolId}/periods`, data),
}

export const importsApi = {
  create: (schoolId, data) => api.post(`/schools/${schoolId}/imports`, data),
  listForPeriod: (schoolId, periodId) =>
    api.get(`/schools/${schoolId}/periods/${periodId}/imports`),
  get: (schoolId, importId) => api.get(`/schools/${schoolId}/imports/${importId}`),
  // Delete a stored trial balance; the API reconciles the period snapshot
  // (regenerates without it, or clears statements when no CY remains).
  delete: (schoolId, importId) => api.delete(`/schools/${schoolId}/imports/${importId}`),
}

// ── Monthly Actuals Foundation: per-period monthly trial-balance snapshots ────
// Additive "Option B" slice — completely separate from the annual import flow.
// The web parses an .xlsx monthly TB CLIENT-SIDE (the SAME @finrep/ingestion
// `ingest()` the annual intake uses) into MonthlyRow[] = NormalizedRow[], then
// POSTs { monthKey, sourceName, rows }. Same axios `api` instance → inherits the
// Bearer + proactive-refresh interceptors and surfaces the entitlement 402.
//   • list    → { fiscalYearStart, months: MonthlySnapshotSummary[] }
//   • upload  → 201 CreateMonthlySnapshotResponse (payload/rows NOT echoed)
//   • remove  → 204 (404 when that month isn't loaded)
//   • actuals → MonthlyActualsResponse (YTD/MTD/balanceSheet/metrics). Wired now
//     even though the consuming MTD/YTD board view is deferred, so the full seam
//     is smoke-testable end to end.
export const monthlyApi = {
  list: (schoolId, periodId) =>
    api.get(`/schools/${schoolId}/periods/${periodId}/monthly-snapshots`),
  upload: (schoolId, periodId, body) =>
    api.post(`/schools/${schoolId}/periods/${periodId}/monthly-snapshots`, body),
  remove: (schoolId, periodId, monthKey) =>
    api.delete(`/schools/${schoolId}/periods/${periodId}/monthly-snapshots/${monthKey}`),
  actuals: (schoolId, periodId, month) =>
    api.get(`/schools/${schoolId}/periods/${periodId}/monthly-actuals`, {
      params: month ? { month } : {},
    }),
}

export const statementsApi = {
  generate: (schoolId, periodId, body = {}) =>
    api.post(`/schools/${schoolId}/periods/${periodId}/statements`, body),
  latest: (schoolId, periodId) =>
    api.get(`/schools/${schoolId}/periods/${periodId}/statements`),
  list: (schoolId, periodId) =>
    api.get(`/schools/${schoolId}/periods/${periodId}/statements/history`),
}

export const mappingApi = {
  get: (schoolId) => api.get(`/schools/${schoolId}/mapping`),
  // Merge Resolve-unmatched picks into the school's mapping (owner/accountant).
  // `entries` is keyed by each unmatched row's `key` (echoed verbatim) → SCoA key.
  mergeEntries: (schoolId, entries) => api.patch(`/schools/${schoolId}/mapping`, { entries }),
}

// ── Phase 4A: analytics & insights ───────────────────────────────────────────
// Same axios `api` instance, so these inherit the Bearer + proactive-refresh
// interceptors and surface the entitlement 402 (isPaymentRequired) like every
// other paid read.
export const analyticsApi = {
  metrics: (schoolId, periodId) =>
    api.get(`/schools/${schoolId}/periods/${periodId}/metrics`),
  trends: (schoolId, metric) =>
    api.get(`/schools/${schoolId}/metrics/trends`, { params: { metric } }),
  // ── Phase 4D: AI insight summary + static metric metadata ─────────────────
  insights: (schoolId, periodId) =>
    api.get(`/schools/${schoolId}/periods/${periodId}/insights`),
  meta: (schoolId) => api.get(`/schools/${schoolId}/metrics/meta`),
  // ── Phase 4B: per-period operational data (enrollment + aid) ──────────────
  operational: (schoolId, periodId) =>
    api.get(`/schools/${schoolId}/periods/${periodId}/operational`),
  saveOperational: (schoolId, periodId, body) =>
    api.put(`/schools/${schoolId}/periods/${periodId}/operational`, body),
  // ── Phase 3: per-period budget (budget-vs-actual) ─────────────────────────
  budget: (schoolId, periodId) =>
    api.get(`/schools/${schoolId}/periods/${periodId}/budget`),
  saveBudget: (schoolId, periodId, body) =>
    api.put(`/schools/${schoolId}/periods/${periodId}/budget`, body),
  // Builder context: prior actuals + multi-year history + enrollment/aid drivers.
  budgetContext: (schoolId, periodId) =>
    api.get(`/schools/${schoolId}/periods/${periodId}/budget-context`),
  // ── Phase 2: enrollment×tuition Driver Model. PUT { assumptions }; the server
  // recomputes authoritatively (computeDriverBudget) and overwrites lines.revenue/
  // expense + lines.spread, then returns the saved budget + kpis. Owner/accountant
  // only (server-enforced). Single call site so the route is trivial to retune.
  saveDriverBudget: (schoolId, periodId, body) =>
    api.put(`/schools/${schoolId}/periods/${periodId}/budget/driver`, body),
  // ── Phase 2 (FY-End Forecast): assumption-driven RE-PROJECTION vs the active
  // budget. GET returns { forecast|null, feederEnrollmentByGrade, hasBudget,
  // exists }. PUT { assumptions, feederEnrollmentByGrade?, explanations? } —
  // server RECOMPUTES authoritatively (computeDriverBudget) and returns the
  // recomputed { forecast, kpis }. Owner/accountant only (server-enforced).
  getForecast: (schoolId, periodId) =>
    api.get(`/schools/${schoolId}/periods/${periodId}/budget/forecast`),
  saveForecast: (schoolId, periodId, body) =>
    api.put(`/schools/${schoolId}/periods/${periodId}/budget/forecast`, body),
  // ── v1 Budget workspace: import a monthly budget spread (client-parsed) ────
  // PUT the parsed BudgetSpread JSON; server stores lines.spread + rollups and
  // returns the saved budget. Owner/accountant only (server-enforced).
  saveBudgetSpread: (schoolId, periodId, body) =>
    api.put(`/schools/${schoolId}/periods/${periodId}/budget/spread`, body),
  // ── AI-assisted budget sufficiency check (read-only, all roles) ────────────
  // POST exactly one of { spread } or { draft: { revenue, expense, stats? } };
  // server returns { status, checks, ai }. ADVISORY only — never blocks Apply.
  assessBudget: (schoolId, periodId, body) =>
    api.post(`/schools/${schoolId}/periods/${periodId}/budget/assess`, body),
  // Organization roll-up: consolidated per-school + org category totals for a fiscal
  // year. Kept here as the SINGLE call site so the route is trivial to retune in
  // integration if Engineer 1's path differs (e.g. a school-anchored variant).
  budgetRollup: (orgId, fiscalYearStart) =>
    api.get(`/organizations/${orgId}/budget/rollup`, {
      params: fiscalYearStart ? { fiscalYearStart } : {},
    }),
  // Organization consolidated statements roll-up: per-school + org-consolidated
  // Statement of Activities + Statement of Financial Position for a fiscal year,
  // summed from each school's STORED snapshot (no engine re-run). SINGLE call site so
  // the route is trivial to retune in integration. Omit fiscalYearStart entirely (not
  // '') when no FY is selected, to satisfy the forbidNonWhitelisted ValidationPipe.
  statementsRollup: (orgId, fiscalYearStart) =>
    api.get(`/organizations/${orgId}/statements/rollup`, {
      params: fiscalYearStart ? { fiscalYearStart } : {},
    }),
  // Organization METRICS (canonical semantic layer v1): org-level KPIs computed
  // as the metric's OWN formula over the SUM of each school's extensive components
  // (never the average of per-school values) — same MetricResult shape the
  // per-school dashboard renders, plus which schools contributed. SINGLE call site.
  // Omit fiscalYearStart entirely (not '') when no FY, to satisfy forbidNonWhitelisted.
  orgMetrics: (orgId, fiscalYearStart) =>
    api.get(`/organizations/${orgId}/metrics`, {
      params: fiscalYearStart ? { fiscalYearStart } : {},
    }),
  // Organization ATTENTION BRIEFING: per-school attention rolled up
  // across the caller's org for a fiscal year — a ranked, school-attributed
  // cross-school item list + per-school summaries + consolidated counts. SINGLE
  // call site so the route is trivial to retune in integration. Omit
  // fiscalYearStart entirely (not '') when no FY, to satisfy forbidNonWhitelisted.
  // `lens` (Scope × Lens override) is omitted entirely when absent, exactly like
  // fiscalYearStart, to satisfy the global forbidNonWhitelisted ValidationPipe.
  orgBriefing: (orgId, fiscalYearStart, lens) =>
    api.get(`/organizations/${orgId}/briefing`, {
      params: {
        ...(fiscalYearStart ? { fiscalYearStart } : {}),
        ...(lens ? { lens } : {}),
      },
    }),
  // ── Phase 4C: per-school dashboard layout (owner customizes; all roles read) ──
  dashboard: (schoolId) => api.get(`/schools/${schoolId}/dashboard`),
  saveDashboard: (schoolId, body) => api.put(`/schools/${schoolId}/dashboard`, body),
  resetDashboard: (schoolId) => api.delete(`/schools/${schoolId}/dashboard`),
}

// ── Phase 1 (Attention Briefing): the prioritised "things that need attention"
// list for one period. Read-only; same read-auth as analyticsApi.metrics. The
// server returns a ranked AttentionItem[] + a summary (and a graceful "get
// started" item when the period has no snapshot — always a 200).
export const briefingApi = {
  // `lens` (Scope × Lens override) is omitted when absent so forbidNonWhitelisted
  // doesn't 400 on an empty param. The server clamps it to the caller's ceiling.
  get: (schoolId, periodId, lens) =>
    api.get(`/schools/${schoolId}/periods/${periodId}/briefing`, {
      params: lens ? { lens } : {},
    }),
}

// ── Phase 1 (Board Report): NBOA-style finance-committee packet ──────────────
// ONE server-side "assemble" GET returns a fully-computed BoardReportBundle; the
// web layer does ZERO financial math. PUT saves only editable state (per-line
// variance explanations, MD&A, title/committee, markGenerated). POST mda drafts
// a narrative (rule baseline + optional LLM). Branding (logo/brandColor/
// defaultCommittee) goes through the EXISTING schoolsApi.update PATCH.
export const boardReportApi = {
  assemble: (schoolId, periodId, granularity = 'annual', month, quarter) =>
    api.get(`/schools/${schoolId}/periods/${periodId}/board-report`, {
      params: {
        granularity,
        ...(granularity === 'monthly' && month ? { month } : {}),
        ...(granularity === 'quarterly' && quarter ? { quarter } : {}),
      },
    }),
  save: (schoolId, periodId, body) =>
    api.put(`/schools/${schoolId}/periods/${periodId}/board-report`, body),
  mda: (schoolId, periodId, body = {}) =>
    api.post(`/schools/${schoolId}/periods/${periodId}/board-report/mda`, body),
}

// ── Phase 3 Governance v1: the POLICY REGISTER ───────────────────────────────
// School-scoped (NOT period-scoped) — a standing list of policies + review cycle.
// Gated by the 'governance' module: an entitled-but-unlicensed school gets a 402
// { code:'MODULE_NOT_LICENSED', module:'governance' } (surface via isModuleNotLicensed).
export const policiesApi = {
  list: (schoolId) => api.get(`/schools/${schoolId}/policies`),
  create: (schoolId, body) => api.post(`/schools/${schoolId}/policies`, body),
  update: (schoolId, policyId, body) =>
    api.patch(`/schools/${schoolId}/policies/${policyId}`, body),
  remove: (schoolId, policyId) => api.delete(`/schools/${schoolId}/policies/${policyId}`),
}

// ── Phase 4 Accreditation v1: the STANDARDS + EVIDENCE register ───────────────
// School-scoped (NOT period-scoped). Gated by the 'accreditation' module: an
// entitled-but-unlicensed school gets a 402 { code:'MODULE_NOT_LICENSED',
// module:'accreditation' } (surface via isModuleNotLicensed). Evidence is nested
// under a standard so the standardId∈school invariant is a URL contract.
export const accreditationApi = {
  listStandards: (schoolId) => api.get(`/schools/${schoolId}/accreditation/standards`),
  createStandard: (schoolId, body) =>
    api.post(`/schools/${schoolId}/accreditation/standards`, body),
  updateStandard: (schoolId, standardId, body) =>
    api.patch(`/schools/${schoolId}/accreditation/standards/${standardId}`, body),
  removeStandard: (schoolId, standardId) =>
    api.delete(`/schools/${schoolId}/accreditation/standards/${standardId}`),
  listEvidenceSources: (schoolId) =>
    api.get(`/schools/${schoolId}/accreditation/evidence-sources`),
  listEvidence: (schoolId, standardId) =>
    api.get(`/schools/${schoolId}/accreditation/standards/${standardId}/evidence`),
  createEvidence: (schoolId, standardId, body) =>
    api.post(`/schools/${schoolId}/accreditation/standards/${standardId}/evidence`, body),
  removeEvidence: (schoolId, standardId, evidenceId) =>
    api.delete(`/schools/${schoolId}/accreditation/standards/${standardId}/evidence/${evidenceId}`),
}

// ── Phase 4 Knowledge document store: CORE (always included, NOT a licensed module).
// Files are uploaded SERVER-SIDE as multipart/form-data (the API PutObjects to S3);
// download is a top-level browser navigation to a presigned GET url the API returns.
// The upload MUST NOT force Content-Type: application/json — pass Content-Type:
// undefined so axios/the browser set the multipart boundary. No MODULE_NOT_LICENSED
// path (CORE) — only the base entitlement 402 applies.
export const documentsApi = {
  list: (schoolId, params) => api.get(`/schools/${schoolId}/knowledge/documents`, { params }),
  upload: (schoolId, formData) =>
    api.post(`/schools/${schoolId}/knowledge/documents`, formData, {
      headers: { 'Content-Type': undefined },
    }),
  downloadUrl: (schoolId, documentId) =>
    api.get(`/schools/${schoolId}/knowledge/documents/${documentId}/download-url`),
  patch: (schoolId, documentId, body) =>
    api.patch(`/schools/${schoolId}/knowledge/documents/${documentId}`, body),
  remove: (schoolId, documentId) =>
    api.delete(`/schools/${schoolId}/knowledge/documents/${documentId}`),
}

// ── Phase 4 Facilities v1: the deferred-maintenance register ──────────────────
// School-scoped (NOT period-scoped). Gated by the 'facilities' module: an entitled-
// but-unlicensed school gets a 402 { code:'MODULE_NOT_LICENSED', module:'facilities' }
// (surface via isModuleNotLicensed). Single flat resource (no nested sub-resource).
export const facilitiesApi = {
  listMaintenance: (schoolId) => api.get(`/schools/${schoolId}/facilities/maintenance`),
  createMaintenance: (schoolId, body) =>
    api.post(`/schools/${schoolId}/facilities/maintenance`, body),
  updateMaintenance: (schoolId, itemId, body) =>
    api.patch(`/schools/${schoolId}/facilities/maintenance/${itemId}`, body),
  removeMaintenance: (schoolId, itemId) =>
    api.delete(`/schools/${schoolId}/facilities/maintenance/${itemId}`),
}

// ── Phase 4 Advancement v1: the fundraising campaign/appeal register ──────────
// School-scoped. Gated by the 'advancement' module: an entitled-but-unlicensed
// school gets a 402 { code:'MODULE_NOT_LICENSED', module:'advancement' } (surface
// via isModuleNotLicensed). Single flat resource (no nested sub-resource).
export const advancementApi = {
  listCampaigns: (schoolId) => api.get(`/schools/${schoolId}/advancement/campaigns`),
  createCampaign: (schoolId, body) => api.post(`/schools/${schoolId}/advancement/campaigns`, body),
  updateCampaign: (schoolId, campaignId, body) =>
    api.patch(`/schools/${schoolId}/advancement/campaigns/${campaignId}`, body),
  removeCampaign: (schoolId, campaignId) =>
    api.delete(`/schools/${schoolId}/advancement/campaigns/${campaignId}`),
}

// ── Phase 3 Workflow v1 — the generic TASK engine. School-scoped. CORE (always
// included, NOT a licensed module), so there is NO MODULE_NOT_LICENSED path — only
// the base entitlement 402 (isPaymentRequired) applies, like any other core read.
export const tasksApi = {
  list: (schoolId, params) => api.get(`/schools/${schoolId}/tasks`, { params }),
  create: (schoolId, body) => api.post(`/schools/${schoolId}/tasks`, body),
  update: (schoolId, taskId, body) => api.patch(`/schools/${schoolId}/tasks/${taskId}`, body),
  complete: (schoolId, taskId) => api.post(`/schools/${schoolId}/tasks/${taskId}/complete`),
  remove: (schoolId, taskId) => api.delete(`/schools/${schoolId}/tasks/${taskId}`),
  submitApproval: (schoolId, taskId, body) =>
    api.post(`/schools/${schoolId}/tasks/${taskId}/submit-approval`, body),
  decide: (schoolId, taskId, body) => api.post(`/schools/${schoolId}/tasks/${taskId}/decide`, body),
}

// ── Phase 3: supporting schedules (Capital Budget + Cash & Investments) ──────
// Period-scoped, user-maintained JSON-array schedules. GET never 404s on a
// missing row (returns { items: [] } / { accounts: [] }, updatedAt: null). PUT
// is a BULK REPLACE of the whole array (matches the editable-table "save" UX);
// the server normalizes + persists order, then echoes the GET shape. Read
// owner/accountant/viewer, write owner/accountant (server-enforced). These flow
// into the board packet indirectly: saving here feeds the next board-report
// assemble()'s capitalBudget / cashInvestments sections.
export const schedulesApi = {
  getCapital: (schoolId, periodId) =>
    api.get(`/schools/${schoolId}/periods/${periodId}/capital-schedule`),
  saveCapital: (schoolId, periodId, body) =>
    api.put(`/schools/${schoolId}/periods/${periodId}/capital-schedule`, body),
  getCash: (schoolId, periodId) =>
    api.get(`/schools/${schoolId}/periods/${periodId}/cash-schedule`),
  saveCash: (schoolId, periodId, body) =>
    api.put(`/schools/${schoolId}/periods/${periodId}/cash-schedule`, body),
  getCampaign: (schoolId, periodId) =>
    api.get(`/schools/${schoolId}/periods/${periodId}/campaign-schedule`),
  saveCampaign: (schoolId, periodId, body) =>
    api.put(`/schools/${schoolId}/periods/${periodId}/campaign-schedule`, body),
}

// ── Phase 3: recurring board-summary delivery (per school) ───────────────────
export const reportScheduleApi = {
  get: (schoolId) => api.get(`/schools/${schoolId}/report-schedule`),
  save: (schoolId, body) => api.put(`/schools/${schoolId}/report-schedule`, body),
  sendNow: (schoolId) => api.post(`/schools/${schoolId}/report-schedule/send-now`),
}

// ── AI assistant (agentic, tool-calling) ─────────────────────────────────────
export const assistantApi = {
  chat: (schoolId, body) => api.post(`/schools/${schoolId}/assistant/chat`, body),
  // Apply a user-confirmed proposal (write — owner/accountant).
  apply: (schoolId, action) => api.post(`/schools/${schoolId}/assistant/apply`, action),
  // ── Penny AI upgrade: URL builders for the raw fetch loops (SSE + TTS) ──────
  // These return the proxied path only; the hooks (useTextToSpeech / usePennyChat)
  // do the fetch themselves with `Authorization: Bearer ${tokenStore.getAccess()}`
  // because EventSource/blob streaming can't go through the axios instance.
  ttsUrl: (schoolId) => `${API_BASE_URL}/schools/${schoolId}/assistant/tts`,
  chatStreamUrl: (schoolId) => `${API_BASE_URL}/schools/${schoolId}/assistant/chat/stream`,
}

// ── Data hub: unified data-status aggregation (read-only) ────────────────────
export const dataHubApi = {
  status: (schoolId, periodId) => api.get(`/schools/${schoolId}/periods/${periodId}/data-status`),
}

// ── Phase 6: QuickBooks Online connector (per school) ────────────────────────
export const qboApi = {
  status: (schoolId) => api.get(`/schools/${schoolId}/integrations/qb/status`),
  connectUrl: (schoolId) => api.get(`/schools/${schoolId}/integrations/qb/connect`),
  callback: (schoolId, body) => api.post(`/schools/${schoolId}/integrations/qb/callback`, body),
  disconnect: (schoolId) => api.delete(`/schools/${schoolId}/integrations/qb`),
  sync: (schoolId, periodId) => api.post(`/schools/${schoolId}/integrations/qb/sync`, { periodId }),
  syncAll: (schoolId) => api.post(`/schools/${schoolId}/integrations/qb/sync-all`),
  syncHistory: (schoolId) => api.get(`/schools/${schoolId}/integrations/qb/sync-history`),
}

// ── Phase 2A: Florida scholarship AUP — Review Readiness ─────────────────────
// Same axios `api` instance: inherits Bearer + proactive-refresh and surfaces the
// entitlement 402 (isPaymentRequired) like every other paid read.
export const complianceApi = {
  // GET grouped findings + summary for a period.
  get: (schoolId, periodId) =>
    api.get(`/schools/${schoolId}/periods/${periodId}/compliance`),
  // GET the saved intake row (or all-nulls).
  getInputs: (schoolId, periodId) =>
    api.get(`/schools/${schoolId}/periods/${periodId}/compliance/inputs`),
  // PUT the intake (owner/accountant). Re-run GET /compliance after to refresh badges.
  saveInputs: (schoolId, periodId, body) =>
    api.put(`/schools/${schoolId}/periods/${periodId}/compliance/inputs`, body),
}

// ── Phase 2B: scholarship reconciliation (funding-org disbursements) ──────────
// Same axios `api` instance -> Bearer + proactive-refresh + the entitlement 402
// (isPaymentRequired). The web parses the funding-org CSV/XLSX IN-BROWSER and
// PUTs the parsed rows (mirrors the Phase-1C immutable-rows intake pattern).
export const reconciliationApi = {
  // GET the period's disbursement rows (all roles).
  listDisbursements: (schoolId, periodId) =>
    api.get(`/schools/${schoolId}/periods/${periodId}/disbursements`),
  // PUT replaces the whole set with the parsed rows (owner/accountant).
  saveDisbursements: (schoolId, periodId, rows) =>
    api.put(`/schools/${schoolId}/periods/${periodId}/disbursements`, { rows }),
  // DELETE clears the set (owner/accountant).
  clearDisbursements: (schoolId, periodId) =>
    api.delete(`/schools/${schoolId}/periods/${periodId}/disbursements`),
  // GET the pure reconciliation result + recorded-figure echo (all roles).
  get: (schoolId, periodId) =>
    api.get(`/schools/${schoolId}/periods/${periodId}/reconciliation`),
}

// ── Phase 2D: Corrective Action Plan (CAP) ───────────────────────────────────
// Same axios `api` instance -> Bearer + proactive-refresh + the entitlement 402
// (isPaymentRequired). GET recomputes the 2A findings, scaffolds, and merges saved
// edits; PUT upserts the editable rows (owner/accountant), keyed by ruleId.
export const correctiveActionApi = {
  // GET the merged CAP (scaffold + saved edits) + summary (all roles).
  get: (schoolId, periodId) =>
    api.get(`/schools/${schoolId}/periods/${periodId}/corrective-action-plan`),
  // PUT a mergeable set of editable rows (owner/accountant). Returns the fresh plan.
  save: (schoolId, periodId, entries) =>
    api.put(`/schools/${schoolId}/periods/${periodId}/corrective-action-plan`, { entries }),
  // Dismiss (soft-archive) or restore a resolved row (owner/accountant). Fresh plan.
  setArchived: (schoolId, periodId, ruleId, archived) =>
    api.put(
      `/schools/${schoolId}/periods/${periodId}/corrective-action-plan/${ruleId}/archived`,
      { archived },
    ),
}

// ── Phase 2C: Year-End checklist + Workpapers Packet ─────────────────────────
// Same axios `api` instance -> Bearer + proactive-refresh + the entitlement 402
// (isPaymentRequired). GET /checklist builds the pure checklist + merges saved
// state + a readiness rollup + live-finding context; PUT upserts item state
// (owner/accountant) keyed by itemId. GET /workpapers returns the aggregated
// packet (statements/reconciliation/findings/CAP/rollup) the print route renders.
export const checklistApi = {
  // GET the merged checklist (groups + rollup) — all roles.
  get: (schoolId, periodId) =>
    api.get(`/schools/${schoolId}/periods/${periodId}/checklist`),
  // PUT a mergeable set of item states (owner/accountant). Returns the fresh checklist.
  save: (schoolId, periodId, items) =>
    api.put(`/schools/${schoolId}/periods/${periodId}/checklist`, { items }),
}

export const workpapersApi = {
  // GET the aggregated workpapers packet payload (all roles).
  get: (schoolId, periodId) =>
    api.get(`/schools/${schoolId}/periods/${periodId}/workpapers`),
}

// ── Phase 4 Knowledge/Search v1 — platform-wide search ────────────────────────
// CORE (route not module-gated); per-DOMAIN results are gated server-side by module
// entitlement (a finance-only school finds only tasks). Returns a grouped response
// { query, total, groups:[{ domain, label, count, items }] }. `q` is the ONLY query
// param the forbidNonWhitelisted DTO accepts. AbortSignal is forwarded so the hook
// can cancel a stale in-flight request.
export const searchApi = {
  query: (schoolId, q, signal) =>
    api.get(`/schools/${schoolId}/search`, { params: { q }, signal }),
}

// ── Phase 1D: subscription billing ───────────────────────────────────────────
export const billingApi = {
  get: (schoolId) => api.get(`/schools/${schoolId}/billing`),
  // Sellable-module catalog for the settings picker (labels + purchasable flags).
  catalog: (schoolId) => api.get(`/schools/${schoolId}/billing/catalog`),
  // Legacy base-plan checkout OR modular per-module checkout. Sends { modules }
  // when a non-empty module list is passed, else the legacy { plan } body.
  checkout: (schoolId, plan, modules) =>
    api.post(
      `/schools/${schoolId}/billing/checkout`,
      modules && modules.length ? { modules } : { plan },
    ),
  portal: (schoolId) => api.post(`/schools/${schoolId}/billing/portal`),
}

// The backend signals a lapsed trial / inactive subscription on a paid write
// (statement generate, import create) with HTTP 402 + code SUBSCRIPTION_REQUIRED.
// Per-module gating adds a DISTINCT 402 { code: 'MODULE_NOT_LICENSED', module }
// for an entitled-but-unlicensed school — that is a "add this module" state, NOT
// a "subscribe" state, so isPaymentRequired EXCLUDES it (they are mutually
// exclusive). A bare 402 with no code is still treated as the subscribe case.
export function isPaymentRequired(err) {
  const code = err?.response?.data?.code
  if (code === 'MODULE_NOT_LICENSED') return false
  return err?.response?.status === 402 || code === 'SUBSCRIPTION_REQUIRED'
}

// The entitled-but-not-licensed 402 — the school pays, but this module isn't on
// their plan. Surfaces an "add this module" CTA (distinct from "subscribe").
export function isModuleNotLicensed(err) {
  return err?.response?.data?.code === 'MODULE_NOT_LICENSED'
}

// The module key from a MODULE_NOT_LICENSED 402 body (e.g. 'planning'), or null.
export function moduleFromError(err) {
  return err?.response?.data?.module ?? null
}

// Extract a Nest error response's `code` field (e.g. LAST_OWNER) if present.
export function apiErrorCode(err) {
  return err?.response?.data?.code || null
}
