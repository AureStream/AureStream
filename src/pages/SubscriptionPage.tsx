import { useState, useEffect } from "react"
import {
  BoxIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  LinkIcon,
  CalendarIcon,
  ShieldCheckIcon,
  AlertCircleIcon,
  CheckCircle2Icon,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { badge, btn, iconBadge, surface, type } from "@/lib/typography"

import { useSubscriptions } from "@/hooks/useSubscriptions"
import { insertSubscription, deleteSubscription, updateSubscription } from "@/action/db"
import { message } from "@tauri-apps/plugin-dialog"
import { getStoreValue, setStoreValue, getEnableTun } from "@/single/store"
import { AUTO_UPDATE_STORE_KEY, UPDATE_INTERVAL_STORE_KEY } from "@/types/definition"
import type { UpdateInterval } from "@/types/definition"
import { mergeConnectionConfig } from "@/lib/connection-config"
import { ROUTING_MODE_KEY, normalizeRoutingMode } from "@/lib/routing-mode"
import { getEngineState } from "@/utils/vpn-service"

const getFriendlyNameFromUrl = (urlStr: string, t: (key: string) => string): string => {
  try {
    const parsed = new URL(urlStr)
    const pathname = parsed.pathname
    const segments = pathname.split("/").filter(Boolean)
    if (segments.length > 0) {
      const lastSegment = segments[segments.length - 1]
      const cleanName = lastSegment.split("?")[0].replace(/\.(yaml|yml|ini|txt|conf)$/i, "")
      if (cleanName && cleanName !== "subscribe" && cleanName !== "sub") {
        return decodeURIComponent(cleanName)
      }
    }
    const hostname = parsed.hostname
    const hostParts = hostname.split(".")
    if (hostParts.length > 1) {
      const domain = hostParts[hostParts.length - 2]
      if (domain && domain !== "com" && domain !== "net" && domain !== "org") {
        return domain.toUpperCase() + " " + t("subscription")
      }
    }
    return parsed.hostname + " " + t("subscription")
  } catch (e) {
    return t("unnamed_subscription")
  }
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 GB"
  const gb = bytes / (1024 * 1024 * 1024)
  if (gb < 0.01) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${gb.toFixed(1)} GB`
}

function formatExpiry(expireTimeMs: number, t: (key: string) => string): string {
  if (!expireTimeMs || expireTimeMs <= 0) return t("unlimited")
  const date = new Date(expireTimeMs)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function formatLastUpdate(timestamp: number, t: (key: string) => string): string {
  if (!timestamp || timestamp <= 0) return t("never")
  const date = new Date(timestamp * 1000)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function getStatus(expireTimeMs: number): "active" | "expired" | "expiring" {
  if (!expireTimeMs || expireTimeMs <= 0) return "active"
  const now = Date.now()
  if (expireTimeMs <= now) return "expired"
  if (expireTimeMs - now < 7 * 24 * 3600 * 1000) return "expiring"
  return "active"
}

export function SubscriptionPage() {
  const { t } = useTranslation()
  const {
    subscriptions,
    activeIdentifier,
    loading,
    refresh,
    selectSubscription,
    requireIdleForMutation,
  } = useSubscriptions()

  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [autoUpdate, setAutoUpdate] = useState(true)
  const [updateInterval, setUpdateInterval] = useState<UpdateInterval>("24h")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUpdatingAll, setIsUpdatingAll] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  // Load persisted auto-update settings
  useEffect(() => {
    getStoreValue(AUTO_UPDATE_STORE_KEY, true).then(setAutoUpdate)
    getStoreValue(UPDATE_INTERVAL_STORE_KEY, "24h").then((v) => setUpdateInterval(v as UpdateInterval))
  }, [])

  const handleAutoUpdateChange = async (val: boolean) => {
    setAutoUpdate(val)
    await setStoreValue(AUTO_UPDATE_STORE_KEY, val)
  }

  const handleUpdateIntervalChange = async (val: UpdateInterval) => {
    setUpdateInterval(val)
    await setStoreValue(UPDATE_INTERVAL_STORE_KEY, val)
  }

  /** Rebuild config.json and hot-reload if this is the active subscription and engine is running. */
  async function reloadIfActiveAndRunning(identifier: string) {
    if (identifier !== activeIdentifier) return
    const state = await getEngineState()
    if (state.kind !== "running") return
    try {
      const routingRaw = await getStoreValue(ROUTING_MODE_KEY, "rule")
      const routingMode = normalizeRoutingMode(routingRaw)
      const enableTun = await getEnableTun()
      await mergeConnectionConfig(activeIdentifier, routingMode, enableTun)
      const { invoke } = await import("@tauri-apps/api/core")
      await invoke("reload_config")
    } catch (e) {
      console.error("[subscription] config reload after update failed:", e)
    }
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url || isSubmitting) return
    setIsSubmitting(true)
    try {
      const finalName = name.trim() || getFriendlyNameFromUrl(url, t)
      const id = await insertSubscription(url, finalName)
      if (id) {
        await selectSubscription(id)
        setName("")
        setUrl("")
        await refresh()
      } else {
        await message(t("cannot_parse_subscription"), {
          title: t("import_failed"),
          kind: "error",
        })
      }
    } catch (err: any) {
      console.error(err)
      await message(`${t("add_failed")}: ${err.message || err}`, {
        title: t("error"),
        kind: "error",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (identifier: string) => {
    if (!(await requireIdleForMutation())) return
    try {
      await deleteSubscription(identifier)
      await refresh()
    } catch (err) {
      console.error(err)
    }
  }

  const handleSingleUpdate = async (identifier: string) => {
    setUpdatingId(identifier)
    try {
      const ok = await updateSubscription(identifier)
      if (ok) {
        await refresh()
        await reloadIfActiveAndRunning(identifier)
      } else {
        await message(t("update_subscription_failed"), {
          title: t("update_failed"),
          kind: "error",
        })
      }
    } catch (err) {
      console.error(err)
    } finally {
      setUpdatingId(null)
    }
  }

  const handleUpdateAll = async () => {
    if (isUpdatingAll) return
    setIsUpdatingAll(true)
    let activeWasUpdated = false
    try {
      for (const sub of subscriptions) {
        const ok = await updateSubscription(sub.identifier)
        if (ok && sub.identifier === activeIdentifier) {
          activeWasUpdated = true
        }
      }
      await refresh()
      if (activeWasUpdated) {
        await reloadIfActiveAndRunning(activeIdentifier)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsUpdatingAll(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden h-full">
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.22fr)_minmax(0,0.78fr)] gap-3.5 sm:gap-4.5 h-full overflow-y-auto lg:overflow-hidden pr-0.5 pb-2">
        {/* Left side: Subscription list */}
        <div className="flex min-h-0 flex-col gap-3 sm:gap-4 lg:h-full lg:overflow-hidden">
          <Card className="flex min-h-0 flex-1 flex-col rounded-[20px] overflow-hidden">
            <div className="flex items-center justify-between px-3 sm:px-4 pt-3.5 pb-2.5">
              <div className="flex items-center gap-1.5">
                <div className={iconBadge.purple}>
                  <BoxIcon />
                </div>
                <span className={type.sectionTitle}>{t("subscriptions_saved")}</span>
                <span className={badge.brand}>{t("total")} {subscriptions.length} {t("subscriptions_count")}</span>
              </div>
              <Button
                variant="ghost"
                size="xs"
                onClick={handleUpdateAll}
                disabled={isUpdatingAll || subscriptions.length === 0}
                className={cn(btn.accent, "h-8 px-2")}
              >
                <RefreshCwIcon className={cn("size-3.5 mr-0.5", isUpdatingAll && "animate-spin")} />
                {isUpdatingAll ? t("updating") : t("update_all")}
              </Button>
            </div>

            <CardContent className="flex min-h-0 flex-1 flex-col pt-0 overflow-hidden">
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-2 scrollbar-thin flex flex-col gap-3 pb-4">
                {loading ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 py-8">
                    <span className={type.description}>{t("loading")}</span>
                  </div>
                ) : subscriptions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 py-8">
                    <AlertCircleIcon className="size-8 opacity-40" />
                    <span className={type.description}>{t("no_subscription_yet")}</span>
                  </div>
                ) : (
                  subscriptions.map((sub) => {
                    const percent = sub.total_traffic > 0 ? (sub.used_traffic / sub.total_traffic) * 100 : 0
                    const isCurrent = sub.identifier === activeIdentifier
                    const status = getStatus(sub.expire_time)
                    return (
                      <div
                        key={sub.identifier}
                        onClick={() => selectSubscription(sub.identifier)}
                        className={cn(
                          "flex flex-col gap-2 rounded-[16px] border p-3.5 transition-all duration-200 cursor-pointer",
                          isCurrent
                            ? "bg-secondary border-primary/30 shadow-sm"
                            : status === "expired"
                            ? "bg-card border-border/60 opacity-60"
                            : "bg-card border-border/60 shadow-sm hover:border-primary/20 hover:bg-muted/20"
                        )}
                      >
                        {/* Subscription Info Header */}
                        <div className="flex items-start justify-between gap-3 min-w-0">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={cn(type.label, "truncate font-semibold")}>
                                {sub.name}
                              </span>
                              <span
                                className={cn(
                                  "shrink-0",
                                  status === "active" && badge.success,
                                  status === "expiring" && badge.warning,
                                  status === "expired" && badge.danger
                                )}
                              >
                                {status === "active" && t("in_service")}
                                {status === "expiring" && t("expiring_soon")}
                                {status === "expired" && t("expired")}
                              </span>
                            </div>
                            <div className={cn("flex items-center gap-1 mt-1", type.caption)}>
                              <LinkIcon className="size-3 shrink-0" />
                              <span className="truncate">{sub.subscription_url}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {isCurrent && (
                              <div className={cn(badge.success, "h-6 gap-1 px-2")}>
                                <CheckCircle2Icon className="size-3" />
                                {t("in_use")}
                              </div>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                              disabled={updatingId === sub.identifier}
                              onClick={(e) => {
                                e.stopPropagation()
                                handleSingleUpdate(sub.identifier)
                              }}
                              aria-label={t("update_subscription")}
                            >
                              <RefreshCwIcon className={cn("size-3.5", updatingId === sub.identifier && "animate-spin")} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 rounded-lg text-rose-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDelete(sub.identifier)
                              }}
                              aria-label={t("delete_subscription")}
                            >
                              <Trash2Icon className="size-3.5" />
                            </Button>
                          </div>
                        </div>

                        {/* Traffic progress */}
                        <div className="flex flex-col gap-1.5 mt-1">
                          <div className={cn("flex items-center justify-between", type.caption)}>
                            <span>{t("used")}: {formatBytes(sub.used_traffic)} / {formatBytes(sub.total_traffic)}</span>
                            <span className={cn("font-semibold", percent > 85 ? "text-destructive" : percent > 60 ? "text-amber-600 dark:text-amber-400" : "text-primary")}>
                              {percent.toFixed(1)}%
                            </span>
                          </div>
                          <Progress
                            value={percent}
                            className={cn(
                              "h-1.5 bg-muted",
                              status === "expired"
                                ? "[&>div]:bg-rose-500"
                                : percent > 85
                                ? "[&>div]:bg-rose-500"
                                : percent > 60
                                ? "[&>div]:bg-amber-500"
                                : "[&>div]:bg-primary"
                            )}
                          />
                        </div>

                        {/* Footer Info */}
                        <div className={cn("flex flex-col gap-1.5 mt-1 pt-1.5 border-t border-border/60", type.caption)}>
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1">
                              <CalendarIcon className="size-3" />
                              {t("expire_time")}: {formatExpiry(sub.expire_time, t)}
                            </span>
                            <span className="flex items-center gap-1">
                              <span className={cn("size-1.5 rounded-full", autoUpdate ? "bg-emerald-500" : "bg-slate-350 dark:bg-slate-600")} />
                              {t("auto_update")}: {autoUpdate ? updateInterval : t("close")}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-muted-foreground/80">
                            <span className="flex items-center gap-1">
                              <RefreshCwIcon className="size-3" />
                              {t("update_time")}: {formatLastUpdate(sub.last_update_time, t)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right side: Add subscription & Info card */}
        <div className="flex min-h-0 flex-col gap-3 sm:gap-4 lg:h-full lg:overflow-hidden">
          {/* Add subscription Form */}
          <Card className="shrink-0 rounded-[20px]">
            <CardContent className="flex flex-col gap-3.5 py-4 px-4">
              <div className="flex items-center gap-2">
                <div className={iconBadge.blue}>
                  <PlusIcon />
                </div>
                <span className={type.sectionTitle}>{t("add_subscription")}</span>
              </div>

              <form onSubmit={handleAdd} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label className={type.label}>{t("subscription_name_optional")}</label>
                  <input
                    type="text"
                    placeholder={t("auto_generate_name")}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="ui-input"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className={type.label}>{t("subscription_url")}</label>
                  <textarea
                    placeholder={t("paste_subscription_url")}
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    rows={3}
                    className="ui-textarea"
                    required
                  />
                </div>

                <div className={cn(surface.row, "flex items-center justify-between px-3 py-2 mt-0.5")}>
                  <div className="flex flex-col">
                    <span className={type.label}>{t("auto_update")}</span>
                    <span className={type.caption}>{t("auto_update_enabled")}</span>
                  </div>
                  <Switch size="sm" checked={autoUpdate} onCheckedChange={handleAutoUpdateChange} />
                </div>

                {autoUpdate && (
                  <div className="flex flex-col gap-1">
                    <label className={type.label}>{t("update_interval")}</label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(["6h", "12h", "24h", "7d"] as const).map((interval) => (
                        <button
                          key={interval}
                          type="button"
                          onClick={() => handleUpdateIntervalChange(interval)}
                          className={cn(
                            btn.pill,
                            "h-8",
                            updateInterval === interval && btn.pillActive
                          )}
                        >
                          {interval === "6h" && t("6hours")}
                          {interval === "12h" && t("12hours")}
                          {interval === "24h" && t("every_day")}
                          {interval === "7d" && t("every_week")}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-9 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-xs shadow-sm mt-1 transition-all"
                >
                  {isSubmitting ? t("fetching") : t("save_subscription")}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Tip / Info Card */}
          <Card className="flex-1 rounded-[20px] overflow-hidden">
            <CardContent className="flex flex-col gap-3.5 py-4 px-4 h-full">
              <div className="flex items-center gap-2">
                <div className={iconBadge.emerald}>
                  <ShieldCheckIcon />
                </div>
                <span className={type.sectionTitle}>{t("subscription_instructions")}</span>
              </div>

              <div className={cn(type.description, "space-y-2.5")}>
                <p>{t("instruction_1")}</p>
                <p>{t("instruction_2")}</p>
                <p>{t("instruction_3")}</p>
                <p>{t("instruction_4")}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
