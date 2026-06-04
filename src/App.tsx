import { AppSidebar } from "@/components/layout/AppSidebar"
import { SubscriptionProvider } from "@/contexts/SubscriptionContext"
import { NavigationProvider, useNavigation } from "@/contexts/NavigationContext"
import { HomePage } from "@/pages/HomePage"
import { SubscriptionPage } from "@/pages/SubscriptionPage"
import { SettingsPage } from "@/pages/SettingsPage"
import "@/lib/i18n"

function AppLayout() {
  const { activeTab, setActiveTab } = useNavigation()

  return (
    <div className="relative flex h-screen w-screen overflow-hidden p-2.5 gap-2.5">
      {/* Light mode background */}
      <div className="absolute inset-0 bg-background dark:hidden" />
      <div className="absolute top-[-10%] right-[-10%] size-[450px] rounded-full bg-primary/15 blur-[110px] dark:hidden" />
      <div className="absolute bottom-[-10%] left-[-15%] size-[420px] rounded-full bg-[#6366f1]/12 blur-[100px] dark:hidden" />
      <div className="absolute top-[25%] left-[-10%] size-[350px] rounded-full bg-[#ec4899]/5 blur-[90px] dark:hidden" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(255,255,255,0.4)_0%,_transparent_80%)] dark:hidden" />

      {/* Dark mode background */}
      <div className="absolute inset-0 bg-background hidden dark:block" />
      <div className="absolute top-[-10%] right-[-10%] size-[380px] rounded-full bg-primary/10 blur-[100px] hidden dark:block" />
      <div className="absolute bottom-[-10%] left-[-10%] size-[380px] rounded-full bg-[#4f46e5]/6 blur-[100px] hidden dark:block" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(255,255,255,0.01)_0%,_transparent_75%)] hidden dark:block" />

      <AppSidebar />

      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-card/40 backdrop-blur-2xl border border-border/60 dark:bg-black/30 dark:border-white/10 rounded-[24px] shadow-sm p-4 sm:p-5">
        {activeTab === "home" && <HomePage />}
        {activeTab === "subscription" && <SubscriptionPage />}
        {activeTab === "settings" && <SettingsPage />}
      </main>
    </div>
  )
}

function App() {
  return (
    <NavigationProvider>
      <SubscriptionProvider>
        <AppLayout />
      </SubscriptionProvider>
    </NavigationProvider>
  )
}

export default App
