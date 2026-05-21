import { useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { MainContent } from "@/components/layout/MainContent";
import { Dashboard } from "@/pages/Dashboard";
import { Providers } from "@/pages/Providers";
import { Settings } from "@/pages/Settings";
import { useAppStore, useProxyStore } from "@/stores/appStore";
import { loadPersistedState } from "@/lib/persistStore";
import { Toaster } from "@/components/ui/sonner";
import { listen } from "@tauri-apps/api/event";
import { LoadingScreen } from "@/components/LoadingScreen";

function applyTheme(theme: string) {
  const root = document.documentElement;
  if (theme === "system") {
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  } else if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

function App() {
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [isInitializing, setIsInitializing] = useState(true);
  const { theme } = useAppStore();

  useEffect(() => {
    const init = async () => {
      // 阶段 1：并行加载设置和延迟缓存
      await Promise.allSettled([
        useAppStore.getState().loadSettings(),
        useProxyStore.getState().loadCache(),
      ]);

      // 应用 theme
      applyTheme(useAppStore.getState().theme);

      // 阶段 2：加载 providers（依赖缓存先就绪）
      await useProxyStore.getState().loadProviders();
      useProxyStore.getState().initAutoUpdateTimers();

      // 阶段 3：恢复上次选择的 provider/node
      try {
        const savedState = await loadPersistedState();
        if (savedState.lastProviderId) {
          const providers = useProxyStore.getState().providers;
          const provider = providers.find(
            (p) => p.id === savedState.lastProviderId,
          );
          if (provider) {
            useProxyStore.getState().setCurrentProvider(provider);

            // 恢复节点
            if (savedState.lastNodeId) {
              const nodes = useProxyStore.getState().nodes;
              const node = nodes.find((n) => n.id === savedState.lastNodeId);
              if (node) {
                useProxyStore.getState().setCurrentNode(node);
              }
            }
          }
        }
      } catch (e) {
        console.warn("恢复上次状态失败:", e);
      }

      // 阶段 4：自动连接（若上次退出时已连接且开启了自动连接）
      try {
        const { autoConnect } = useAppStore.getState();
        if (autoConnect && useProxyStore.getState().currentProvider) {
          await useProxyStore.getState().connect();
        }
      } catch (e) {
        console.warn("自动连接失败:", e);
      }

      setIsInitializing(false);
    };

    init();

    // 监听托盘节点切换事件
    const unlisten = listen<string>("tray-select-node", async (event) => {
      const nodeId = event.payload;
      const { nodes, isConnected } = useProxyStore.getState();
      if (!isConnected) return;
      const node = nodes.find((n) => n.id === nodeId);
      if (node) {
        await useProxyStore.getState().applyNodeSelection(node);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const openProviders = () => setCurrentPage("providers");

  useEffect(() => {
    applyTheme(theme);
    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => applyTheme("system");
      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    }
  }, [theme]);

  const renderPage = () => {
    switch (currentPage) {
      case "dashboard":
        return <Dashboard onOpenProviders={openProviders} />;
      case "providers":
        return <Providers />;
      case "settings":
        return <Settings />;
      default:
        return <Dashboard onOpenProviders={openProviders} />;
    }
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden gap-3 ">
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
      <MainContent>{renderPage()}</MainContent>
      <Toaster richColors />
      <LoadingScreen visible={isInitializing} />
    </div>
  );
}

export default App;
