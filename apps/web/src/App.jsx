// Router. "/" is the PUBLIC marketing homepage (RootRoute: authed users are
// forwarded to the briefing at /app, logged-out visitors get the lazy-loaded
// LandingPage). Public auth pages live behind PublicOnlyRoute; the authed app
// (the existing smart-intake Dashboard, scoped to the selected school) lives
// behind ProtectedRoute. SchoolProvider wraps the authed branch so the
// switcher + report preview can read the user's schools.
import { Suspense, lazy, useSyncExternalStore } from 'react'
import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { SchoolProvider, useSchools } from './context/SchoolContext.jsx'
import { ScopeProvider } from './context/ScopeContext.jsx'
import { BillingProvider } from './context/BillingContext.jsx'
import { PersistenceProvider } from './context/PersistenceContext.jsx'
import { useAuth } from './context/AuthContext.jsx'
import { useUiV2 } from './context/UiFlagContext.jsx'
import { ProtectedRoute, PublicOnlyRoute, BootSplash } from './components/auth/RouteGuards.jsx'
import Onboarding from './components/onboarding/Onboarding.jsx'
import { onboardingSession } from './components/onboarding/onboardingSession.js'
import { PennyProvider } from './context/PennyContext.jsx'
import Penny from './components/penny/Penny.jsx'
import AppShell from './components/nav/AppShell.jsx'
import PennyAgentBridge from './components/penny/PennyAgentBridge.jsx'
import InviteResultToast from './components/InviteResultToast.jsx'
import HomePage from './pages/HomePage.jsx'
import TermsPage from './pages/legal/TermsPage.jsx'
import PrivacyPage from './pages/legal/PrivacyPage.jsx'
import PennyStudioPage from './pages/PennyStudioPage.jsx'
import DataHubPage from './pages/DataHubPage.jsx'
import FinancePage from './pages/FinancePage.jsx'
import StatementsPage from './pages/StatementsPage.jsx'
import CashCollectionsPage from './pages/CashCollectionsPage.jsx'
import AnalyticsPage from './pages/AnalyticsPage.jsx'
import BudgetPage from './pages/BudgetPage.jsx'
import ReadinessPage from './pages/ReadinessPage.jsx'
import CapPrintPage from './pages/CapPrintPage.jsx'
import WorkpapersPrintPage from './pages/WorkpapersPrintPage.jsx'
import BoardPacketPrintPage from './pages/BoardPacketPrintPage.jsx'
import ReportsPage from './pages/ReportsPage.jsx'
import GovernancePage from './pages/GovernancePage.jsx'
import AccreditationPage from './pages/AccreditationPage.jsx'
import FacilitiesPage from './pages/FacilitiesPage.jsx'
import AdvancementPage from './pages/AdvancementPage.jsx'
import EnrollmentPage from './pages/EnrollmentPage.jsx'
import DiocesanImportPage from './pages/DiocesanImportPage.jsx'
import TasksPage from './pages/TasksPage.jsx'
import KnowledgePage from './pages/KnowledgePage.jsx'
import SchedulesPage from './pages/SchedulesPage.jsx'
import BoardReportPrintPage from './pages/BoardReportPrintPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import AccountSection from './components/settings/AccountSection.jsx'
import MembersSection from './components/settings/MembersSection.jsx'
import SchoolSection from './components/settings/SchoolSection.jsx'
import OrgSection from './components/settings/OrgSection.jsx'
import ReportScheduleSection from './components/settings/ReportScheduleSection.jsx'
import AlertsSection from './components/settings/AlertsSection.jsx'
import IntegrationsSection from './components/settings/IntegrationsSection.jsx'
import BillingSection from './components/settings/BillingSection.jsx'
import QbCallbackPage from './pages/QbCallbackPage.jsx'
import EnrollmentBlackbaudCallbackPage from './pages/EnrollmentBlackbaudCallbackPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import VerifyEmailPage from './pages/VerifyEmailPage.jsx'
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx'
import ResetPasswordPage from './pages/ResetPasswordPage.jsx'

// The public marketing homepage — lazy so authed users never download it.
const LandingPage = lazy(() => import('./pages/landing/LandingPage.jsx'))

// Strategic Planning (Phase 5) — lazy so the flashy SVG-arc hero + its module
// bundle only load for schools that actually open /strategy.
const StrategyPage = lazy(() => import('./pages/StrategyPage.jsx'))

// "/" — OUTSIDE AuthedLayout — is the marketing homepage for EVERYONE (logged in
// or out), so the app logo can bring a signed-in user here. The app lives at /app;
// login navigates there, and the landing shows a "Go to app" affordance when the
// visitor is authenticated. Waits for the auth rehydrate (navy BootSplash, no white
// flash) so the landing's auth-aware nav renders correctly on first paint.
function RootRoute() {
  const { ready } = useAuth()
  // No spinner ahead of the marketing hero — a bare dark screen matching the
  // hero's pre-"power-on" background, so the auth rehydrate + lazy-chunk load
  // blend seamlessly into the hero's own TV-open intro (no loading circle).
  const fallback = <div className="min-h-screen bg-[#0a1526]" />
  if (!ready) return fallback
  return <Suspense fallback={fallback}>
      <LandingPage />
    </Suspense>
}

// 404: send signed-in users back into the app, everyone else to the homepage.
function NotFoundRoute() {
  const { isAuthenticated, ready } = useAuth()
  if (!ready) return <BootSplash />
  return <Navigate to={isAuthenticated ? '/app' : '/'} replace />
}

