import { ConnectionPanel } from "@/components/home/ConnectionPanel"
import { NodeSelector } from "@/components/home/NodeSelector"
import { NetworkPanel } from "@/components/home/NetworkPanel"
import { SubscriptionPanel } from "@/components/home/SubscriptionPanel"
import { UsagePanel } from "@/components/home/UsagePanel"

export function HomePage() {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.22fr)_minmax(0,0.78fr)] gap-3 sm:gap-5">
      <div className="flex min-h-0 flex-col gap-2.5 sm:gap-4 overflow-hidden h-full">
        <ConnectionPanel className="h-[30%] min-h-[190px]" />
        <NodeSelector />
      </div>

      <div className="flex min-h-0 flex-col gap-2.5 sm:gap-4 overflow-hidden">
        <SubscriptionPanel />
        <NetworkPanel />
        <UsagePanel />
      </div>
    </div>
  )
}
