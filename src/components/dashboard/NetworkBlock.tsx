import { Globe, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { useProxyStore, useAppStore } from "@/stores/appStore";
import { getNetworkInfo, type NetworkInfo } from "@/lib/api";

export function NetworkBlock({
  className,
}: {
  className?: string;
}) {
  const isConnected = useProxyStore((s) => s.isConnected);
  const nodeId = useProxyStore((s) => s.currentNode?.id);
  const proxyMode = useAppStore((s) => s.proxyMode);
  const [info, setInfo] = useState<NetworkInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchId = useRef(0);

  const doFetch = useCallback(async (id: number, attempt = 0) => {
    if (fetchId.current !== id) return;
    setLoading(true);
    try {
      const data = await getNetworkInfo();
      if (fetchId.current !== id) return;
      setInfo(data);
      setLoading(false);
    } catch {
      if (fetchId.current !== id) return;
      // 节点切换后代理路由可能尚未生效，重试最多 3 次，间隔递增
      if (attempt < 3) {
        const delay = 2000 + attempt * 1500;
        setTimeout(() => doFetch(id, attempt + 1), delay);
      } else {
        setLoading(false);
      }
    }
  }, []);

  // 自动刷新：连接/断开、切换节点、切换代理模式
  useEffect(() => {
    const id = ++fetchId.current;
    setInfo(null);
    setLoading(true);
    const delay = isConnected ? 2000 : 0;
    const timer = setTimeout(() => doFetch(id), delay);
    return () => clearTimeout(timer);
  }, [isConnected, nodeId, proxyMode, doFetch]);

  // 手动刷新
  const handleRefresh = useCallback(() => {
    const id = ++fetchId.current;
    doFetch(id);
  }, [doFetch]);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
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

      <div className="flex flex-1 min-h-0 flex-col gap-2">
        {/* IP 地址 & 获取方式 */}
        <div className="flex items-center justify-between min-h-[1.5rem]">
          <span className="text-xs text-muted-foreground shrink-0">
            IP 地址
          </span>
          <div className="flex items-center gap-1.5 min-w-0">
            {loading && !info ? (
              <span className="h-4 w-20 animate-pulse rounded bg-muted-foreground/20" />
            ) : (
              <>
                <span className="min-w-0 truncate text-xs font-medium tabular-nums text-foreground" title={info?.ip || undefined}>
                  {info?.ip || "-"}
                </span>
                {info?.fetchMode === "代理" && (
                  <span className="inline-flex items-center rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-500 ring-1 ring-inset ring-emerald-500/20 shrink-0">
                    代理
                  </span>
                )}
                {info?.fetchMode === "直连" && (
                  <span className="inline-flex items-center rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-blue-500 ring-1 ring-inset ring-blue-500/20 shrink-0">
                    直连
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {/* 地理位置 */}
        <div className="flex items-center justify-between min-h-[1.5rem]">
          <span className="text-xs text-muted-foreground shrink-0">
            地理位置
          </span>
          {loading && !info ? (
            <span className="h-4 w-24 animate-pulse rounded bg-muted-foreground/20" />
          ) : (
            <span
              className="min-w-0 truncate text-xs font-medium text-foreground"
              title={[info?.country, info?.region, info?.city].filter(Boolean).join(" · ") || undefined}
            >
              {[info?.country, info?.region, info?.city].filter(Boolean).join(" · ") || "-"}
            </span>
          )}
        </div>

        {/* 网络提供商 */}
        <div className="flex items-center justify-between min-h-[1.5rem]">
          <span className="text-xs text-muted-foreground shrink-0">
            网络提供商
          </span>
          {loading && !info ? (
            <span className="h-4 w-28 animate-pulse rounded bg-muted-foreground/20" />
          ) : (
            <span
              className="min-w-0 truncate text-xs font-medium text-foreground"
              title={[info?.asn, info?.org].filter(Boolean).join(" · ") || undefined}
            >
              {[info?.asn, info?.org].filter(Boolean).join(" · ") || "-"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
