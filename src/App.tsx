import { useState } from "react"
import { AppSidebar } from "@/components/layout/AppSidebar"
import { HomePage } from "@/pages/HomePage"
import { SubscriptionPage } from "@/pages/SubscriptionPage"

function App() {
  const [activeTab, setActiveTab] = useState("home")

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gradient-to-br from-[#ebf1fc] via-[#f1f5fb] to-[#f7f9fd] p-2.5 gap-2.5">
      <AppSidebar activeId={activeTab} onActiveIdChange={setActiveTab} />

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white/80 border border-white/60 rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.03)] p-4 sm:p-5">
        {activeTab === "home" && <HomePage />}
        {activeTab === "subscription" && <SubscriptionPage />}
        {activeTab === "settings" && (
          <div className="flex items-center justify-center h-full text-slate-400 font-semibold text-xs">
            设置页面开发中...
          </div>
        )}
      </main>
    </div>
  )
}

export default App
