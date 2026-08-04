import React from "react"
import ReactDOM from "react-dom/client"
import { BrowserRouter, useLocation } from "react-router-dom"

import App from "./App"
import TitleBar from "./components/TitleBar"
import { ThemeProvider } from "./components/ThemeProvider"
import { AuthProvider } from "./contexts/AuthContext"
import { UpdateProvider } from "./contexts/UpdateContext"
import "./index.css"

function AppShell() {
  const { pathname } = useLocation()
  const isProfilePage = pathname.startsWith("/dashboard/profile")
  const isAboutPage = pathname.startsWith("/dashboard/about")
  const usesImmersivePageBackground = isProfilePage || isAboutPage

  const shellClassName =
    "app-shell relative flex h-screen w-screen flex-col overflow-hidden bg-background"

  const immersiveBackgroundClassName = isProfilePage
    ? "absolute inset-0 pointer-events-none z-0 bg-[radial-gradient(circle_at_12%_0%,hsl(var(--primary)/0.16),transparent_42%),linear-gradient(135deg,hsl(var(--background))_0%,hsl(var(--card))_55%,hsl(var(--background))_100%)]"
    : "absolute inset-0 pointer-events-none z-0 bg-[radial-gradient(circle_at_50%_0%,hsl(var(--primary)/0.14),transparent_48%),radial-gradient(circle_at_100%_30%,rgba(165,243,252,0.16),transparent_36%),linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--card))_58%,hsl(var(--background))_100%)]"

  return (
    <div className={shellClassName}>
      {usesImmersivePageBackground ? (
        <div className={immersiveBackgroundClassName} />
      ) : (
        <>
          <div className="absolute inset-0 app-network-background pointer-events-none z-0" />
          <div className="absolute inset-0 app-network-background-overlay pointer-events-none z-0" />
        </>
      )}
      <div className="relative z-10 flex h-full min-h-0 flex-col">
        <TitleBar />
        <div className="flex-1 min-h-0">
          <App />
        </div>
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <UpdateProvider>
            <AppShell />
          </UpdateProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
)
