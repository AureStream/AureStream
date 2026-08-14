import type { ReactNode } from "react"
import { Loader2 } from "lucide-react"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import AppShell from "@/components/AppShell"
import HomePage from "@/components/HomePage"
import LoginPage from "@/components/LoginPage"
import NodesPage from "@/components/NodesPage"
import ProfilePage from "@/components/ProfilePage"
import RegisterPage from "@/components/RegisterPage"
import { AlertProvider } from "@/contexts/AlertContext"
import { AuthProvider, useAuth } from "@/contexts/AuthContext"
import { EngineProvider } from "@/contexts/EngineContext"
import { SubsProvider } from "@/contexts/SubsContext"
import { resolveAuthGate } from "@/lib/auth-route"

function AuthBootScreen() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-white dark:bg-background">
      <Loader2
        className="size-6 animate-spin text-[var(--auth-accent)]"
        strokeWidth={1.75}
        aria-hidden
      />
      <p className="mt-3 text-sm font-medium text-[#6b7280]">正在检查登录状态…</p>
    </div>
  )
}

/** Auth restore first — never send a restoring session to /login. Subs do not gate. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, authChecking } = useAuth()
  const decision = resolveAuthGate({
    checking: authChecking,
    hasUser: Boolean(user),
    kind: "protected",
  })
  if (decision === "wait") {
    return <AuthBootScreen />
  }
  if (decision === "login") {
    return <Navigate to="/login" replace />
  }
  return children
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, authChecking } = useAuth()
  const decision = resolveAuthGate({
    checking: authChecking,
    hasUser: Boolean(user),
    kind: "guest",
  })
  if (decision === "wait") {
    return <AuthBootScreen />
  }
  if (decision === "home") {
    return <Navigate to="/" replace />
  }
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <GuestOnly>
            <LoginPage />
          </GuestOnly>
        }
      />
      <Route
        path="/register"
        element={
          <GuestOnly>
            <RegisterPage />
          </GuestOnly>
        }
      />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/" element={<HomePage />} />
        <Route path="/nodes" element={<NodesPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AlertProvider>
      <AuthProvider>
        <SubsProvider>
          <EngineProvider>
            <BrowserRouter>
              <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-white dark:bg-background">
                <AppRoutes />
              </div>
            </BrowserRouter>
          </EngineProvider>
        </SubsProvider>
      </AuthProvider>
    </AlertProvider>
  )
}
