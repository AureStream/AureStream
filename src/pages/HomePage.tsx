import { ConnectionPanel } from "@/components/home/ConnectionPanel"
import { NodeSelector } from "@/components/home/NodeSelector"
import { NetworkPanel } from "@/components/home/NetworkPanel"
import { SubscriptionPanel } from "@/components/home/SubscriptionPanel"
import { UsagePanel } from "@/components/home/UsagePanel"

export function HomePage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden h-full">
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.22fr)_minmax(0,0.78fr)] gap-3.5 sm:gap-4.5 h-full overflow-y-auto lg:overflow-hidden pr-0.5 pb-2">
        <div className="flex min-h-0 flex-col gap-2.5 sm:gap-4 lg:h-full lg:overflow-hidden">
          <ConnectionPanel className="h-[30%] min-h-[190px]" />
          <NodeSelector />
        </div>

        <div className="flex min-h-0 flex-col gap-2.5 sm:gap-4 lg:h-full lg:overflow-hidden">
          <SubscriptionPanel />
          <NetworkPanel />
          <UsagePanel />
        </div>
      </div>
    </div>
  )
}
