// Router. Public auth pages live behind PublicOnlyRoute; the authed app (the
// existing smart-intake Dashboard, scoped to the selected school) lives behind
// ProtectedRoute. SchoolProvider wraps the authed branch so the switcher +
// report preview can read the user's schools.
import { Routes, Route, Navigate } from 'react-router-dom'
import { SchoolProvider } from './context/SchoolContext.jsx'
import { ProtectedRoute, PublicOnlyRoute } from './components/auth/RouteGuards.jsx'
import AuthedShell from './components/AuthedShell.jsx'
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import VerifyEmailPage from './pages/VerifyEmailPage.jsx'
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx'
import ResetPasswordPage from './pages/ResetPasswordPage.jsx'

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
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <SchoolProvider>
              <AuthedShell />
            </SchoolProvider>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
