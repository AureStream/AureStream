import {
  BoxIcon,
  HomeIcon,
  SettingsIcon,
  ZapIcon,
  SunIcon,
  MoonIcon,
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
    if (theme === "light") {
      setTheme("dark")
    } else if (theme === "dark") {
      setTheme("light")
    } else {
      const isSystemDark = window.matchMedia("(prefers-color-scheme: dark)").matches
      setTheme(isSystemDark ? "light" : "dark")
    }
  }

  return (
    <Card className="w-16 shrink-0 py-4.5 !gap-0 flex flex-col items-center justify-between">
      <div className="flex flex-col items-center gap-7 w-full flex-1">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4d73ff] to-[#254eff] text-white shadow-md shadow-blue-500/20 cursor-pointer hover:opacity-90 transition-opacity overflow-hidden p-1.5">
          <img src="/logo2.png" className="size-full object-contain" alt="AureStream Logo" />
        </div>

        <nav className="flex flex-col items-center gap-3.5 w-full px-2">
          {navItems.map((item) => {
            const isActive = item.id === activeId
            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "size-11 rounded-2xl transition-all duration-200",
                      isActive
                        ? "bg-secondary text-secondary-foreground border border-primary/20 shadow-sm"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    )}
                    onClick={() => onActiveIdChange(item.id)}
                    aria-label={item.label}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <item.icon className="size-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            )
          })}
        </nav>
      </div>

      <div className="flex flex-col items-center gap-3 w-full px-2 mt-auto pt-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-11 rounded-2xl text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-all duration-200 dark:hover:bg-white/[0.08]"
              onClick={toggleTheme}
              aria-label="切换主题"
            >
              <SunIcon className="size-5 rotate-0 scale-100 transition-transform duration-350 dark:-rotate-90 dark:scale-0" />
              <MoonIcon className="absolute size-5 rotate-90 scale-0 transition-transform duration-350 dark:rotate-0 dark:scale-100 text-blue-400" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            切换到 {theme === "light" ? "深色模式" : "浅色模式"}
          </TooltipContent>
        </Tooltip>
      </div>
    </Card>
  )
}
