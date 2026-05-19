import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowDown01, ArrowDownAZ, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useProxyStore } from "@/stores/appStore";
import { cn } from "@/lib/utils";
import { getLatencyColor } from "@/types";

interface NodePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type NodeSortMode = "name" | "delay";

export function NodePickerDialog({
  open,
  onOpenChange,
}: NodePickerDialogProps) {
  const {
    nodes,
    currentProvider,
    currentNode,
    applyNodeSelection,
    refreshSubscriptionNodesFromDb,
    testLatency,
    isTestingLatency,
    latencyPendingByNodeId,
    isConnected,
  } = useProxyStore();

  const list = currentProvider
    ? nodes.filter((n) => n.providerId === currentProvider.id && n.enabled)
    : [];

  const [sortBy, setSortBy] = useState<NodeSortMode>("delay");
  /** 测速进行中固定行顺序，避免延迟逐个更新时列表跳动 */
  const [frozenIds, setFrozenIds] = useState<string[] | null>(null);
  const wasTestingRef = useRef(false);

  const sortedList = useMemo(() => {
    const arr = [...list];
    if (sortBy === "name") {
      arr.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
    } else {
      arr.sort((a, b) => {
        const da = a.delay;
        const db = b.delay;
        if (a.delayError && !b.delayError) return 1;
        if (!a.delayError && b.delayError) return -1;
        if (a.delayError && b.delayError) {
          return a.name.localeCompare(b.name, "zh-Hans-CN");
        }
        if (da === undefined && db === undefined) {
          return a.name.localeCompare(b.name, "zh-Hans-CN");
        }
        if (da === undefined) return 1;
        if (db === undefined) return -1;
        return da - db;
      });
    }
    return arr;
  }, [list, sortBy]);

  const displayList = useMemo(() => {
    if (!isTestingLatency || !frozenIds?.length) return sortedList;
    const byId = new Map(list.map((n) => [n.id, n]));
    return frozenIds
      .map((id) => byId.get(id))
      .filter((n): n is (typeof list)[number] => n != null);
  }, [isTestingLatency, frozenIds, list, sortedList]);

  const sortedListRef = useRef(sortedList);
  sortedListRef.current = sortedList;

  useLayoutEffect(() => {
    if (isTestingLatency && !wasTestingRef.current) {
      wasTestingRef.current = true;
      setFrozenIds(sortedListRef.current.map((n) => n.id));
      return;
    }
    if (!isTestingLatency && wasTestingRef.current) {
      wasTestingRef.current = false;
      setFrozenIds(null);
    }
  }, [isTestingLatency]);

  useEffect(() => {
    if (!open) {
      wasTestingRef.current = false;
      setFrozenIds(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void refreshSubscriptionNodesFromDb();
  }, [open, currentProvider?.id, refreshSubscriptionNodesFromDb]);

  const handlePick = (id: string) => {
    const node = displayList.find((n) => n.id === id);
    if (node) void applyNodeSelection(node);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg flex flex-col max-h-[85dvh] p-0 gap-0 overflow-hidden border-border">

        {/* Header：标题行 + 描述与操作按钮行 */}
        <div className="border-b border-border p-4 pb-3">
          <DialogHeader className="mb-0 space-y-1.5">
            {/* 行 1：标题（为右侧关闭 X 留 pr-10） */}
            <div className="pr-10">
              <DialogTitle className="leading-tight">节点列表</DialogTitle>
            </div>

            {/* 行 2：描述（左）+ 操作按钮（右） */}
            <div className="flex items-center justify-between gap-2">
              <DialogDescription className="text-xs">
                {currentProvider
                  ? isConnected
                    ? "选择要使用的节点，测速结果为当前组内节点的延迟"
                    : "请先连接代理以从内核查阅订阅节点"
                  : "请先选择供应商"}
              </DialogDescription>

              {list.length > 0 && (
                <div className="flex shrink-0 items-center gap-1.5">
                  {/* 测速按钮 */}
                  <button
                    type="button"
                    onClick={() => void testLatency()}
                    disabled={isTestingLatency}
                    title={isTestingLatency ? "测速中..." : "一键测速"}
                    className={cn(
                      "shrink-0 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors",
                      "bg-primary/10 text-primary ring-1 ring-primary/20 hover:bg-primary/15",
                      "disabled:opacity-50 disabled:pointer-events-none",
                    )}
                  >
                    {isTestingLatency ? (
                      <RefreshCw className="size-3.5 shrink-0 animate-spin" aria-hidden />
                    ) : (
                      <Activity className="size-3.5 shrink-0" aria-hidden />
                    )}
                    <span>{isTestingLatency ? "测速中" : "测速"}</span>
                  </button>

                  {/* 排序切换按钮 */}
                  <button
                    type="button"
                    onClick={() =>
                      setSortBy((s) => (s === "name" ? "delay" : "name"))
                    }
                    disabled={isTestingLatency}
                    title={
                      isTestingLatency
                        ? "测速结束后可切换排序"
                        : sortBy === "name"
                          ? "当前按名称排序，点击切换为按延迟"
                          : "当前按延迟排序，点击切换为按名称"
                    }
                    className={cn(
                      "shrink-0 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors",
                      "bg-primary/10 text-primary ring-1 ring-primary/20 hover:bg-primary/15",
                      "disabled:opacity-50 disabled:pointer-events-none",
                    )}
                  >
                    {sortBy === "name" ? (
                      <>
                        <ArrowDownAZ className="size-3.5 shrink-0" aria-hidden />
                        <span>名称</span>
                      </>
                    ) : (
                      <>
                        <ArrowDown01 className="size-3.5 shrink-0" aria-hidden />
                        <span>延迟</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </DialogHeader>
        </div>

        {/* 节点列表 */}
        <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2">
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8 px-4">
              {currentProvider && !isConnected
                ? "连接代理后将从订阅加载节点列表"
                : "暂无可用节点"}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {displayList.map((node) => {
                const active = currentNode?.id === node.id;
                const delayText = node.delayError
                  ? "连接超时"
                  : node.delay != null
                    ? `${node.delay}ms`
                    : null;
                const rowPending = Boolean(latencyPendingByNodeId[node.id]);
                return (
                  <li key={node.id}>
                    <button
                      type="button"
                      onClick={() => handlePick(node.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm transition-all",
                        active
                          ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                          : "hover:bg-black/5 dark:hover:bg-white/10 text-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                          active
                            ? "border-primary bg-primary"
                            : "border-muted-foreground/30 bg-transparent",
                        )}
                        aria-hidden
                      >
                        {active && (
                          <span className="size-2 rounded-full bg-primary-foreground" />
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{node.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {node.server
                            ? `${node.server}:${node.port}`
                            : node.type}
                        </div>
                      </div>
                      <span className="text-xs font-semibold tabular-nums shrink-0">
                        {rowPending ? (
                          <RefreshCw
                            className="size-3.5 animate-spin text-muted-foreground"
                            aria-hidden
                          />
                        ) : delayText ? (
                          <span
                            className={
                              node.delayError
                                ? "text-red-500"
                                : getLatencyColor(node.delay)
                            }
                          >
                            {delayText}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
