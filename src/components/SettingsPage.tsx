import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { ask, message } from "@tauri-apps/plugin-dialog"
import { useTheme } from "./ThemeProvider"
import {
  getProxyBypass,
  setProxyBypass,
  getProxyPort,
  setProxyPort as writeProxyPort,
  getDirectDNS,
  setDirectDNS,
  getEnableTun,
  setEnableTun,
} from "../single/store"
import {
  probeEngineServiceState,
  uninstallEngineService,
  invalidateEngineProbeCache,
  type EngineServiceState,
} from "../lib/engine-probe"

/* ── Icons ── */
const I = {
  Moon: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>),
  Sun: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>),
  Desktop: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>),
  Globe: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>),
  Rocket: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>),
  Bell: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>),
  Sliders: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>),
  Route: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/></svg>),
  Server: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>),
  Check: () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>),
  Alert: () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>),
  Trash: () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>),
  Save: () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>),
}

/* ── Reusable bits ── */
function SectionHeader({ icon, title, tint, badge }: { icon: React.ReactNode; title: string; tint: string; badge?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2.5">
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${tint}`}>{icon}</span>
        <h3 className="text-[13px] font-extrabold text-text tracking-wide">{title}</h3>
      </div>
      {badge}
    </div>
  )
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-11 h-6 rounded-full p-0.5 transition-colors relative shadow-inner shrink-0 cursor-pointer ${on ? "bg-secondary" : "bg-border-light dark:bg-black/30"}`}
    >
      <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform absolute top-0.5 ${on ? "translate-x-5" : "translate-x-0.5"}`}></div>
    </button>
  )
}

function PrefRow({ icon, tint, title, desc, control }: { icon: React.ReactNode; tint: string; title: string; desc: string; control: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-surface-active/15 border border-border-glass/40 hover:bg-surface-active/25 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tint}`}>{icon}</div>
        <div className="min-w-0">
          <div className="font-bold text-text text-xs truncate">{title}</div>
          <div className="text-[10px] text-text-muted mt-0.5 truncate">{desc}</div>
        </div>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  )
}

