import {
  BoxIcon,
  HomeIcon,
  SettingsIcon,
  ZapIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useTheme } from "@/contexts/ThemeContext"

const navItems = [
  { id: "home", icon: HomeIcon, label: "首页" },
  { id: "subscription", icon: BoxIcon, label: "订阅管理" },
  { id: "settings", icon: SettingsIcon, label: "设置" },
] as const

interface AppSidebarProps {
  activeId: string
  onActiveIdChange: (id: string) => void
}

export function AppSidebar({ activeId, onActiveIdChange }: AppSidebarProps) {
  const { theme, setTheme } = useTheme()

  const toggleTheme = () => {
    if (theme === "system") {
      setTheme("light")
    } else if (theme === "light") {
      setTheme("dark")
    } else {
      setTheme("system")
    }
  }

  return (
    <Card className="w-14 shrink-0 py-4 !gap-0">
      <div className="flex flex-col items-center gap-6 w-full flex-1">
        {/* Top Logo */}
        <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-[#4d73ff] to-[#254eff] text-white shadow-md shadow-blue-500/20 cursor-pointer hover:opacity-90 transition-opacity">
          <ZapIcon className="size-4 fill-white/10" />
        </div>

        {/* Navigation */}
        <nav className="flex flex-col items-center gap-3 w-full px-2">
          {navItems.map((item) => {
            const isActive = item.id === activeId
            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "size-9 rounded-2xl transition-all duration-200",
                      isActive
                        ? "bg-[#eef2ff] text-[#3b59ff] border border-[#e0e7ff] shadow-sm dark:bg-white/[0.1] dark:text-white dark:border-white/[0.15]"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    )}
                    onClick={() => onActiveIdChange(item.id)}
                    aria-label={item.label}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <item.icon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            )
          })}
        </nav>
      </div>

      {/* Bottom Actions - Theme Toggle */}
      <div className="flex flex-col items-center gap-3 w-full px-2 mt-auto pt-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-9 rounded-2xl text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-all duration-200"
              onClick={toggleTheme}
              aria-label="切换主题"
            >
              {theme === "system" && <MonitorIcon className="size-4" />}
              {theme === "light" && <SunIcon className="size-4" />}
              {theme === "dark" && <MoonIcon className="size-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            主题: {theme === "system" ? "跟随系统" : theme === "light" ? "浅色" : "深色"} (点击切换)
          </TooltipContent>
        </Tooltip>
      </div>
    </Card>
  )
}
