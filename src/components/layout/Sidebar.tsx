import { Home, Package, Settings, Moon, Sun, Zap, Monitor } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { cn } from "@/lib/utils";

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const { theme, toggleTheme } = useAppStore();

  const menuItems = [
    { id: "dashboard", label: "首页", icon: Home },
    { id: "providers", label: "服务商", icon: Package },
    { id: "settings", label: "设置", icon: Settings },
  ];

  return (
    <aside
      className={cn(
        "glass-rail flex flex-col shrink-0 w-[4.75rem]",
        "h-[calc(100vh-1.5rem)] my-3 ml-3 rounded-3xl",
        "relative z-10 overflow-hidden",
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.07] via-transparent to-primary/[0.03] pointer-events-none rounded-3xl" />

      {/* Logo */}
      <div className="relative flex flex-col items-center pt-5 pb-3">
        <div
          className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center shadow-lg shadow-primary/30 ring-2 ring-white/25 dark:ring-white/10"
          title="AureStream"
        >
          <Zap className="w-5 h-5 text-white" aria-hidden />
        </div>
      </div>

      <nav className="relative flex-1 flex flex-col items-center px-2 pt-2 gap-1">
        <ul className="flex flex-col gap-1.5 w-full">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <li key={item.id} className="w-full flex justify-center">
                <button
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  aria-label={item.label}
                  title={item.label}
                  className={cn(
                    "relative w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200",
                    isActive
                      ? "glass-strong text-primary shadow-[0_0_0_1px_rgba(45,212,191,0.35)] scale-[1.02]"
                      : "text-muted-foreground hover:bg-white/15 hover:text-foreground dark:hover:bg-white/10",
                  )}
                >
                  {isActive && (
                    <span
                      className="absolute -left-0.5 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-primary rounded-full shadow-[0_0_12px_rgba(45,212,191,0.6)]"
                      aria-hidden
                    />
                  )}
                  <Icon
                    className={cn("w-[19px] h-[19px]", isActive && "scale-110")}
                    strokeWidth={2}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="relative flex flex-col items-center px-2 pb-4 pt-2">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="切换主题"
          title={`当前主题: ${theme === "light" ? "浅色" : theme === "dark" ? "深色" : "跟随系统"}`}
          className="w-11 h-11 rounded-2xl flex items-center justify-center text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-all duration-300 active:scale-95"
        >
          {theme === "light" ? (
            <Sun className="w-[19px] h-[19px]" />
          ) : theme === "dark" ? (
            <Moon className="w-[19px] h-[19px]" />
          ) : (
            <Monitor className="w-[19px] h-[19px]" />
          )}
        </button>
      </div>
    </aside>
  );
}
