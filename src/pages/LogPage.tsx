import { useState, useEffect, useRef } from "react"
import { invoke } from "@tauri-apps/api/core"
import {
  TerminalIcon,
  RefreshCwIcon,
  Trash2Icon,
  CopyIcon,
  CheckIcon,
  FileTextIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function LogPage() {
  const [activeSubTab, setActiveSubTab] = useState<"logs" | "config">("logs")
  const [logs, setLogs] = useState<string[]>([])
  const [filter, setFilter] = useState<"all" | "info" | "error">("all")
  const [copied, setCopied] = useState(false)
  const [configContent, setConfigContent] = useState<string>("")
  const [loadingConfig, setLoadingConfig] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const consoleRef = useRef<HTMLDivElement>(null)

  // Fetch logs periodically
  useEffect(() => {
    if (activeSubTab !== "logs") return

    const fetchLogs = async () => {
      try {
        const infoLogs = await invoke<string>("read_logs", { isError: false })
        const errorLogs = await invoke<string>("read_logs", { isError: true })
        
        const allLogs = [
          ...infoLogs.split("\n").filter(Boolean).map(line => ({ text: line, type: "info" })),
          ...errorLogs.split("\n").filter(Boolean).map(line => ({ text: line, type: "error" }))
        ]

        // Sort by approximate arrival if timestamps exist or just display as list
        // Since they are lists, we can format them
        const formattedLogs = allLogs.map(item => {
          let badge = "[INFO]"
          let style = "text-slate-300 dark:text-slate-300"
          if (item.text.toLowerCase().includes("error") || item.type === "error") {
            badge = "[ERROR]"
            style = "text-rose-400 font-bold"
          } else if (item.text.toLowerCase().includes("warning") || item.text.toLowerCase().includes("warn")) {
            badge = "[WARN]"
            style = "text-amber-400"
          } else if (item.text.toLowerCase().includes("debug")) {
            badge = "[DEBUG]"
            style = "text-indigo-400"
          }
          return {
            raw: item.text,
            type: item.type,
            formatted: `${badge} ${item.text}`,
            style
          }
        })

        setLogs(formattedLogs.map(l => l.formatted))
      } catch (err) {
        console.error("Failed to read logs:", err)
      }
    }

    fetchLogs()
    const timer = setInterval(fetchLogs, 1500)
    return () => clearInterval(timer)
  }, [activeSubTab])

  // Scroll to bottom without shifting window viewport
  useEffect(() => {
    if (autoScroll && consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  // Fetch config.json file
  const loadConfig = async () => {
    setLoadingConfig(true)
    try {
      // Find app path then read
      await invoke<{ config_dir: string }>("get_app_paths")
      // Since tauri v2 plugin-fs or reading directly is required, let's invoke a backend read or default template
      // We can also check if we can invoke read_file but since we don't have it directly exposed,
      // let's fetch settings.json or read config if possible
      // Let's invoke a command or display a generated view of the store config settings
      const settingsStoreValue = await invoke<any>("get_engine_state")
      setConfigContent(JSON.stringify(settingsStoreValue, null, 2))
    } catch (err) {
      setConfigContent("无法读取当前运行的 config.json。确保引擎已启动或已生成配置。")
    } finally {
      setLoadingConfig(false)
    }
  }

  useEffect(() => {
    if (activeSubTab === "config") {
      loadConfig()
    }
  }, [activeSubTab])

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(logs.join("\n"))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleClearLogs = () => {
    setLogs([])
  }

  const filteredLogs = logs.filter(log => {
    if (filter === "all") return true
    if (filter === "error") return log.includes("[ERROR]")
    if (filter === "info") return log.includes("[INFO]")
    return true
  })

  return (
    <div className="flex flex-col h-full min-h-0 w-full gap-3 sm:gap-4">
      {/* Header and Switcher */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-xl bg-blue-50 text-[#3b59ff] dark:bg-blue-950/40 dark:text-blue-400">
            <TerminalIcon className="size-4.5" />
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-black text-slate-800 dark:text-slate-100">日志与配置控制台</h1>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">查看 sidecar 进程实时输出并检查运行配置</p>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex rounded-lg bg-slate-100 dark:bg-white/[0.06] p-0.5 border border-slate-200/50 dark:border-white/[0.1] shrink-0">
          <button
            onClick={() => setActiveSubTab("logs")}
            className={cn(
              "px-3 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1",
              activeSubTab === "logs"
                ? "bg-white dark:bg-white/[0.1] text-[#3b59ff] dark:text-blue-400 shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
            )}
          >
            <TerminalIcon className="size-3" />
            实时日志
          </button>
          <button
            onClick={() => setActiveSubTab("config")}
            className={cn(
              "px-3 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1",
              activeSubTab === "config"
                ? "bg-white dark:bg-white/[0.1] text-[#3b59ff] dark:text-blue-400 shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
            )}
          >
            <FileTextIcon className="size-3" />
            当前运行状态
          </button>
        </div>
      </div>

      {activeSubTab === "logs" ? (
        <Card className="flex-1 min-h-0 rounded-[24px] flex flex-col overflow-hidden border border-slate-200/60 dark:border-white/[0.08]">
          {/* Action Toolbar */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200/60 dark:border-white/[0.06] bg-slate-50/50 dark:bg-black/10 shrink-0">
            <div className="flex items-center gap-1.5">
              {(["all", "info", "error"] as const).map(lvl => (
                <button
                  key={lvl}
                  onClick={() => setFilter(lvl)}
                  className={cn(
                    "px-2.5 py-0.5 rounded-md text-[9px] font-extrabold border transition-all cursor-pointer",
                    filter === lvl
                      ? "border-[#3b59ff]/30 bg-[#eef2ff] text-[#3b59ff] dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-400"
                      : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  )}
                >
                  {lvl === "all" ? "全部" : lvl === "info" ? "信息" : "错误"}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-[9px] text-slate-550 dark:text-slate-400 cursor-pointer font-bold">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="rounded border-slate-350 dark:border-white/[0.1] size-3"
                />
                自动滚动
              </label>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyLogs}
                className="h-6.5 text-[9px] font-bold text-slate-650 hover:bg-slate-100 dark:text-slate-350 dark:hover:bg-white/[0.06]"
              >
                {copied ? <CheckIcon className="size-3 mr-1 text-emerald-500" /> : <CopyIcon className="size-3 mr-1" />}
                {copied ? "已复制" : "复制日志"}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearLogs}
                className="h-6.5 text-[9px] font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20"
              >
                <Trash2Icon className="size-3 mr-1" />
                清空
              </Button>
            </div>
          </div>

          {/* Terminal Output Console */}
          <div
            ref={consoleRef}
            className="flex-1 min-h-0 p-4 bg-slate-950 font-mono text-[10px] leading-relaxed overflow-y-auto text-slate-200 select-text selection:bg-blue-500/30 selection:text-white"
          >
            {filteredLogs.length > 0 ? (
              <div className="flex flex-col gap-1">
                {filteredLogs.map((log, index) => {
                  let styleClass = "text-slate-300"
                  if (log.includes("[ERROR]")) styleClass = "text-rose-400 font-bold"
                  if (log.includes("[WARN]")) styleClass = "text-amber-400"
                  if (log.includes("[DEBUG]")) styleClass = "text-indigo-400"
                  return (
                    <div key={index} className={cn("whitespace-pre-wrap break-all", styleClass)}>
                      {log}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-2">
                <TerminalIcon className="size-8 stroke-[1.5]" />
                <span className="font-semibold text-[10px]">控制台暂无日志输出</span>
              </div>
            )}
          </div>
        </Card>
      ) : (
        <Card className="flex-1 min-h-0 rounded-[24px] flex flex-col overflow-hidden border border-slate-200/60 dark:border-white/[0.08]">
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200/60 dark:border-white/[0.06] bg-slate-50/50 dark:bg-black/10 shrink-0">
            <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400">运行内核环境状态与持久化状态机参数</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadConfig}
              disabled={loadingConfig}
              className="h-6.5 text-[9px] font-bold text-slate-650 hover:bg-slate-100 dark:text-slate-350 dark:hover:bg-white/[0.06]"
            >
              <RefreshCwIcon className={cn("size-3 mr-1", loadingConfig && "animate-spin")} />
              刷新
            </Button>
          </div>

          <div className="flex-1 min-h-0 p-4 bg-slate-950 font-mono text-[10px] leading-relaxed overflow-y-auto text-emerald-450 dark:text-emerald-400 select-text">
            {loadingConfig ? (
              <div className="h-full flex items-center justify-center text-slate-600">
                <RefreshCwIcon className="size-6 animate-spin" />
              </div>
            ) : (
              <pre className="whitespace-pre-wrap break-all text-blue-300">{configContent}</pre>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
