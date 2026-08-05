import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AppShell from "@/components/AppShell";
import HomePage from "@/components/HomePage";
import LoginPage from "@/components/LoginPage";
import NodesPage from "@/components/NodesPage";
import ProfilePage from "@/components/ProfilePage";
import RegisterPage from "@/components/RegisterPage";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { EngineProvider } from "@/contexts/EngineContext";
import { SubsProvider } from "@/contexts/SubsContext";

/** Auth route gate only — never waits on subs sync / sessionReady. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user) {
    return <Navigate to="/" replace />;
  }
  return children;
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
  );
}

export default function App() {
  return (
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
  );
}
