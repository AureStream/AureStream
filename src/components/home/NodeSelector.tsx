import { useState, useEffect, useMemo, useRef } from "react"
import { ArrowDownUpIcon, ActivityIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import { badge, btn, type } from "@/lib/typography"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardTitle } from "@/components/ui/card"
import { useSubscriptions } from "@/hooks/useSubscriptions"
import { useEngineState } from "@/hooks/useEngineState"
import { CountryFlag } from "@/components/ui/country-flag"
import { getCountryCode } from "@/lib/country-flags"
import { fetchSelectGroup, selectProxyNode, pingNodeTcp, testNodeDelay } from "@/utils/singbox-api"
import { scheduleConfigSync } from "@/lib/config-sync"
import { getStoreValue, setStoreValue } from "@/single/store"
import {
  LEGACY_SELECTED_NODE_TAG_KEY,
  selectedNodeTagStoreKey,
} from "@/types/definition"

/** Persist TCP-ping latencies across mounts so re-entering Home doesn't re-test. */
const latencyCache = new Map<string, Record<string, number>>()

async function getSavedNodeTag(
  subscriptionId: string,
  nodeNames: string[]
): Promise<string> {
  if (!subscriptionId) return ""
  const key = selectedNodeTagStoreKey(subscriptionId)
  let saved = (await getStoreValue(key)) as string | undefined
  if (!saved) {
    const legacy = (await getStoreValue(LEGACY_SELECTED_NODE_TAG_KEY)) as
      | string
      | undefined
    if (legacy && nodeNames.includes(legacy)) {
      saved = legacy
      await setStoreValue(key, legacy)
    }
  }
  return saved && nodeNames.includes(saved) ? saved : ""
}

async function setSavedNodeTag(
  subscriptionId: string,
  nodeTag: string
): Promise<void> {
  if (!subscriptionId) return
  await setStoreValue(selectedNodeTagStoreKey(subscriptionId), nodeTag)
}

