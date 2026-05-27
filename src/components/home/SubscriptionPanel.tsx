import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

export function SubscriptionPanel() {
  const usedPercent = 0

  return (
    <Card className="shrink-0 border border-slate-100 rounded-[20px] shadow-sm">
      <CardContent className="flex flex-col gap-2 pt-3 px-4">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
          <span>已用 0 GB</span>
          <span>共 0 GB</span>
        </div>
        <Progress value={usedPercent} className="h-1.5 bg-slate-100 [&>div]:bg-[#3b59ff]" />
      </CardContent>

      <CardFooter className="flex items-center justify-between pb-2.5 pt-1 px-4 text-xs font-medium text-slate-500">
        <span className="text-[#3b59ff]">{usedPercent.toFixed(1)}% 已使用</span>
        <div className="flex items-center gap-2">
          <span>到期 无限期</span>
          <Button variant="ghost" size="xs" className="h-6 px-2 rounded-md bg-[#eef2ff] text-[#3b59ff] text-[10px] font-semibold hover:bg-blue-100/60 transition-colors">
            管理
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}
