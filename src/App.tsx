import { useState } from "react"
import { AppSidebar } from "@/components/layout/AppSidebar"
import { HomePage } from "@/pages/HomePage"
import { SubscriptionPage } from "@/pages/SubscriptionPage"
import { SettingsPage } from "@/pages/SettingsPage"

function App() {
  const [activeTab, setActiveTab] = useState("home")

  return (
    <div className="relative flex h-screen w-screen overflow-hidden p-2.5 gap-2.5">
      {/* Light mode background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#c5d0e8] via-[#d8e0f0] to-[#e8ecf5] dark:hidden" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.6)_0%,_transparent_50%)] dark:hidden" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(200,210,235,0.5)_0%,_transparent_50%)] dark:hidden" />
      
      {/* Dark mode background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f0f23] hidden dark:block" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(100,120,180,0.15)_0%,_transparent_50%)] hidden dark:block" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(80,100,160,0.1)_0%,_transparent_50%)] hidden dark:block" />
      
      <AppSidebar activeId={activeTab} onActiveIdChange={setActiveTab} />

      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white/25 backdrop-blur-2xl border border-white/50 dark:bg-black/30 dark:border-white/10 dark:backdrop-blur-2xl rounded-[24px] shadow-[0_8px_32px_rgba(31,38,135,0.1),inset_0_1px_0_rgba(255,255,255,0.5)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.05)] p-4 sm:p-5">
        {activeTab === "home" && <HomePage />}
        {activeTab === "subscription" && <SubscriptionPage />}
        {activeTab === "settings" && <SettingsPage />}
      </main>
    </div>
  )
}

export default App
