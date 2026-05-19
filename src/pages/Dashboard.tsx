import { useEffect, useLayoutEffect, useState } from "react";
import { LeftOperationPanel } from "@/components/dashboard/LeftOperationPanel";
import { NetworkBlock } from "@/components/dashboard/NetworkBlock";
import { NodePickerDialog } from "@/components/dashboard/NodePickerDialog";
import { SubscriptionBlock } from "@/components/dashboard/SubscriptionBlock";
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
    currentProvider,
    currentNode,
    isConnected,
    connectedAt,
    connectedIp,
    uploadSpeed,
    downloadSpeed,
    sessionUploadBytes,
    sessionDownloadBytes,
  } = useProxyStore();

  const [nodeDialogOpen, setNodeDialogOpen] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [uploadSeries, setUploadSeries] = useState(emptySeries);
  const [downloadSeries, setDownloadSeries] = useState(emptySeries);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

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

  /** 内核由订阅 YAML 驱动；nodes 表可能未写入，不因「零节点」禁止连接 */
  const canConnect = Boolean(currentProvider);

  const sessionUploadGb = isConnected
    ? sessionUploadBytes / 1024 ** 3
    : undefined;
  const sessionDownloadGb = isConnected
    ? sessionDownloadBytes / 1024 ** 3
    : undefined;

  return (
    <PageShell fillHeight className="max-w-7xl" title="首页">
      <div className="relative flex w-full min-h-0 overflow-hidden">
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
        <div className="relative grid w-full grid-cols-1 gap-4 md:grid-cols-[55%_45%] md:gap-0 lg:grid-cols-[61.8%_38.2%]">
          {/* 左栏：操作区 */}
          <section className="flex min-h-0 flex-col justify-start md:pr-6 lg:pr-8">
            <LeftOperationPanel
              isConnected={isConnected}
              canConnect={canConnect}
              connectedAt={connectedAt}
              nowTick={nowTick}
              downloadSpeed={downloadSpeed}
              uploadSpeed={uploadSpeed}
              currentNode={currentNode}
              onOpenNodePicker={() => setNodeDialogOpen(true)}
            />
          </section>

          {/* 右栏：信息展示区 */}
          <section className="flex min-h-0 flex-col gap-2 px-4 md:border-l md:border-border/30 md:pl-6 lg:gap-2.5 lg:pl-8">
            <SubscriptionBlock
              provider={currentProvider}
              onOpenProviders={onOpenProviders}
            />
            <div className="border-t border-border/20" />
            <NetworkBlock connectedIp={connectedIp} />
            <div className="border-t border-border/20" />
            <UsageBlock
              uploadTotal={sessionUploadGb}
              downloadTotal={sessionDownloadGb}
              uploadSeries={uploadSeries}
              downloadSeries={downloadSeries}
            />
          </section>
        </div>

        <NodePickerDialog
          open={nodeDialogOpen}
          onOpenChange={setNodeDialogOpen}
        />
      </div>
    </PageShell>
  );
}
