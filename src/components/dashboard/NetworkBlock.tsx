import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { useProxyStore, useAppStore } from "@/stores/appStore";

interface NetworkInfo {
  ip: string;
  city: string;
  region: string;
  country: string;
  asn: string;
  org: string;
}

function parseOrg(org: string): { asn: string; org: string } {
  const match = org.match(/^(AS\d+)\s+(.+)$/);
  if (match) {
    return { asn: match[1], org: match[2] };
  }
  return { asn: "", org };
}

const INFO_ROWS: { key: keyof NetworkInfo; label: string }[] = [
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
  const [error, setError] = useState(false);
  const fetchId = useRef(0);
  const prevConnected = useRef(isConnected);

  useEffect(() => {
    let cancelled = false;
    const id = ++fetchId.current;

    async function fetchIpInfo() {
      setLoading(true);
      setError(false);
      try {
        const resp = await fetch(`https://ipinfo.io/json?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if (cancelled || fetchId.current !== id) return;
        const { asn, org } = parseOrg(data.org || "");
        setInfo({
          ip: data.ip || "",
          city: data.city || "",
          region: data.region || "",
          country: data.country || "",
          asn,
          org,
        });
      } catch {
        if (!cancelled && fetchId.current === id) setError(true);
      } finally {
        if (!cancelled && fetchId.current === id) setLoading(false);
      }
    }

    // 如果处于连接状态，无论是刚连接、切换节点还是改变代理模式，都给予一定延迟等待内核和路由生效
    const delay = isConnected ? 1500 : 0;

    const timer = setTimeout(fetchIpInfo, delay);

    prevConnected.current = isConnected;

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isConnected, nodeId, proxyMode]);

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
        {error && !info && (
          <p className="text-[11px] text-muted-foreground/60 mt-1">
            获取失败，切换节点或连接后重试
          </p>
        )}
      </div>
    </div>
  );
}
