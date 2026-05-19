import { useProxyStore } from "@/stores/appStore";
import { ChevronDown } from "lucide-react";

interface NodeSelectProps {
  onSelect?: (nodeId: string) => void;
}

export function NodeSelect({ onSelect }: NodeSelectProps) {
  const {
    nodes,
    currentNode,
    currentProvider,
    applyNodeSelection,
    isConnected,
  } = useProxyStore();

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    if (!v) {
      await applyNodeSelection(undefined);
      return;
    }
    const node = nodes.find((n) => n.id === v);
    await applyNodeSelection(node);
    if (node) onSelect?.(node.id);
  };

  const availableNodes = currentProvider
    ? nodes.filter((n) => n.providerId === currentProvider.id)
    : nodes;

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">选择节点</label>
      <div className="relative">
        <select
          value={currentNode?.id || ""}
          onChange={handleChange}
          disabled={availableNodes.length === 0}
          className="w-full h-11 pl-4 pr-10 rounded-xl bg-black/5 dark:bg-white/5 border-0 text-sm font-medium appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all disabled:opacity-50"
        >
          <option value="">请选择节点</option>
          {availableNodes.map((node) => {
            const delayDisplay = node.delayError
              ? "超时"
              : node.delay !== undefined
                ? `${node.delay}ms`
                : "--";
            return (
              <option key={node.id} value={node.id}>
                {node.name} | 延迟: {delayDisplay}
              </option>
            );
          })}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      </div>
      {availableNodes.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {currentProvider
            ? isConnected
              ? "暂无节点，可在仪表板打开节点选择器刷新"
              : "连接后可从内核加载订阅节点"
            : "请先选择服务商"}
        </p>
      )}
    </div>
  );
}
