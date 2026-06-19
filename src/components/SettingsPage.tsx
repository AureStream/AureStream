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
  setEnableTun
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
  Globe: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>),
  Rocket: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>),
  Bell: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>),
  ShieldOff: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m2 2 20 20"/><path d="M5 5a1 1 0 0 0-1 1v7c0 5 3.5 7.5 7.67 8.94a1 1 0 0 0 .66 0c2.5-1.03 4.67-2.7 5.67-5.94"/><path d="M21 11V5a1 1 0 0 0-1-1l-8-3-8 3"/></svg>),
  Check: () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>),
  Alert: () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>),
  Trash: () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>),
}

export default function SettingsPage() {
  const { i18n } = useTranslation()
  const { theme, toggleTheme } = useTheme()
  const l = (en: string, zh: string) => i18n.language.startsWith('zh') ? zh : en;

  const [bypassDomains, setBypassDomains] = useState("")
  const [dnsServer, setDnsServer] = useState("8.8.8.8")
  const [proxyPort, setProxyPort] = useState(2080)
  const [autoConnect, setAutoConnect] = useState(true)
  const [notifications, setNotifications] = useState(false)
  
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle")

  const [helperState, setHelperState] = useState<EngineServiceState | "unknown">("unknown")
  const [isUninstalling, setIsUninstalling] = useState(false)

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const bypass = await getProxyBypass()
        const port = await getProxyPort()
        const dns = await getDirectDNS()
        const tun = await getEnableTun()
        
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
      await message(
        l("Helper service uninstalled successfully.", "辅助服务已成功卸载。"),
        { title: l("Done", "完成"), kind: "info" }
      )
    } catch (err) {
      console.error("Uninstall helper failed:", err)
      await message(
        l(`Failed to uninstall helper service: ${err}`, `卸载辅助服务失败：${err}`),
        { title: l("Uninstall Failed", "卸载失败"), kind: "error" }
      )
      probeEngineServiceState(true).then(setHelperState).catch(() => {})
    } finally {
      setIsUninstalling(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setSaveStatus("idle")
    try {
      await setProxyBypass(bypassDomains)
      await writeProxyPort(Number(proxyPort))
      await setDirectDNS(dnsServer)
      await setEnableTun(autoConnect)
      setSaveStatus("success")
      setTimeout(() => setSaveStatus("idle"), 3000)
    } catch (e) {
      console.error("Failed to save settings:", e)
      setSaveStatus("error")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 w-full h-full max-w-[1300px] mx-auto animate-fade-in px-8 pt-7 pb-5 overflow-hidden">
      
      {/* Bento Box Grid (No Header) */}
      <div className="flex flex-col gap-5 flex-grow h-full min-h-0">
        
        {/* Top Section - Preferences & Behavior (Compact 4-column layout) */}
        <div className="glass-card rounded-[28px] p-5 shadow-glass shrink-0">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-secondary"><I.Globe /></span>
            <h3 className="text-sm font-extrabold text-text uppercase tracking-wider">{l("Preferences & Behavior", "偏好与运行设置")}</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Theme */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-surface-active/10 border border-border-glass/40">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center shrink-0">
                  {theme === "dark" ? <I.Moon /> : <I.Sun />}
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-text text-xs truncate">{l("Theme", "外观主题")}</div>
                  <div className="text-[10px] text-text-muted mt-0.5 truncate">{theme === "dark" ? l("Dark", "深色") : l("Light", "浅色")}</div>
                </div>
              </div>
              <button 
                onClick={toggleTheme}
                className={`w-10 h-5.5 rounded-full p-0.5 transition-colors relative shadow-inner shrink-0 cursor-pointer ${theme === 'dark' ? 'bg-secondary' : 'bg-border-light dark:bg-black/20'}`}
              >
                <div className={`w-4.5 h-4.5 rounded-full bg-white shadow-sm transition-transform absolute top-0.5 ${theme === 'dark' ? 'translate-x-4.5' : 'translate-x-0.5'}`}></div>
              </button>
            </div>

            {/* Language */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-surface-active/10 border border-border-glass/40">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0">
                  <I.Globe />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-text text-xs truncate">{l("Language", "语言设置")}</div>
                  <div className="text-[10px] text-text-muted mt-0.5 truncate">{l("Display lang", "界面语言")}</div>
                </div>
              </div>
              <div className="flex bg-surface-active/50 rounded-lg p-0.5 border border-border-glass select-none shrink-0 scale-95 origin-right">
                <button 
                  onClick={() => i18n.changeLanguage("zh-CN")}
                  className={`px-2 py-0.5 text-[9px] font-bold rounded transition-all cursor-pointer ${i18n.language.startsWith("zh") ? 'glass-active-pill' : 'text-text-muted hover:text-text'}`}
                >
                  中
                </button>
                <button 
                  onClick={() => i18n.changeLanguage("en")}
                  className={`px-2 py-0.5 text-[9px] font-bold rounded transition-all cursor-pointer ${!i18n.language.startsWith("zh") ? 'glass-active-pill' : 'text-text-muted hover:text-text'}`}
                >
                  EN
                </button>
              </div>
            </div>

            {/* Auto Connect */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-surface-active/10 border border-border-glass/40">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-success/10 text-success flex items-center justify-center shrink-0">
                  <I.Rocket />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-text text-xs truncate">{l("Auto Connect", "开机自动连接")}</div>
                  <div className="text-[10px] text-text-muted mt-0.5 truncate">{l("Instant tunnel launch", "打开应用自动连接")}</div>
                </div>
              </div>
              <button 
                onClick={() => setAutoConnect(!autoConnect)}
                className={`w-10 h-5.5 rounded-full p-0.5 transition-colors relative shadow-inner shrink-0 cursor-pointer ${autoConnect ? 'bg-secondary' : 'bg-border-light dark:bg-black/20'}`}
              >
                <div className={`w-4.5 h-4.5 rounded-full bg-white shadow-sm transition-transform absolute top-0.5 ${autoConnect ? 'translate-x-4.5' : 'translate-x-0.5'}`}></div>
              </button>
            </div>

            {/* Notifications */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-surface-active/10 border border-border-glass/40">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center shrink-0">
                  <I.Bell />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-text text-xs truncate">{l("Notifications", "系统消息通知")}</div>
                  <div className="text-[10px] text-text-muted mt-0.5 truncate">{l("Alert warnings", "流量不足或断开消息")}</div>
                </div>
              </div>
              <button 
                onClick={() => setNotifications(!notifications)}
                className={`w-10 h-5.5 rounded-full p-0.5 transition-colors relative shadow-inner shrink-0 cursor-pointer ${notifications ? 'bg-secondary' : 'bg-border-light dark:bg-black/20'}`}
              >
                <div className={`w-4.5 h-4.5 rounded-full bg-white shadow-sm transition-transform absolute top-0.5 ${notifications ? 'translate-x-4.5' : 'translate-x-0.5'}`}></div>
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Section - Network & Advanced Routing (Fills remaining height) */}
        <div className="glass-card rounded-[28px] p-5 shadow-glass flex-1 min-h-0 flex flex-col justify-between overflow-hidden">
          <div className="flex flex-col h-full justify-between flex-grow min-h-0">
            <div className="shrink-0">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-warning"><I.ShieldOff /></span>
                  <h3 className="text-sm font-extrabold text-text uppercase tracking-wider">{l("Network & Routing Configuration", "网络及高级分流设置")}</h3>
                </div>
                <span className="px-2 py-0.5 text-[8px] font-extrabold bg-warning/10 text-warning rounded-full border border-warning/10 tracking-widest uppercase">{l("Advanced", "高级设置")}</span>
              </div>
              <p className="text-[11px] text-text-muted leading-relaxed">
                {l("Customize local port, direct DNS server, and list of domains/IPs that should bypass proxy tunnel.", "自定义本地代理端口、直连物理网络的DNS服务器，以及直接访问、跳过加密代理隧道的域名或IP白名单。")}
              </p>
            </div>

            {/* Form Fields & Textarea Container */}
            <div className="flex-1 flex flex-col gap-4 my-3 min-h-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">
                {/* Local Proxy Port */}
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-surface-active/10 border border-border-glass/40">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-bold text-text text-xs">{l("Mixed Proxy Port", "混合代理端口")}</span>
                    <span className="text-[10px] text-text-muted">{l("Local SOCKS5 / HTTP listener", "本地监听端口")}</span>
                  </div>
                  <input 
                    type="number"
                    value={proxyPort}
                    onChange={(e) => setProxyPort(Math.max(1, Math.min(65535, Number(e.target.value))))}
                    className="w-24 px-3 py-1.5 rounded-xl bg-surface-active/30 border border-border-glass text-xs text-right font-mono focus:outline-none focus:border-secondary/50 text-text"
                  />
                </div>

                {/* Direct DNS Server */}
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-surface-active/10 border border-border-glass/40">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-bold text-text text-xs">{l("Direct DNS Server", "直连 DNS 服务器")}</span>
                    <span className="text-[10px] text-text-muted">{l("DNS for direct traffic", "直连物理网络解析DNS")}</span>
                  </div>
                  <input 
                    type="text"
                    value={dnsServer}
                    onChange={(e) => setDnsServer(e.target.value)}
                    className="w-40 px-3 py-1.5 rounded-xl bg-surface-active/30 border border-border-glass text-xs text-right font-mono focus:outline-none focus:border-secondary/50 text-text"
                  />
                </div>
              </div>

              {/* Bypass domains text box (Fills remaining height) */}
              <div className="flex-1 flex flex-col min-h-0">
                <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1.5">{l("Bypass Domains & IPs List", "绕过代理域名与 IP 段列表")}</div>
                <textarea 
                  value={bypassDomains}
                  onChange={(e) => setBypassDomains(e.target.value)}
                  className="w-full flex-grow p-4 rounded-2xl bg-surface-active/10 border border-border-glass/60 focus:border-secondary/30 outline-none transition-all text-xs font-mono text-text resize-none shadow-inner no-scrollbar min-h-[100px]"
                  placeholder="localhost, 127.0.0.1, ::1"
                />
              </div>
            </div>

            <div className="shrink-0 flex justify-between items-center gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  onClick={handleUninstallHelper}
                  disabled={isUninstalling || helperState === "missing"}
                  title={l("Uninstall the privileged helper service", "卸载特权辅助服务")}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-danger/10 hover:bg-danger/15 text-danger text-[11px] font-bold tracking-wide border border-danger/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <I.Trash />
                  {isUninstalling
                    ? l("Uninstalling...", "正在卸载...")
                    : l("Uninstall Helper", "卸载辅助服务")}
                </button>
                <span className="text-[10px] text-text-muted truncate">
                  {helperState === "missing"
                    ? l("Helper not installed", "辅助服务未安装")
                    : helperState === "ready"
                      ? l("Helper installed", "辅助服务已安装")
                      : helperState === "unreachable"
                        ? l("Installed but unresponsive", "已安装但无响应")
                        : ""}
                </span>
              </div>
              <div className="flex items-center gap-3">
              {saveStatus === "success" && (
                <span className="text-success text-xs font-semibold flex items-center gap-1">
                  <I.Check /> {l("Settings saved successfully!", "配置保存成功！")}
                </span>
              )}
              {saveStatus === "error" && (
                <span className="text-danger text-xs font-semibold flex items-center gap-1">
                  <I.Alert /> {l("Failed to save configuration", "保存配置失败")}
                </span>
              )}
              <button 
                onClick={handleSave}
                disabled={isSaving}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-secondary to-accent-purple hover:opacity-95 text-white text-xs font-extrabold tracking-wider shadow-sm transition-all cursor-pointer disabled:opacity-75"
              >
                {isSaving ? l("Saving...", "正在保存...") : l("Save Configuration", "保存高级配置")}
              </button>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