export default function SettingsPage() {
  const { i18n } = useTranslation()
  const { theme, mode, setMode } = useTheme()
  const l = (en: string, zh: string) => (i18n.language.startsWith("zh") ? zh : en)

  const [bypassDomains, setBypassDomains] = useState("")
  const [dnsServer, setDnsServer] = useState("8.8.8.8")
  const [proxyPort, setProxyPort] = useState(2080)
  const [autoConnect, setAutoConnect] = useState(true)
  const [notifications, setNotifications] = useState(false)

  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle")

  const [helperState, setHelperState] = useState<EngineServiceState | "unknown">("unknown")
  const [isUninstalling, setIsUninstalling] = useState(false)

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [bypass, port, dns, tun] = await Promise.all([
          getProxyBypass(),
          getProxyPort(),
          getDirectDNS(),
          getEnableTun(),
        ])
        setBypassDomains(bypass)
        setProxyPort(port)
        setDnsServer(dns)
        setAutoConnect(tun)
      } catch (e) {
        console.error("Failed to load settings:", e)
      }
    }
    loadSettings()
    probeEngineServiceState(true)
      .then(setHelperState)
      .catch(() => setHelperState("missing"))
  }, [])

  const handleUninstallHelper = async () => {
    if (isUninstalling) return
    const confirmed = await ask(
      l(
        "This removes the privileged helper service used by Virtual TUN mode. You may be asked for your system password. Reinstall happens automatically next time you switch to TUN mode. Continue?",
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

  const flashSaved = () => {
    setSaveStatus("saved")
    setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 1600)
  }

  // Persist a single field; called on blur for inputs and on change for toggles.
  const persist = async (fn: () => Promise<void>) => {
    try {
      await fn()
      flashSaved()
    } catch (e) {
      console.error("Failed to save setting:", e)
      setSaveStatus("error")
      setTimeout(() => setSaveStatus((s) => (s === "error" ? "idle" : s)), 2500)
    }
  }

  const toggleAutoConnect = () => {
    const next = !autoConnect
    setAutoConnect(next)
    persist(() => setEnableTun(next))
  }

  const helper = {
    ready: { dot: "bg-success", text: l("Installed", "已安装"), tone: "text-success" },
    unreachable: { dot: "bg-warning", text: l("Unresponsive", "无响应"), tone: "text-warning" },
    missing: { dot: "bg-text-muted", text: l("Not installed", "未安装"), tone: "text-text-muted" },
    unknown: { dot: "bg-text-muted animate-pulse", text: l("Checking...", "检测中..."), tone: "text-text-muted" },
  }[helperState]

  return (
    <div className="relative flex flex-col w-full h-full max-w-[1080px] mx-auto animate-fade-in px-8 py-6 overflow-y-auto no-scrollbar gap-5">

      {/* Auto-save indicator (transient) */}
      <div
        className={`pointer-events-none fixed bottom-6 right-8 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-glass transition-all duration-300 ${
          saveStatus === "idle"
            ? "opacity-0 translate-y-1"
            : "opacity-100 translate-y-0"
        } ${
          saveStatus === "error"
            ? "bg-danger/15 text-danger border border-danger/20"
            : "bg-success/15 text-success border border-success/20"
        }`}
      >
        {saveStatus === "error" ? <I.Alert /> : <I.Check />}
        {saveStatus === "error" ? l("Save failed", "保存失败") : l("Saved", "已保存")}
      </div>

      {/* Preferences */}
      <div className="glass-card rounded-[24px] p-5 shadow-glass shrink-0">
        <SectionHeader
          icon={<I.Sliders />}
          tint="bg-secondary/15 text-secondary"
          title={l("Preferences & Behavior", "偏好与运行设置")}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <PrefRow
            icon={mode === "system" ? <I.Desktop /> : theme === "dark" ? <I.Moon /> : <I.Sun />}
            tint="bg-secondary/10 text-secondary"
            title={l("Theme", "外观主题")}
            desc={mode === "system" ? l("Follow system", "跟随系统") : theme === "dark" ? l("Dark mode", "深色模式") : l("Light mode", "浅色模式")}
            control={
              <div className="flex bg-surface-active/50 rounded-lg p-0.5 border border-border-glass select-none">
                {([
                  { key: "system", label: l("System", "系统") },
                  { key: "dark", label: l("Dark", "深色") },
                  { key: "light", label: l("Light", "浅色") },
                ] as const).map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setMode(opt.key)}
                    className={`px-2.5 py-1 text-[10px] font-bold rounded transition-all cursor-pointer ${mode === opt.key ? "glass-active-pill" : "text-text-muted hover:text-text"}`}
                  >{opt.label}</button>
                ))}
              </div>
            }
          />
          <PrefRow
            icon={<I.Globe />}
            tint="bg-purple-500/10 text-purple-500"
            title={l("Language", "语言设置")}
            desc={l("Display language", "界面显示语言")}
            control={
              <div className="flex bg-surface-active/50 rounded-lg p-0.5 border border-border-glass select-none">
                <button
                  onClick={() => i18n.changeLanguage("zh-CN")}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded transition-all cursor-pointer ${i18n.language.startsWith("zh") ? "glass-active-pill" : "text-text-muted hover:text-text"}`}
                >中</button>
                <button
                  onClick={() => i18n.changeLanguage("en")}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded transition-all cursor-pointer ${!i18n.language.startsWith("zh") ? "glass-active-pill" : "text-text-muted hover:text-text"}`}
                >EN</button>
              </div>
            }
          />
          <PrefRow
            icon={<I.Rocket />}
            tint="bg-success/10 text-success"
            title={l("Auto Connect", "开机自动连接")}
            desc={l("Connect on app launch", "打开应用时自动连接")}
            control={<Toggle on={autoConnect} onClick={toggleAutoConnect} />}
          />
          <PrefRow
            icon={<I.Bell />}
            tint="bg-orange-500/10 text-orange-500"
            title={l("Notifications", "系统消息通知")}
            desc={l("Traffic & disconnect alerts", "流量不足或断开提醒")}
            control={<Toggle on={notifications} onClick={() => setNotifications(!notifications)} />}
          />
        </div>
      </div>

      {/* System service */}
      <div className="glass-card rounded-[24px] p-5 shadow-glass shrink-0">
        <SectionHeader
          icon={<I.Server />}
          tint="bg-danger/15 text-danger"
          title={l("System Service", "系统辅助服务")}
        />
        <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-surface-active/15 border border-border-glass/40">
          <div className="flex items-center gap-3 min-w-0">
            <span className={`relative flex h-2.5 w-2.5 shrink-0`}>
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${helper.dot}`}></span>
            </span>
            <div className="min-w-0">
              <div className="font-bold text-text text-xs">
                {l("Privileged Helper", "特权辅助服务")}
                <span className={`ml-2 font-semibold ${helper.tone}`}>{helper.text}</span>
              </div>
              <div className="text-[10px] text-text-muted mt-0.5 truncate">
                {l("Required for Virtual TUN mode. Reinstalls automatically when needed.", "虚拟网关模式所需，需要时会自动重新安装。")}
              </div>
            </div>
          </div>
          <button
            onClick={handleUninstallHelper}
            disabled={isUninstalling || helperState === "missing"}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-danger/10 hover:bg-danger/20 text-danger text-[11px] font-bold tracking-wide border border-danger/20 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            <I.Trash />
            {isUninstalling ? l("Uninstalling...", "卸载中...") : l("Uninstall", "卸载")}
          </button>
        </div>
      </div>

      {/* Network & routing */}
      <div className="glass-card rounded-[24px] p-5 shadow-glass shrink-0">
        <SectionHeader
          icon={<I.Route />}
          tint="bg-warning/15 text-warning"
          title={l("Network & Routing", "网络与分流设置")}
          badge={<span className="px-2 py-0.5 text-[8px] font-extrabold bg-warning/10 text-warning rounded-full border border-warning/10 tracking-widest uppercase">{l("Advanced", "高级")}</span>}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-surface-active/15 border border-border-glass/40">
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="font-bold text-text text-xs">{l("Mixed Proxy Port", "混合代理端口")}</span>
              <span className="text-[10px] text-text-muted truncate">{l("Local SOCKS5 / HTTP", "本地监听端口")}</span>
            </div>
            <input
              type="number"
              value={proxyPort}
              onChange={(e) => setProxyPort(Math.max(1, Math.min(65535, Number(e.target.value))))}
              onBlur={() => persist(() => writeProxyPort(Number(proxyPort)))}
              className="w-24 px-3 py-2 rounded-xl bg-surface-active/40 text-xs text-right font-mono focus:outline-none focus:ring-1 focus:ring-secondary/40 text-text"
            />
          </div>

          <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-surface-active/15 border border-border-glass/40">
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="font-bold text-text text-xs">{l("Direct DNS Server", "直连 DNS 服务器")}</span>
              <span className="text-[10px] text-text-muted truncate">{l("DNS for direct traffic", "直连流量解析")}</span>
            </div>
            <input
              type="text"
              value={dnsServer}
              onChange={(e) => setDnsServer(e.target.value)}
              onBlur={() => persist(() => setDirectDNS(dnsServer))}
              className="w-40 px-3 py-2 rounded-xl bg-surface-active/40 text-xs text-right font-mono focus:outline-none focus:ring-1 focus:ring-secondary/40 text-text"
            />
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">{l("Bypass Domains & IPs", "绕过代理域名与 IP 段")}</span>
            <span className="text-[10px] text-text-muted">{l("comma separated", "逗号分隔")}</span>
          </div>
          <textarea
            value={bypassDomains}
            onChange={(e) => setBypassDomains(e.target.value)}
            onBlur={() => persist(() => setProxyBypass(bypassDomains))}
            className="w-full h-28 p-4 rounded-2xl bg-surface-active/15 focus:ring-1 focus:ring-secondary/30 outline-none transition-all text-xs font-mono text-text resize-none shadow-inner no-scrollbar"
            placeholder="localhost, 127.0.0.1, ::1"
          />
        </div>
      </div>
    </div>
  )
}
