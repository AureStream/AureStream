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
      <div className="absolute inset-0 bg-[#EEEEEE] dark:hidden" />
      <div className="absolute top-[-10%] right-[-10%] size-[450px] rounded-full bg-[#007ACC]/18 blur-[110px] dark:hidden" />
      <div className="absolute bottom-[-10%] left-[-15%] size-[420px] rounded-full bg-[#6366f1]/12 blur-[100px] dark:hidden" />
      <div className="absolute top-[25%] left-[-10%] size-[350px] rounded-full bg-[#ec4899]/5 blur-[90px] dark:hidden" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(255,255,255,0.4)_0%,_transparent_80%)] dark:hidden" />
      
      {/* Dark mode background */}
      <div className="absolute inset-0 bg-[#101010] hidden dark:block" />
      <div className="absolute top-[-10%] right-[-10%] size-[380px] rounded-full bg-[#007ACC]/10 blur-[100px] hidden dark:block" />
      <div className="absolute bottom-[-10%] left-[-10%] size-[380px] rounded-full bg-[#4f46e5]/6 blur-[100px] hidden dark:block" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(255,255,255,0.01)_0%,_transparent_75%)] hidden dark:block" />
      
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
