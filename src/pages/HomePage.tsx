import { AppSidebar } from "@/components/layout/AppSidebar"
import { ConnectionPanel } from "@/components/home/ConnectionPanel"
import { NodeSelector } from "@/components/home/NodeSelector"
import { NetworkPanel } from "@/components/home/NetworkPanel"
import { SubscriptionPanel } from "@/components/home/SubscriptionPanel"
import { UsagePanel } from "@/components/home/UsagePanel"

export function HomePage() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gradient-to-br from-[#ebf1fc] via-[#f1f5fb] to-[#f7f9fd] p-2.5 gap-2.5">
      <AppSidebar />

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white/80 border border-white/60 rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.03)] p-4 sm:p-5">
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] gap-4 sm:gap-5">
          <div className="flex min-h-0 flex-col gap-3 sm:gap-4 overflow-hidden">
            <ConnectionPanel />
            <NodeSelector />
          </div>

          <div className="flex min-h-0 flex-col gap-3 sm:gap-4 overflow-hidden">
            <SubscriptionPanel />
            <NetworkPanel />
            <UsagePanel />
          </div>
        </div>
      </main>
    </div>
  )
}
