import React, { useMemo } from "react";
import { Home, Package, Settings, Sun, Moon, Monitor, Zap } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { cn } from "@/lib/utils";

interface MobileLayoutProps {
  children: React.ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
}

export function MobileLayout({ children, currentPage, onNavigate }: MobileLayoutProps) {
  const { theme, toggleTheme } = useAppStore();

  const tabs = useMemo(() => [
    { id: "dashboard", label: "首页", icon: Home },
    { id: "providers", label: "服务商", icon: Package },
    { id: "settings", label: "设置", icon: Settings },
  ], []);

  const activeIndex = useMemo(() => {
    const idx = tabs.findIndex((tab) => tab.id === currentPage);
    return idx === -1 ? 0 : idx;
  }, [currentPage, tabs]);

  const headerTitle = useMemo(() => {
    switch (currentPage) {
      case "dashboard":
        return "首页";
      case "providers":
        return "服务商管理";
      case "settings":
        return "系统设置";
      default:
        return "AureStream";
    }
  }, [currentPage]);

  return (
    <div className="relative flex flex-col h-screen w-full overflow-hidden bg-background select-none">
      {/* 1. Liquid background blobs */}
      <div className="liquid-blob-container" aria-hidden="true">
        <div className="liquid-blob liquid-blob-1" />
        <div className="liquid-blob liquid-blob-2" />
        <div className="liquid-blob liquid-blob-3" />
      </div>

      {/* 2. Top Navigation Bar */}
      <header className="sticky top-0 z-40 w-full h-[52px] flex items-center justify-between px-4 liquid-glass-header shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center shadow-md shadow-primary/20 ring-1 ring-white/10">
            <Zap className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-bold tracking-tight bg-gradient-to-r from-primary to-indigo-500 bg-clip-text text-transparent">
            AureStream
          </span>
        </div>

        <div className="flex items-center gap-3">
          <h2 className="text-[13px] font-semibold text-foreground/70 tracking-tight">
            {headerTitle}
          </h2>
          {/* Theme Toggle Button */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="切换主题"
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-95 transition-all"
          >
            {theme === "light" ? (
              <Sun className="w-4 h-4 text-amber-500" />
            ) : theme === "dark" ? (
              <Moon className="w-4 h-4 text-indigo-400" />
            ) : (
              <Monitor className="w-4 h-4" />
            )}
          </button>
        </div>
      </header>

      {/* 3. Main Content Area */}
      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pt-4 pb-[88px] [scrollbar-width:none] flex flex-col"
        style={{ paddingBottom: "calc(88px + env(safe-area-inset-bottom, 0px))" }}
      >
        {children}
      </main>

      {/* 4. Bottom Liquid Glass Tab Bar (Dock) */}
      <div
        className="absolute bottom-5 left-0 right-0 z-40 flex justify-center px-6 pointer-events-none"
        style={{ bottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}
      >
        <nav className="relative flex w-full max-w-[360px] h-[64px] items-center justify-between p-1.5 liquid-glass-dock pointer-events-auto">
          {/* Sliding Pill */}
          <div
            className="absolute top-1.5 bottom-1.5 rounded-full bg-primary/10 dark:bg-primary/20 border border-primary/25 dark:border-primary/20 liquid-pill-active shadow-[0_0_12px_rgba(59,130,246,0.15)]"
            style={{
              width: "calc((100% - 20px) / 3)",
              left: `calc(6px + ${activeIndex} * (100% - 8px) / 3)`,
            }}
          />

          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentPage === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onNavigate(tab.id)}
                className={cn(
                  "relative flex-1 h-full rounded-full flex flex-col items-center justify-center gap-0.5 transition-colors duration-300",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon
                  className={cn(
                    "w-[20px] h-[20px] transition-transform duration-300",
                    isActive && "scale-110"
                  )}
                  strokeWidth={2}
                />
                <span className="text-[10px] font-semibold tracking-wider">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
