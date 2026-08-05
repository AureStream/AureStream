import { useState } from "react";
import { useEngine } from "@/contexts/EngineContext";
import { useSubs } from "@/contexts/SubsContext";

export default function NodesPage() {
  const { nodes, syncing } = useSubs();
  const { engine, selectNode } = useEngine();
  const [pendingTag, setPendingTag] = useState<string | null>(null);

  const onSelect = async (tag: string) => {
    if (tag === engine.selectedNode || pendingTag) return;
    setPendingTag(tag);
    try {
      await selectNode(tag);
    } finally {
      setPendingTag(null);
    }
  };

  return (
    <section className="page nodes">
      <header className="page-header">
        <h1 className="page-title">节点</h1>
        <p className="page-subtitle">选择当前出口；切换会持久化并在连接时生效。</p>
      </header>

      {nodes.length === 0 ? (
        <p className="home-inline-sync">订阅同步中</p>
      ) : (
        <ul className="node-list">
          {nodes.map((node) => {
            const selected = node.tag === engine.selectedNode;
            const pending = node.tag === pendingTag;
            return (
              <li key={node.tag}>
                <button
                  type="button"
                  className={`node-item ${selected ? "is-selected" : ""}`}
                  disabled={!!pendingTag}
                  onClick={() => void onSelect(node.tag)}
                >
                  <span className="node-item-name">{node.name}</span>
                  <span className="node-item-meta">
                    {pending ? "切换中…" : node.protocol || "节点"}
                    {selected ? " · 当前" : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {syncing && nodes.length > 0 ? (
        <p className="home-inline-sync subtle">正在刷新订阅…</p>
      ) : null}
    </section>
  );
}
