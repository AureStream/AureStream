import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { ask, message } from "@tauri-apps/plugin-dialog"
import { probeEngineServiceState, uninstallEngineService, invalidateEngineProbeCache, type EngineServiceState } from "../../lib/engine-probe"
import { getProxyPort, setProxyPort as writeProxyPort, getAllowLan, setAllowLan } from "../../single/store"

const I = {
  Trash: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  ),
  Shield: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-12 h-7 rounded-full p-0.5 transition-colors relative shadow-inner shrink-0 cursor-pointer ${on ? "bg-secondary" : "bg-border-light dark:bg-black/30"}`}
    >
      <div className={`w-6 h-6 rounded-full bg-white shadow-sm transition-transform absolute top-0.5 ${on ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  )
}

export default function HelperServiceSection() {
  const { i18n } = useTranslation()
  const l = (en: string, zh: string) => (i18n.language.startsWith("zh") ? zh : en)

  const [helperState, setHelperState] = useState<EngineServiceState | "unknown">("unknown")
  const [isUninstalling, setIsUninstalling] = useState(false)
  const [allowLan, setAllowLanState] = useState(false)
  const [proxyPort, setProxyPort] = useState(2080)

  useEffect(() => {
    probeEngineServiceState(true).then(setHelperState).catch(() => setHelperState("missing"))
    Promise.all([getProxyPort(), getAllowLan()]).then(([port, lan]) => {
      setProxyPort(port)
      setAllowLanState(lan)
    })
  }, [])

  const persist = (fn: () => Promise<void>) => fn().catch((e: unknown) => console.error("Failed to save setting:", e))

  const handleUninstallHelper = async () => {
    if (isUninstalling) return
    const confirmed = await ask(
      l(
        "This removes the privileged helper service used by Virtual TUN mode. Reinstall happens automatically next time you switch to TUN mode. Continue?",
        "这将移除虚拟网关模式所需的特权辅助服务，过程中可能需要输入系统密码。下次切换到虚拟网关模式时会自动重新安装。是否继续？"
      ),
      {
        title: l("Uninstall Helper Service", "卸载辅助服务"),
        kind: "warning",
        okLabel: l("Uninstall", "卸载"),
        cancelLabel: l("Cancel", "取消"),
      }
    )
    if (!confirmed) return

    try {
      setIsUninstalling(true)
      await uninstallEngineService()
      invalidateEngineProbeCache()
      setHelperState("missing")
      await message(l("Helper service uninstalled successfully.", "辅助服务已成功卸载。"), {
        title: l("Done", "完成"),
        kind: "info",
      })
    } catch (err) {
      console.error("Uninstall helper failed:", err)
      await message(l(`Failed to uninstall helper service: ${err}`, `卸载辅助服务失败：${err}`), {
        title: l("Uninstall Failed", "卸载失败"),
        kind: "error",
      })
      probeEngineServiceState(true).then(setHelperState).catch(() => {})
    } finally {
      setIsUninstalling(false)
    }
  }

  const helper = {
    ready: { dot: "bg-success", text: l("Installed", "已安装"), tone: "text-success" },
    unreachable: { dot: "bg-warning", text: l("Unresponsive", "无响应"), tone: "text-warning" },
    missing: { dot: "bg-text-muted", text: l("Not installed", "未安装"), tone: "text-text-muted" },
    unknown: { dot: "bg-text-muted animate-pulse", text: l("Checking...", "检测中..."), tone: "text-text-muted" },
  }[helperState]

  return (
    <div className="glass-card rounded-[24px] p-5 shadow-glass h-fit shrink-0">
      <div className="flex items-center gap-3 mb-4">
        <span className="w-8 h-8 rounded-xl flex items-center justify-center bg-blue-500/15 text-blue-500"><I.Shield /></span>
        <h3 className="text-sm font-extrabold text-text tracking-wide">{l("System Service", "系统服务")}</h3>
      </div>
      
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-surface-active/15 border border-border-glass/40">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="min-w-0">
              <div className="font-bold text-text text-sm whitespace-nowrap truncate">{l("Proxy Port", "代理端口")}</div>
              <div className="text-xs text-text-muted mt-0.5 whitespace-nowrap truncate">{l("SOCKS5 / HTTP", "本地监听端口")}</div>
            </div>
          </div>
          <input
            type="number"
            value={proxyPort}
            onChange={(e) => setProxyPort(Math.max(1, Math.min(65535, Number(e.target.value))))}
            onBlur={() => persist(() => writeProxyPort(Number(proxyPort)))}
            className="w-24 px-3 py-2 rounded-xl bg-surface-active/40 text-sm text-right font-mono focus:outline-none focus:ring-1 focus:ring-secondary/40 text-text shrink-0"
          />
        </div>

        <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-surface-active/15 border border-border-glass/40">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="min-w-0">
              <div className="font-bold text-text text-sm whitespace-nowrap truncate">{l("Allow LAN", "允许局域网连接")}</div>
              <div className="text-xs text-text-muted mt-0.5 whitespace-nowrap truncate">{l("Allow devices on the same network to connect", "允许同一局域网内的其他设备连接")}</div>
            </div>
          </div>
          <Toggle
            on={allowLan}
            onClick={() => {
              const next = !allowLan
              setAllowLanState(next)
              persist(() => setAllowLan(next))
            }}
          />
        </div>
        <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-surface-active/15 border border-border-glass/40">
          <div className="flex items-center gap-3 min-w-0">
            <span className="relative flex h-3 w-3 shrink-0">
              <span className={`relative inline-flex rounded-full h-3 w-3 ${helper.dot}`} />
            </span>
            <div className="min-w-0">
              <div className="font-bold text-text text-sm whitespace-nowrap truncate">
                {l("Helper Service", "系统辅助服务")}
                <span className={`ml-2 font-semibold text-xs ${helper.tone}`}>{helper.text}</span>
              </div>
              <div className="text-xs text-text-muted mt-0.5 whitespace-nowrap truncate">
                {l("Required for Virtual TUN mode.", "虚拟网关模式所需，需要时会自动重新安装")}
              </div>
            </div>
          </div>
          <button
            onClick={handleUninstallHelper}
            disabled={isUninstalling || helperState === "missing"}
            className="flex items-center gap-1.5 px-4 py-2 rounded-[12px] bg-secondary hover:bg-secondary/90 active:scale-[0.98] text-white text-xs font-extrabold shadow-md transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0 whitespace-nowrap"
          >
            <I.Trash />
            {isUninstalling ? l("Uninstalling...", "卸载中...") : l("Uninstall", "卸载")}
          </button>
        </div>
      </div>
    </div>
  )
}
