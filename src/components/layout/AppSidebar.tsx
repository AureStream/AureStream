import { useState, useEffect } from "react"
import {
  BoxIcon,
  HomeIcon,
  SettingsIcon,
  SunIcon,
  MoonIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useTheme } from "@/contexts/ThemeContext"
import { useNavigation } from "@/contexts/NavigationContext"

export function AppSidebar() {
  const { t } = useTranslation()
  const { theme, setTheme } = useTheme()
  const { activeTab, setActiveTab } = useNavigation()
  const [updateVersion, setUpdateVersion] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater")
        const upd = await check()
        if (!cancelled && upd) setUpdateVersion(upd.version)
      } catch {
        // silent — update server may be unreachable
      }
    }
    check()
    return () => { cancelled = true }
  }, [])

  const navItems = [
    { id: "home", icon: HomeIcon, label: t("home") },
    { id: "subscription", icon: BoxIcon, label: t("subscription") },
    { id: "settings", icon: SettingsIcon, label: t("settings") },
  ] as const

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
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => updateVersion && setActiveTab("settings")}
              className={cn(
                "relative flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4d73ff] to-[#254eff] text-white shadow-md shadow-blue-500/20 overflow-hidden p-1.5 transition-opacity",
                updateVersion ? "cursor-pointer hover:opacity-90" : "cursor-default"
              )}
            >
              <img src="/logo2.png" className="size-full object-contain" alt="AureStream Logo" />
              {updateVersion && (
                <span className="absolute top-0 right-0 size-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-black animate-pulse" />
              )}
            </button>
          </TooltipTrigger>
          {updateVersion && (
            <TooltipContent side="right">
              {t("update_available", { version: updateVersion })}
            </TooltipContent>
          )}
        </Tooltip>

        <nav className="flex flex-col items-center gap-3.5 w-full px-2">
          {navItems.map((item) => {
            const isActive = item.id === activeTab
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
                    onClick={() => setActiveTab(item.id)}
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
              aria-label={t("toggle_theme")}
            >
              <SunIcon className="size-5 rotate-0 scale-100 transition-transform duration-350 dark:-rotate-90 dark:scale-0" />
              <MoonIcon className="absolute size-5 rotate-90 scale-0 transition-transform duration-350 dark:rotate-0 dark:scale-100 text-blue-400" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {theme === "light" ? t("switch_to_dark") : t("switch_to_light")}
          </TooltipContent>
        </Tooltip>
      </div>
    </Card>
  )
}
