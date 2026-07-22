import React from "react"
import ReactDOM from "react-dom/client"
import { BrowserRouter } from "react-router-dom"

import App from "./App"
import TitleBar from "./components/TitleBar"
import { ThemeProvider } from "./components/ThemeProvider"
import { AuthProvider } from "./contexts/AuthContext"
import { UpdateProvider } from "./contexts/UpdateContext"
import "./index.css"
import "./i18n"

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <UpdateProvider>
            <div className="app-shell relative flex h-screen w-screen flex-col overflow-hidden bg-bg">
              <div className="absolute inset-0 app-network-background pointer-events-none z-0" />
              <div className="absolute inset-0 app-network-background-overlay pointer-events-none z-0" />
              <div className="relative z-10 flex h-full min-h-0 flex-col">
                <TitleBar />
                <div className="flex-1 min-h-0">
                  <App />
                </div>
              </div>
            </div>
          </UpdateProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
)
