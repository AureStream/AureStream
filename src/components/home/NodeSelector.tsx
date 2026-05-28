import { useState } from "react"
import {
  ArrowDownUpIcon,
  GlobeIcon,
  ActivityIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { proxyNodes } from "@/data/mock"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardTitle,
} from "@/components/ui/card"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

export function NodeSelector() {
  const [selectedId, setSelectedId] = useState(proxyNodes[0]?.id ?? "")

  return (
    <Card className="flex min-h-0 flex-1 flex-col rounded-[20px] overflow-hidden">
      <div className="flex items-center justify-between px-3 sm:px-4 pt-3.5 pb-2.5">
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">选择代理节点</CardTitle>
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500 dark:bg-white/[0.06] dark:text-slate-400">
            共 {proxyNodes.length} 个节点
          </span>
        </div>
        <div className="flex gap-1.5">
          <Button variant="ghost" size="sm" className="h-8 px-3 rounded-lg bg-[#eef2ff] text-[#3b59ff] text-xs font-bold hover:bg-blue-100/60 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20 transition-colors">
            <ActivityIcon className="size-3.5 mr-1" />
            一键测速
          </Button>
          <Button variant="ghost" size="sm" className="h-8 px-3 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200/60 dark:bg-white/[0.06] dark:text-white/70 dark:hover:bg-white/[0.1] transition-colors">
            <ArrowDownUpIcon className="size-3.5 mr-1" />
            延迟排序
          </Button>
        </div>
      </div>

      <CardContent className="flex min-h-0 flex-1 flex-col pt-0 overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
          <RadioGroup
            value={selectedId}
            onValueChange={setSelectedId}
            className="gap-2 pb-2"
          >
            {proxyNodes.map((node) => {
              const isSelected = selectedId === node.id
              return (
                <label
                  key={node.id}
                  htmlFor={`node-${node.id}`}
                  className={cn(
                    "flex cursor-pointer items-center justify-between rounded-[14px] p-2 sm:p-2.5 transition-all border duration-200 min-w-0",
                    isSelected
                      ? "bg-[#f4f7ff] border-[#bfdbfe]/60 shadow-[0_2px_8px_rgba(59,89,255,0.04)] dark:bg-blue-500/10 dark:border-blue-500/30"
                      : "bg-[#f8fafc]/30 border-slate-200/60 hover:bg-[#f8fafc]/60 dark:bg-white/[0.02] dark:border-white/[0.06] dark:hover:bg-white/[0.05]"
                  )}
                >
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                    <div
                      className={cn(
                        "flex size-7 sm:size-8 shrink-0 items-center justify-center rounded-xl transition-colors",
                        isSelected ? "bg-[#eef2ff] text-[#3b59ff] dark:bg-blue-500/25 dark:text-blue-400" : "bg-white text-slate-400 border border-slate-100 dark:bg-black dark:text-slate-500 dark:border-white/[0.08]"
                      )}
                    >
                      <GlobeIcon className="size-3.5 sm:size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate text-xs font-semibold",
                          isSelected ? "text-[#3b59ff] dark:text-blue-400" : "text-slate-800 dark:text-slate-200"
                        )}
                      >
                        {node.name}
                      </p>
                      <p className="truncate text-[10px] text-muted-foreground mt-0.5">
                        {node.host}:{node.port}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 ml-3 shrink-0">
                    <span className="text-[10px] text-slate-500 font-semibold dark:text-slate-400">
                      {node.latencyLabel}
                    </span>
                    <RadioGroupItem
                      value={node.id}
                      id={`node-${node.id}`}
                      className="size-4 text-[#3b59ff] border-slate-300 dark:border-white/[0.1]"
                    />
                  </div>
                </label>
              )
            })}
          </RadioGroup>
        </div>
      </CardContent>
    </Card>
  )
}
