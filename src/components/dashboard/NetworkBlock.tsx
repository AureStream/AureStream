import { Globe, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { useProxyStore, useAppStore } from "@/stores/appStore";
import { getNetworkInfo, type NetworkInfo } from "@/lib/api";

const INFO_ROWS: { key: keyof NetworkInfo; label: string }[] = [
  { key: "fetchMode", label: "获取方式" },
  { key: "ip", label: "IP" },
  { key: "city", label: "城市" },
  { key: "region", label: "区域" },
  { key: "country", label: "国家" },
  { key: "asn", label: "ASN" },
  { key: "org", label: "组织" },
];

export function NetworkBlock({
  className,
}: {
  connectedIp?: string;
  className?: string;
}) {
  const isConnected = useProxyStore((s) => s.isConnected);
  const nodeId = useProxyStore((s) => s.currentNode?.id);
  const proxyMode = useAppStore((s) => s.proxyMode);
  const [info, setInfo] = useState<NetworkInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchId = useRef(0);

  const doFetch = useCallback(async (id: number) => {
    setLoading(true);
    try {
      const data = await getNetworkInfo();
      if (fetchId.current !== id) return;
      setInfo(data);
    } catch {
      // 失败后重试一次（代理路由可能尚未生效）
      setTimeout(async () => {
        try {
          const data = await getNetworkInfo();
          if (fetchId.current !== id) return;
          setInfo(data);
        } catch {
          // 静默失败
        } finally {
          if (fetchId.current === id) setLoading(false);
        }
      }, 2000);
      return;
    } finally {
      if (fetchId.current === id) setLoading(false);
    }
  }, []);

  // 自动刷新：连接/断开、切换节点、切换代理模式
  useEffect(() => {
    const id = ++fetchId.current;
    const delay = isConnected ? 1500 : 0;
    const timer = setTimeout(() => doFetch(id), delay);
    return () => clearTimeout(timer);
  }, [isConnected, nodeId, proxyMode, doFetch]);

  // 手动刷新
  const handleRefresh = useCallback(() => {
    const id = ++fetchId.current;
    doFetch(id);
  }, [doFetch]);

  const valueNode = (key: keyof NetworkInfo) => {
    if (loading && !info) {
      return (
        <span className="h-3 w-16 animate-pulse rounded bg-muted-foreground/20" />
      );
    }
    const val = info?.[key];
    if (!val && loading) {
      return (
        <span className="h-3 w-16 animate-pulse rounded bg-muted-foreground/20" />
      );
    }
    if (key === "fetchMode") {
      if (val === "代理") {
        return (
          <span className="inline-flex items-center rounded bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-500 ring-1 ring-inset ring-emerald-500/20">
            代理
          </span>
        );
      }
      if (val === "直连") {
        return (
          <span className="inline-flex items-center rounded bg-blue-500/10 px-2 py-0.5 text-xs font-semibold text-blue-500 ring-1 ring-inset ring-blue-500/20">
            直连
          </span>
        );
      }
    }
    return (
      <span className="text-xs font-medium tabular-nums text-foreground">
        {val || "-"}
      </span>
    );
  };

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex items-center gap-2.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Globe className="size-4 text-primary" strokeWidth={1.75} />
        </div>
        <span className="text-sm font-semibold text-foreground">网络信息</span>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={loading}
          className="ml-auto size-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          title="刷新网络信息"
        >
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
        </button>
      </div>

      <div className="flex flex-col gap-2 min-h-[7rem]">
        {INFO_ROWS.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground shrink-0">
              {label}
            </span>
            {valueNode(key)}
          </div>
        ))}
      </div>
    </div>
  );
}
