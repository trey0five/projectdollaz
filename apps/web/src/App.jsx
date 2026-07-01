// Router. Public auth pages live behind PublicOnlyRoute; the authed app (the
// existing smart-intake Dashboard, scoped to the selected school) lives behind
// ProtectedRoute. SchoolProvider wraps the authed branch so the switcher +
// report preview can read the user's schools.
import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { SchoolProvider, useSchools } from './context/SchoolContext.jsx'
import { BillingProvider } from './context/BillingContext.jsx'
import { PersistenceProvider } from './context/PersistenceContext.jsx'
import { ProtectedRoute, PublicOnlyRoute } from './components/auth/RouteGuards.jsx'
import Onboarding from './components/onboarding/Onboarding.jsx'
import { PennyProvider } from './context/PennyContext.jsx'
import Penny from './components/penny/Penny.jsx'
import PennyAgentBridge from './components/penny/PennyAgentBridge.jsx'
import HomePage from './pages/HomePage.jsx'
import DataHubPage from './pages/DataHubPage.jsx'
import StatementsPage from './pages/StatementsPage.jsx'
import AnalyticsPage from './pages/AnalyticsPage.jsx'
import BudgetPage from './pages/BudgetPage.jsx'
import ReadinessPage from './pages/ReadinessPage.jsx'
import CapPrintPage from './pages/CapPrintPage.jsx'
import WorkpapersPrintPage from './pages/WorkpapersPrintPage.jsx'
import BoardPacketPrintPage from './pages/BoardPacketPrintPage.jsx'
import ReportsPage from './pages/ReportsPage.jsx'
import GovernancePage from './pages/GovernancePage.jsx'
import AccreditationPage from './pages/AccreditationPage.jsx'
import TasksPage from './pages/TasksPage.jsx'
import SchedulesPage from './pages/SchedulesPage.jsx'
import BoardReportPrintPage from './pages/BoardReportPrintPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import AccountSection from './components/settings/AccountSection.jsx'
import MembersSection from './components/settings/MembersSection.jsx'
import SchoolSection from './components/settings/SchoolSection.jsx'
import OrgSection from './components/settings/OrgSection.jsx'
import ReportScheduleSection from './components/settings/ReportScheduleSection.jsx'
import IntegrationsSection from './components/settings/IntegrationsSection.jsx'
import BillingSection from './components/settings/BillingSection.jsx'
import QbCallbackPage from './pages/QbCallbackPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import VerifyEmailPage from './pages/VerifyEmailPage.jsx'
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx'
import ResetPasswordPage from './pages/ResetPasswordPage.jsx'

// First-login gate: once the user's schools have loaded, a user with none is sent
// to onboarding (create your first school) instead of an empty dashboard. The QB
// OAuth callback is exempt so an in-flight connect can still complete.
function OnboardingGate({ children }) {
  const { schools, loading } = useSchools()
  const onCallback =
    typeof window !== 'undefined' && window.location.pathname.startsWith('/integrations/qb/callback')
  if (!loading && schools.length === 0 && !onCallback) return <Onboarding />
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
              <OnboardingGate>
                <Outlet />
              </OnboardingGate>
              <Penny />
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
        <Route path="/" element={<HomePage />} />
        <Route path="/data" element={<DataHubPage />} />
        <Route path="/statements" element={<StatementsPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/budget" element={<BudgetPage />} />
        <Route path="/readiness" element={<ReadinessPage />} />
        <Route path="/governance" element={<GovernancePage />} />
        <Route path="/accreditation" element={<AccreditationPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/readiness/cap/print" element={<CapPrintPage />} />
        <Route path="/readiness/workpapers/print" element={<WorkpapersPrintPage />} />
        <Route path="/board-packet/print" element={<BoardPacketPrintPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/reports/schedules" element={<SchedulesPage />} />
        <Route path="/reports/board/print" element={<BoardReportPrintPage />} />
        <Route path="/integrations/qb/callback" element={<QbCallbackPage />} />
        {/* History folded into Statements & Periods — keep old links working. */}
        <Route path="/history" element={<Navigate to="/statements" replace />} />
        <Route path="/settings" element={<SettingsPage />}>
          <Route index element={<Navigate to="account" replace />} />
          <Route path="account" element={<AccountSection />} />
          <Route path="members" element={<MembersSection />} />
          <Route path="school" element={<SchoolSection />} />
          <Route path="organization" element={<OrgSection />} />
          <Route path="reports" element={<ReportScheduleSection />} />
          <Route path="integrations" element={<IntegrationsSection />} />
          <Route path="billing" element={<BillingSection />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
