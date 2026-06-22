import { useEffect } from "react"
import { Routes, Route, Navigate } from "react-router-dom"
import useSWR from "swr"
import AuthLayout from "./components/AuthLayout"
import LoginPage from "./components/LoginPage"
import RegisterPage from "./components/RegisterPage"
import Dashboard from "./components/Dashboard"
import { useAuth } from "./contexts/AuthContext"
import { primeAllConfigTemplateCaches, purgeLegacyTemplateCache } from "./hooks/useSwr"
import { initNodeLatency } from "./lib/node-latency"

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-bg">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span className="text-sm text-text-muted">AureStream</span>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (user) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function App() {
  useEffect(() => {
    initNodeLatency()
  }, [])

  useSWR('swr-purgeLegacyTemplateCache-key', async () => {
    await purgeLegacyTemplateCache()
    return 'ok'
  }, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    dedupingInterval: Infinity,
  })

  useSWR('swr-primeAllConfigTemplateCaches-key', primeAllConfigTemplateCaches, {
    revalidateOnFocus: true,
    dedupingInterval: 60000 * 30,
  })

  return (
    <Routes>
      <Route element={<PublicOnly><AuthLayout /></PublicOnly>}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>
      <Route
        path="/dashboard/*"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default App
