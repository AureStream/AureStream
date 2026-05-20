import { useState, useEffect, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Moon, Sun, Info, Monitor, Globe, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageShell } from "@/components/layout/PageShell";
import { useAppStore } from "@/stores/appStore";
import { getVersion, type MihomoVersion } from "tauri-plugin-mihomo-api";

export function Settings() {
  const {
    theme,
    toggleTheme,
    proxyBypassDomains,
    setProxyBypassDomains,
    autoStart,
    autoConnect,
    setAutoStart,
    setAutoConnect,
  } = useAppStore();
  const [kernelVersion, setKernelVersion] = useState<MihomoVersion | null>(
    null,
  );
  const [kernelError, setKernelError] = useState(false);

  useEffect(() => {
    getVersion()
      .then(setKernelVersion)
      .catch(() => setKernelError(true));
  }, []);

  const SettingRow = ({
    icon: Icon,
    title,
    description,
    children,
  }: {
    icon: LucideIcon;
    title: string;
    description: string;
    children: ReactNode;
  }) => (
    <div className="liquid-glass-card p-4 sm:p-5 flex flex-row items-center justify-between gap-3 sm:gap-4">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-9 h-9 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center shrink-0 transition-colors">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm truncate">{title}</div>
          <div className="text-xs text-muted-foreground truncate">{description}</div>
        </div>
      </div>
      <div className="flex justify-end shrink-0">{children}</div>
    </div>
  );

  return (
    <PageShell title="设置">
      <div className="space-y-4">
        <div className="space-y-2">
          <SettingRow
            icon={Monitor}
            title="外观主题"
            description="选择跟随系统、浅色或深色模式"
          >
            <button
              type="button"
              onClick={toggleTheme}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 border border-border/40 hover:scale-[1.03] active:scale-95 transition-all select-none duration-200"
            >
              {theme === "system" ? (
                <>
                  <Monitor className="w-4 h-4 text-primary" />
                  <span>跟随系统</span>
                </>
              ) : theme === "light" ? (
                <>
                  <Sun className="w-4 h-4 text-amber-500 animate-spin" style={{ animationDuration: "12s" }} />
                  <span>浅色模式</span>
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4 text-indigo-400" />
                  <span>深色模式</span>
                </>
              )}
            </button>
          </SettingRow>

          <div className="liquid-glass-card p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                <Globe className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="font-semibold text-sm">网络代理</div>
                <div className="text-xs text-muted-foreground">
                  配置系统代理绕过名单
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label
                  htmlFor="proxyBypassDomains"
                  className="text-xs font-semibold ml-1"
                >
                  排除代理的域名或 IP
                </Label>
                <Input
                  id="proxyBypassDomains"
                  value={proxyBypassDomains}
                  onChange={(e) => setProxyBypassDomains(e.target.value)}
                  placeholder="localhost,127.*,10.*,192.168.*,<local>"
                  className="h-11 rounded-xl bg-black/5 dark:bg-white/5 border-none focus-visible:ring-1 focus-visible:ring-primary/50 transition-all"
                />
              </div>
              <p className="text-[11px] text-muted-foreground/80 leading-relaxed px-1">
                这些地址将不经过代理。示例：localhost, 127.*, 10.*, 192.168.*,
                *.local, &lt;local&gt;
              </p>
            </div>
          </div>

          <div className="liquid-glass-card p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="font-semibold text-sm">自动化</div>
                <div className="text-xs text-muted-foreground">
                  优化应用启动体验
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                {
                  label: "开机自启动",
                  desc: "随系统启动后台运行",
                  checked: autoStart,
                  onChange: setAutoStart,
                },
                {
                  label: "自动连接",
                  desc: "启动后恢复上次连接",
                  checked: autoConnect,
                  onChange: setAutoConnect,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/8 dark:hover:bg-white/8 transition-colors"
                >
                  <div>
                    <div className="text-sm font-medium">{item.label}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {item.desc}
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={item.checked}
                      onChange={(e) => item.onChange(e.target.checked)}
                    />
                    <div className="w-9 h-5.5 rounded-full bg-black/10 dark:bg-white/20 peer-checked:bg-primary transition-colors duration-300" />
                    <div className="absolute left-0.75 top-0.75 w-4 h-4 rounded-full bg-white shadow-md transition-transform duration-300 peer-checked:translate-x-3.5" />
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="liquid-glass-card p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                <Info className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="font-semibold text-sm">关于 AureStream</div>
                <div className="text-xs text-muted-foreground">
                  版本信息与内核状态
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-[13px]">
              {[
                { label: "应用版本", value: "1.0.0" },
                {
                  label: "内核版本",
                  value: kernelVersion
                    ? kernelVersion.version
                    : kernelError
                      ? "未运行"
                      : "检测中…",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex flex-col gap-0.5 p-2 rounded-lg bg-black/5 dark:bg-white/5"
                >
                  <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                    {item.label}
                  </span>
                  <span className="font-semibold">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