// /data — under ui.v2 the standalone Data hub is folded into each module's "Add
// data" tab, so /data redirects to Finance's Add-data tab (the primary destination
// + where the empty-finance CTA lands). Flag-off keeps the DataHubPage unchanged.
function DataRoute() {
  const uiV2 = useUiV2()
  return uiV2 ? <Navigate to="/finance?tab=add" replace /> : <DataHubPage />
}

// First-login gate: once the user's schools have loaded, a user with none is sent
// to onboarding (the multi-step setup wizard) instead of an empty dashboard. The
// wizard creates the first school mid-flow, which would flip this condition and
// eject the user before the optional MFA/QuickBooks steps — so the wizard also
// holds a session flag that keeps the gate here until it actually finishes. The
// QB OAuth callback is exempt so an in-flight connect can still complete.
function OnboardingGate({ children }) {
  const { schools, loading } = useSchools()
  const midOnboarding = useSyncExternalStore(onboardingSession.subscribe, onboardingSession.get)
  const onCallback =
    typeof window !== 'undefined' &&
    (window.location.pathname.startsWith('/integrations/qb/callback') ||
      window.location.pathname.startsWith('/enrollment/blackbaud/callback'))
  if (!loading && (schools.length === 0 || midOnboarding) && !onCallback) return <Onboarding />
  return children
}

// Shared authed layout: a single SchoolProvider wraps BOTH the dashboard and the
// settings routes so the active school + role context is consistent across them.
function AuthedLayout() {
  return (
    <ProtectedRoute>
      <SchoolProvider>
        <BillingProvider>
          <PersistenceProvider>
            <PennyProvider>
              <ScopeProvider>
                <OnboardingGate>
                  <AppShell>
                    <Outlet />
                  </AppShell>
                </OnboardingGate>
              </ScopeProvider>
              <Penny />
              {/* Surfaces the outcome of an emailed member invite redeemed on load. */}
              <InviteResultToast />
              {/* Headless: drives router navigation + DataHub modal-open from
                  Penny's agentic intents (navigate / per-step guide nav). */}
              <PennyAgentBridge />
            </PennyProvider>
          </PersistenceProvider>
        </BillingProvider>
      </SchoolProvider>
    </ProtectedRoute>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRoute />} />
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnlyRoute>
            <RegisterPage />
          </PublicOnlyRoute>
        }
      />
      {/* verify-email is reachable while logged out OR in; it just reads ?token */}
      <Route path="/verify-email" element={<VerifyEmailPage />} />

      {/* Public legal pages. /eula aliases the Terms (they double as the EULA —
          app-store reviews and integration approvals ask for that exact name). */}
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/eula" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route
        path="/forgot-password"
        element={
          <PublicOnlyRoute>
            <ForgotPasswordPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/reset-password"
        element={
          <PublicOnlyRoute>
            <ResetPasswordPage />
          </PublicOnlyRoute>
        }
      />
      <Route element={<AuthedLayout />}>
        <Route path="/app" element={<HomePage />} />
        <Route path="/penny" element={<PennyStudioPage />} />
        <Route path="/data" element={<DataRoute />} />
        <Route path="/finance" element={<FinancePage />} />
        <Route path="/statements" element={<StatementsPage />} />
        <Route path="/cash" element={<CashCollectionsPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/budget" element={<BudgetPage />} />
        <Route path="/readiness" element={<ReadinessPage />} />
        <Route path="/governance" element={<GovernancePage />} />
        <Route path="/accreditation" element={<AccreditationPage />} />
        <Route path="/facilities" element={<FacilitiesPage />} />
        <Route path="/advancement" element={<AdvancementPage />} />
        <Route
          path="/strategy"
          element={
            <Suspense fallback={<div className="min-h-screen bg-cream" />}>
              <StrategyPage />
            </Suspense>
          }
        />
        <Route path="/enrollment" element={<EnrollmentPage />} />
        <Route path="/enrollment/diocesan-import" element={<DiocesanImportPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/knowledge" element={<KnowledgePage />} />
        <Route path="/readiness/cap/print" element={<CapPrintPage />} />
        <Route path="/readiness/workpapers/print" element={<WorkpapersPrintPage />} />
        <Route path="/board-packet/print" element={<BoardPacketPrintPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/reports/schedules" element={<SchedulesPage />} />
        <Route path="/reports/board/print" element={<BoardReportPrintPage />} />
        <Route path="/integrations/qb/callback" element={<QbCallbackPage />} />
        <Route path="/enrollment/blackbaud/callback" element={<EnrollmentBlackbaudCallbackPage />} />
        {/* History folded into Statements & Periods — keep old links working. */}
        <Route path="/history" element={<Navigate to="/statements" replace />} />
        <Route path="/settings" element={<SettingsPage />}>
          <Route index element={<Navigate to="account" replace />} />
          <Route path="account" element={<AccountSection />} />
          <Route path="members" element={<MembersSection />} />
          <Route path="school" element={<SchoolSection />} />
          <Route path="organization" element={<OrgSection />} />
          <Route path="reports" element={<ReportScheduleSection />} />
          <Route path="alerts" element={<AlertsSection />} />
          <Route path="integrations" element={<IntegrationsSection />} />
          <Route path="billing" element={<BillingSection />} />
        </Route>
      </Route>
      {/* Catch-all: auth-aware — signed-in users return to /app, guests to the
          homepage (RootRoute previously did the forwarding; see NotFoundRoute).
          Original note retained: RootRoute forwards authed users to
          /app, and a logged-out dead link lands on marketing, not a login
          bounce. */}
      <Route path="*" element={<NotFoundRoute />} />
    </Routes>
  )
}
