import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAlert } from "@/contexts/AlertContext"
import MobileTopBar from "@/components/MobileTopBar"
import { Switch } from "@/components/ui/switch"
import {
  type AppSettings,
  type AutoConnectMode,
  engineProbeTun,
  engineUninstallHelper,
  onSettingsChanged,
  settingsGet,
  settingsSet,
} from "@/lib/ipc"
import { cn } from "@/lib/utils"

const Icons = {
  Power: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
      <line x1="12" y1="2" x2="12" y2="12" />
    </svg>
  ),
  Minimize: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="14" y1="10" x2="21" y2="3" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  ),
  Zap: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  Shield: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  Check: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const { showConfirm, showErrorFromUnknown, showInfo } = useAlert()

  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tunHelperReady, setTunHelperReady] = useState(false)
  const [uninstallingHelper, setUninstallingHelper] = useState(false)

  const refreshTunHelper = useCallback(async () => {
    try {
      const s = await engineProbeTun()
      setTunHelperReady(s === "ready" || s === "running")
    } catch {
      setTunHelperReady(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    void settingsGet()
      .then((data) => {
        if (!cancelled) {
          setSettings(data)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          showErrorFromUnknown(err, "加载设置失败", "设置错误")
          setLoading(false)
        }
      })

    void refreshTunHelper()

    const unlistenPromise = onSettingsChanged((updated) => {
      if (!cancelled) {
        setSettings(updated)
      }
    })

    return () => {
      cancelled = true
      void unlistenPromise.then((fn) => fn())
    }
  }, [refreshTunHelper, showErrorFromUnknown])

  const handleUpdate = async (patch: Partial<AppSettings>) => {
    if (!settings || saving) return
    setSaving(true)
    try {
      const next = await settingsSet({
        autostart: patch.autostart,
        silentStart: patch.silentStart,
        autoConnect: patch.autoConnect,
        autoConnectMode: patch.autoConnectMode,
      })
      setSettings(next)
    } catch (err) {
      showErrorFromUnknown(err, "保存设置失败", "设置错误")
    } finally {
      setSaving(false)
    }
  }

  const handleUninstallHelper = async () => {
    const ok = await showConfirm({
      title: "卸载虚拟网卡组件",
      message:
        "将卸载虚拟网卡特权组件：\n• macOS：SMJobBless Helper\n• Windows：TUN 系统服务\n• Linux：pkexec Helper + polkit\n\n卸载后需重新开启虚拟网卡才会再次安装。",
      kind: "error",
      confirmLabel: "确认卸载",
    })
    if (!ok) return
    setUninstallingHelper(true)
    try {
      await engineUninstallHelper()
      setTunHelperReady(false)
      showInfo(
        "虚拟网卡组件已卸载。删除本应用前建议先执行此操作；若直接删除应用，各平台也会在后台自动清理残留组件。",
        "卸载完成",
      )
      void refreshTunHelper()
    } catch (err) {
      showErrorFromUnknown(err, "卸载虚拟网卡组件失败", "卸载失败")
    } finally {
      setUninstallingHelper(false)
    }
  }

  const modeOptions: { id: AutoConnectMode; label: string; desc: string }[] = [
    { id: "last", label: "上次使用", desc: "使用上一次连接成功的代理模式" },
    { id: "system", label: "系统代理", desc: "仅配置系统 HTTP / SOCKS5 代理" },
    { id: "tun", label: "虚拟网卡 (TUN)", desc: "接管全局网络流量，代理更彻底" },
  ]

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-white animate-fade-in dark:bg-background">
      <MobileTopBar onBack={() => navigate(-1)} title="通用设置" />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-6 pt-1">
        {loading || !settings ? (
          <div className="flex flex-1 items-center justify-center text-sm text-[#9aa0a6]">
            正在加载设置…
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Section 1: System & Boot */}
            <div className="flex flex-col gap-2">
              <span className="px-1 text-[12px] font-semibold text-[#8b93a0] uppercase tracking-wider">
                系统与启动
              </span>
              <div className="overflow-hidden rounded-[1.15rem] border border-[#eceef1] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.03)] dark:border-border dark:bg-card">
                {/* Autostart row */}
                <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-[#f1f2f4] dark:border-border/60">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--auth-accent)]/10 text-[var(--auth-accent)]">
                      <Icons.Power />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-bold text-[#1a1d21] dark:text-foreground">
                        开机自启动
                      </div>
                      <div className="text-[12px] font-medium text-[#8b93a0]">
                        开机时自动在后台启动 AureStream
                      </div>
                    </div>
                  </div>
                  <Switch
                    checked={settings.autostart}
                    disabled={saving}
                    onCheckedChange={(checked) => void handleUpdate({ autostart: checked })}
                    aria-label="开机自启动"
                  />
                </div>

                {/* Silent start row */}
                <div className="flex items-center justify-between gap-3 px-4 py-3.5">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--auth-accent)]/10 text-[var(--auth-accent)]">
                      <Icons.Minimize />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-bold text-[#1a1d21] dark:text-foreground">
                        静默启动到托盘
                      </div>
                      <div className="text-[12px] font-medium text-[#8b93a0]">
                        启动时不弹出主窗口，直接常驻系统托盘
                      </div>
                    </div>
                  </div>
                  <Switch
                    checked={settings.silentStart}
                    disabled={saving}
                    onCheckedChange={(checked) => void handleUpdate({ silentStart: checked })}
                    aria-label="静默启动到托盘"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Auto-connect */}
            <div className="flex flex-col gap-2">
              <span className="px-1 text-[12px] font-semibold text-[#8b93a0] uppercase tracking-wider">
                自动代理连接
              </span>
              <div className="overflow-hidden rounded-[1.15rem] border border-[#eceef1] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.03)] dark:border-border dark:bg-card">
                {/* Auto-connect switch row */}
                <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-[#f1f2f4] dark:border-border/60">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--auth-accent)]/10 text-[var(--auth-accent)]">
                      <Icons.Zap />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-bold text-[#1a1d21] dark:text-foreground">
                        启动时自动连接
                      </div>
                      <div className="text-[12px] font-medium text-[#8b93a0]">
                        应用启动后自动连接上次节点与代理
                      </div>
                    </div>
                  </div>
                  <Switch
                    checked={settings.autoConnect}
                    disabled={saving}
                    onCheckedChange={(checked) => void handleUpdate({ autoConnect: checked })}
                    aria-label="启动时自动连接"
                  />
                </div>

                {/* Auto-connect mode selector */}
                <div className="px-4 py-3.5">
                  <div className="mb-2 text-[13px] font-semibold text-[#1a1d21] dark:text-foreground">
                    自动连接模式
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {modeOptions.map((opt) => {
                      const selected = settings.autoConnectMode === opt.id
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          disabled={saving}
                          onClick={() => void handleUpdate({ autoConnectMode: opt.id })}
                          className={cn(
                            "flex items-center justify-between rounded-xl p-2.5 text-left transition-all cursor-pointer",
                            selected
                              ? "bg-[var(--auth-accent)]/10 text-[var(--auth-accent)] ring-1 ring-[var(--auth-accent)]/30"
                              : "bg-[#f7f8fa] hover:bg-[#f1f2f4] text-[#1a1d21] dark:bg-muted/50 dark:hover:bg-muted dark:text-foreground",
                          )}
                        >
                          <div className="min-w-0 flex-1 pr-2">
                            <div className="text-[13px] font-bold leading-tight">{opt.label}</div>
                            <div className="mt-0.5 text-[11px] font-medium text-[#8b93a0]">
                              {opt.desc}
                            </div>
                          </div>
                          {selected ? (
                            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--auth-accent)] text-white">
                              <Icons.Check />
                            </div>
                          ) : (
                            <div className="h-5 w-5 shrink-0 rounded-full border border-[#d5d9de] dark:border-border" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Section 3: TUN Helper Management */}
            <div className="flex flex-col gap-2">
              <span className="px-1 text-[12px] font-semibold text-[#8b93a0] uppercase tracking-wider">
                虚拟网卡状态
              </span>
              <div className="overflow-hidden rounded-[1.15rem] border border-[#eceef1] bg-white p-4 shadow-[0_2px_8px_rgba(15,23,42,0.03)] dark:border-border dark:bg-card">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--auth-accent)]/10 text-[var(--auth-accent)]">
                      <Icons.Shield />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-bold text-[#1a1d21] dark:text-foreground">
                        特权网卡组件
                      </div>
                      <div className="text-[12px] font-medium text-[#8b93a0]">
                        {tunHelperReady ? "组件已正确安装就绪" : "未检测到已安装的特权组件"}
                      </div>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                      tunHelperReady
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                    )}
                  >
                    {tunHelperReady ? "已就绪" : "未安装"}
                  </span>
                </div>

                {tunHelperReady ? (
                  <button
                    type="button"
                    onClick={() => void handleUninstallHelper()}
                    disabled={uninstallingHelper}
                    className="mt-3.5 h-9 w-full cursor-pointer rounded-full border border-[#eceef1] bg-white text-[13px] font-semibold text-[#6b7280] transition-all hover:bg-[#f8f9fb] active:scale-[0.98] disabled:opacity-60 dark:border-border dark:bg-card dark:text-muted-foreground"
                  >
                    {uninstallingHelper ? "卸载中…" : "卸载虚拟网卡特权组件"}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
