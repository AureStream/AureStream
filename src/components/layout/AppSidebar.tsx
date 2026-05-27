import {
  BoxIcon,
  HomeIcon,
  SettingsIcon,
  SunIcon,
  ZapIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const navItems = [
  { id: "home", icon: HomeIcon, label: "首页", active: true },
  { id: "nodes", icon: BoxIcon, label: "节点", active: false },
  { id: "settings", icon: SettingsIcon, label: "设置", active: false },
] as const

export function AppSidebar() {
  return (
    <aside className="flex w-14 shrink-0 flex-col items-center justify-between rounded-[24px] border border-white/60 bg-white/80 py-4 shadow-[0_8px_32px_0_rgba(31,38,135,0.04)] backdrop-blur-md">
      <div className="flex flex-col items-center gap-6 w-full">
        {/* Top Logo */}
        <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-[#4d73ff] to-[#254eff] text-white shadow-md shadow-blue-500/20 cursor-pointer hover:opacity-90 transition-opacity">
          <ZapIcon className="size-4 fill-white/10" />
        </div>

        {/* Navigation */}
        <nav className="flex flex-col items-center gap-3 w-full px-2">
          {navItems.map((item) => (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "size-9 rounded-2xl transition-all duration-200",
                    item.active
                      ? "bg-[#eef2ff] text-[#3b59ff] border border-[#e0e7ff] shadow-sm"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                  aria-label={item.label}
                  aria-current={item.active ? "page" : undefined}
                >
                  <item.icon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          ))}
        </nav>
      </div>

      {/* Theme Toggle */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-2xl text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            aria-label="切换主题"
          >
            <SunIcon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">浅色模式</TooltipContent>
      </Tooltip>
    </aside>
  )
}
