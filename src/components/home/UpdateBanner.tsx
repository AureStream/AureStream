import { useState, useEffect } from "react"
import { DownloadIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { useNavigation } from "@/contexts/NavigationContext"

export function UpdateBanner() {
  const { t } = useTranslation()
  const { setActiveTab } = useNavigation()
  const [available, setAvailable] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater")
        const upd = await check()
        if (!cancelled && upd) setAvailable(upd.version)
      } catch {
        // silent — update server may be unreachable
      }
    }
    check()
    return () => { cancelled = true }
  }, [])

  if (!available) return null

  return (
    <button
      onClick={() => setActiveTab("settings")}
      className={cn(
        "flex items-center gap-2 w-full rounded-xl px-3.5 py-2.5",
        "bg-blue-500/8 border border-blue-500/20 hover:bg-blue-500/15 transition-colors cursor-pointer"
      )}
    >
      <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400">
        <DownloadIcon className="size-3.5" />
      </div>
      <div className="flex flex-col leading-tight text-left">
        <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">
          {t("update_available", { version: available })}
        </span>
        <span className="text-[11px] text-blue-600/70 dark:text-blue-400/60">
          {t("update_available_hint")}
        </span>
      </div>
    </button>
  )
}
