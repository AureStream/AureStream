import { useEffect, useLayoutEffect, useState } from "react";
import { HomeDashboardPanel } from "@/components/dashboard/HomeDashboardPanel";
import { NetworkBlock } from "@/components/dashboard/NetworkBlock";
import { UsageBlock } from "@/components/dashboard/UsageBlock";
import { PageShell } from "@/components/layout/PageShell";
import { cn } from "@/lib/utils";
import { useProxyStore } from "@/stores/appStore";

const SERIES_LEN = 48;

function emptySeries(): number[] {
  return Array.from({ length: SERIES_LEN }, () => 0);
}

export function Dashboard({
  onOpenProviders,
}: {
  onOpenProviders?: () => void;
}) {
  const {
    isConnected,
    connectedIp,
    uploadSpeed,
    downloadSpeed,
    sessionUploadBytes,
    sessionDownloadBytes,
  } = useProxyStore();

  const [uploadSeries, setUploadSeries] = useState(emptySeries);
  const [downloadSeries, setDownloadSeries] = useState(emptySeries);

  useLayoutEffect(() => {
    setUploadSeries(emptySeries());
    setDownloadSeries(emptySeries());
  }, [isConnected]);

  useEffect(() => {
    if (!isConnected) return;
    setUploadSeries((prev) => [...prev.slice(1), uploadSpeed]);
    setDownloadSeries((prev) => [...prev.slice(1), downloadSpeed]);
  }, [isConnected, uploadSpeed, downloadSpeed]);

  useEffect(() => {
    if (isConnected) return;
    const id = window.setInterval(() => {
      const t = Date.now() / 4500;
      const base = (Math.sin(t) * 0.5 + 0.5) * 4096;
      setUploadSeries((prev) => [...prev.slice(1), base * 0.35]);
      setDownloadSeries((prev) => [...prev.slice(1), base * 0.52]);
    }, 2200);
    return () => clearInterval(id);
  }, [isConnected]);

  const sessionUploadGb = isConnected
    ? sessionUploadBytes / 1024 ** 3
    : undefined;
  const sessionDownloadGb = isConnected
    ? sessionDownloadBytes / 1024 ** 3
    : undefined;

  return (
    <PageShell fillHeight className="max-w-7xl" title="首页">
      <div className="relative flex w-full flex-1 min-h-0 overflow-hidden">
        {/* 中轴光晕背景 */}
        <div
          className={cn(
            "pointer-events-none absolute inset-0 transition-opacity duration-1000",
            isConnected ? "opacity-100" : "opacity-60",
          )}
          aria-hidden
          style={{
            background:
              "radial-gradient(ellipse 50% 70% at 50% 50%, color-mix(in srgb, var(--color-primary) 10%, transparent) 0%, transparent 70%)",
          }}
        />

        {/* 黄金分割双栏 */}
        <div className="relative grid w-full h-full grid-cols-1 gap-4 md:grid-cols-[61.8%_38.2%] md:gap-0">
          {/* 左栏：与移动端首页一致的连接与订阅操作区 */}
          <section className="flex h-full min-h-0 flex-col md:pr-6 lg:pr-8">
            <HomeDashboardPanel
              layout="desktop"
              onOpenProviders={onOpenProviders}
            />
          </section>

          {/* 右栏：网络与用量（订阅卡片已在左侧与移动端一致展示） */}
          <section className="grid h-full min-h-0 grid-rows-[auto_1fr] overflow-y-auto pl-4 pr-4 md:pr-0 md:border-l md:border-border/30 md:pl-6 lg:pl-8">
            <NetworkBlock connectedIp={connectedIp} />
            <UsageBlock
              uploadTotal={sessionUploadGb}
              downloadTotal={sessionDownloadGb}
              uploadSeries={uploadSeries}
              downloadSeries={downloadSeries}
              className="h-full border-t border-border/20 pt-2"
            />
          </section>
        </div>
      </div>
    </PageShell>
  );
}