export function NodeSelector() {
  const { t } = useTranslation()
  const { nodes, loading: subLoading, activeIdentifier } = useSubscriptions()
  const { isRunning } = useEngineState()

  const [selectedTag, setSelectedTag] = useState("")
  const [latencies, setLatencies] = useState<Record<string, number>>({})
  const [isTestingSpeed, setIsTestingSpeed] = useState(false)
  const [sortMode, setSortMode] = useState<"default" | "latency" | "name">("default")

  // Ref to suppress syncActiveNode from overwriting a manual node switch in progress
  const manualSwitchRef = useRef(false)
  // Timer handle for clearing the manual-switch grace period (cancel on rapid re-clicks)
  const manualSwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Ref mirror of selectedTag so callbacks always read the latest value
  const selectedTagRef = useRef(selectedTag)
  useEffect(() => { selectedTagRef.current = selectedTag }, [selectedTag])

  /** Arm the manual-switch guard; cancels any prior grace-period timer. */
  function beginManualSwitch() {
    if (manualSwitchTimerRef.current) clearTimeout(manualSwitchTimerRef.current)
    manualSwitchRef.current = true
  }

  /** Clear the manual-switch guard after `delayMs` (cancelled if a newer switch begins). */
  function endManualSwitchAfter(delayMs: number) {
    manualSwitchTimerRef.current = setTimeout(() => {
      manualSwitchRef.current = false
      manualSwitchTimerRef.current = null
    }, delayMs)
  }

  const nodeNames = useMemo(() => nodes.map((n) => n.name), [nodes])

  // Restore cached latency data for this subscription on mount / switch
  useEffect(() => {
    const cached = latencyCache.get(activeIdentifier)
    setLatencies(cached ?? {})
    setSelectedTag("")
  }, [activeIdentifier])

  // Sync selected node tag from store or sing-box controller API
  useEffect(() => {
    if (!activeIdentifier || nodeNames.length === 0) {
      setSelectedTag("")
      return
    }

    let cancelled = false
    const syncActiveNode = async () => {
      if (cancelled) return
      if (document.visibilityState === "hidden") return
      // Never overwrite a manual switch that's still in progress
      if (manualSwitchRef.current) return
      if (isRunning) {
        const group = await fetchSelectGroup()
        if (group && !cancelled) {
          if (group.now !== selectedTagRef.current) {
            setSelectedTag(group.now)
            await setSavedNodeTag(activeIdentifier, group.now)
          }
        }
      } else {
        const saved = await getSavedNodeTag(activeIdentifier, nodeNames)
        if (cancelled) return
        if (saved) {
          setSelectedTag(saved)
        } else if (nodeNames.length > 0) {
          const first = nodeNames[0]
          setSelectedTag(first)
          await setSavedNodeTag(activeIdentifier, first)
        }
      }
    }

    void syncActiveNode()

    let interval: ReturnType<typeof setInterval> | undefined
    if (isRunning) {
      interval = setInterval(syncActiveNode, 10_000)
    }

    return () => {
      cancelled = true
      if (interval) clearInterval(interval)
      if (manualSwitchTimerRef.current) clearTimeout(manualSwitchTimerRef.current)
    }
  }, [isRunning, activeIdentifier, nodeNames])

  const handleSelectNode = async (nodeTag: string) => {
    if (selectedTagRef.current === nodeTag) return

    const previousTag = selectedTagRef.current
    setSelectedTag(nodeTag)
    beginManualSwitch()
    await setSavedNodeTag(activeIdentifier, nodeTag)
    if (!isRunning) {
      scheduleConfigSync("node-changed")
    }

    if (isRunning) {
      const ok = await selectProxyNode(nodeTag)
      if (!ok) {
        // API call failed — revert UI to the actual previous state
        setSelectedTag(previousTag)
        await setSavedNodeTag(activeIdentifier, previousTag)
        manualSwitchRef.current = false
        return
      }
      // Dispatch once quickly in case connection is fast
      setTimeout(() => {
        window.dispatchEvent(new Event("node-changed"))
      }, 600)
      // Dispatch again later to guarantee fresh info after connection/handshake settles
      setTimeout(() => {
        window.dispatchEvent(new Event("node-changed"))
      }, 1800)
    }

    // Allow sync polling to resume after a grace period
    endManualSwitchAfter(3000)
  }

  const handleSpeedTest = async () => {
    if (isTestingSpeed) return
    setLatencies({})
    setIsTestingSpeed(true)

    try {
      const results: Record<string, number> = {}
      // Test delays in parallel and update state incrementally for real-time progress
      await Promise.all(
        nodes.map(async (node) => {
          const delay = isRunning 
            ? await testNodeDelay(node.name)
            : await pingNodeTcp(node.host, Number(node.port))
          results[node.name] = delay
          setLatencies((prev) => ({
            ...prev,
            [node.name]: delay,
          }))
        })
      )
      // Persist results so re-entering Home does not re-trigger auto-test
      latencyCache.set(activeIdentifier, results)
    } catch (e) {
      console.error(e)
    } finally {
      setIsTestingSpeed(false)
    }
  }

  // Map nodes to include latency details and sort if chosen
  const displayNodes = useMemo(() => {
    const mapped = nodes.map((node) => {
      const delay = latencies[node.name]
      let latencyLabel = t("not_tested")
      if (delay !== undefined) {
        if (delay > 0) {
          latencyLabel = `${delay} ms`
        } else {
          latencyLabel = t("timeout")
        }
      } else if (isTestingSpeed) {
        latencyLabel = t("testing")
      }
      return {
        ...node,
        latency: delay ?? -1,
        latencyLabel,
      }
    })

    if (sortMode === "latency") {
      return [...mapped].sort((a, b) => {
        const aVal = a.latency <= 0 ? 999999 : a.latency
        const bVal = b.latency <= 0 ? 999999 : b.latency
        return aVal - bVal
      })
    }
    if (sortMode === "name") {
      return [...mapped].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
    }
    return mapped
  }, [nodes, latencies, sortMode, isTestingSpeed, t])

  return (
    <Card className="flex min-h-0 min-w-0 flex-1 flex-col gap-1 rounded-[20px] py-0 @container">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1.5 px-4 sm:px-5 pt-2.5 pb-1.5">
        <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
          <CardTitle className="truncate">{t("select_proxy_node")}</CardTitle>
          <span className={cn(badge.brand, "shrink-0")}>
            {t("total_nodes", { count: displayNodes.length })}
          </span>
        </div>
        <div className="ml-auto flex shrink-0 gap-1">
          <Button
            variant="ghost"
            size="xs"
            onClick={handleSpeedTest}
            disabled={isTestingSpeed}
            aria-busy={isTestingSpeed}
            aria-label={t("one_click_speed_test")}
            className={cn(
              btn.toolbar,
              btn.toolbarActive,
              "active:scale-100",
              isTestingSpeed && "opacity-75"
            )}
          >
            <ActivityIcon
              className={cn("size-3 shrink-0", isTestingSpeed && "animate-spin")}
            />
            <span className={cn(btn.toolbarLabelWide, "hidden @[34rem]:inline-block")}>
              {t("one_click_speed_test")}
            </span>
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              if (sortMode === "default") setSortMode("latency")
              else if (sortMode === "latency") setSortMode("name")
              else setSortMode("default")
            }}
            aria-label={
              sortMode === "default"
                ? t("default_sort")
                : sortMode === "latency"
                  ? t("latency_sort")
                  : t("name_sort")
            }
            className={cn(
              btn.toolbar,
              "active:scale-100",
              sortMode !== "default" && btn.toolbarActive
            )}
          >
            <ArrowDownUpIcon className="size-3 shrink-0" />
            <span className={cn(btn.toolbarLabel, "hidden @[34rem]:inline-block")}>
              {sortMode === "default" && t("default_sort")}
              {sortMode === "latency" && t("latency_sort")}
              {sortMode === "name" && t("name_sort")}
            </span>
          </Button>
        </div>
      </div>

      <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col p-0 pb-4 sm:pb-5">
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-clip px-4 pt-1 sm:px-5 no-scrollbar">
          {subLoading ? (
            <div className={cn("flex items-center justify-center py-8", type.description)}>
              {t("loading")}
            </div>
          ) : displayNodes.length === 0 ? (
            <div className={cn("flex items-center justify-center py-8", type.description)}>
              {t("no_nodes_please_add_subscription")}
            </div>
          ) : (
            <div className="grid w-full min-w-0 grid-cols-1 @[32rem]:grid-cols-2 gap-2 pt-0.5 pb-2 [&>button]:min-w-0">
              {displayNodes.map((node) => {
                const isSelected = selectedTag === node.name
                return (
                  <button
                    key={node.name}
                    onClick={() => handleSelectNode(node.name)}
                    className={cn(
                      "grid w-full max-w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 rounded-[14px] p-2 transition-all border duration-200 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500",
                      isSelected
                        ? "bg-secondary border-primary/30 shadow-sm"
                        : "bg-muted/20 border-border/70 hover:bg-muted/40 dark:bg-white/[0.02] dark:hover:bg-white/[0.05]"
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-2 overflow-hidden sm:gap-2.5">
                      <div
                        className={cn(
                          "relative flex size-7 shrink-0 items-center justify-center rounded-full transition-colors overflow-hidden border border-border/40 sm:size-8",
                          isSelected
                            ? "bg-secondary text-primary"
                            : "bg-background text-muted-foreground border border-border"
                        )}
                      >
                        <CountryFlag
                          code={getCountryCode(node.name)}
                          title={t("flag")}
                        />
                      </div>
                      <div className="min-w-0 overflow-hidden">
                        <p
                          className={cn(
                            "truncate type-label font-semibold",
                            isSelected && "text-primary"
                          )}
                        >
                          {node.name}
                        </p>
                        <p className={cn(type.caption, "truncate mt-0.5 font-mono")}>
                          {node.host}:{node.port}
                        </p>
                      </div>
                    </div>

                    <div className="min-w-[4rem] shrink-0 justify-self-end text-right tabular-nums">
                      <span
                        className={cn(
                          "type-caption inline-block font-semibold font-mono whitespace-nowrap",
                          node.latencyLabel === t("timeout")
                            ? "text-rose-500"
                            : node.latencyLabel === t("testing")
                            ? "text-blue-500 dark:text-blue-400 animate-pulse"
                            : node.latency > 0
                            ? node.latency < 500
                              ? "text-emerald-500"
                              : "text-amber-500"
                            : "text-rose-500"
                        )}
                      >
                        {node.latencyLabel === t("not_tested") ? "\u00a0" : node.latencyLabel}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
