import { useEngine } from "@/contexts/EngineContext";
import { useSubs } from "@/contexts/SubsContext";

function engineLabel(state: string): string {
  switch (state) {
    case "running":
      return "已连接";
    case "starting":
      return "连接中";
    case "stopping":
      return "断开中";
    case "failed":
      return "连接失败";
    default:
      return "未连接";
  }
}

export default function HomePage() {
  const { nodes, syncing } = useSubs();
  const { engine, start, stop } = useEngine();

  const busy = engine.state === "starting" || engine.state === "stopping";
  const connected = engine.state === "running";
  const nodesEmpty = nodes.length === 0;

  const selected =
    nodes.find((n) => n.tag === engine.selectedNode) ??
    (engine.selectedNode
      ? { tag: engine.selectedNode, name: engine.selectedNode, protocol: "" }
      : null);

  return (
    <section className="page home">
      <div className="home-hero">
        <p className="home-kicker">系统代理</p>
        <h1 className="home-title">AureStream</h1>
        <p className="home-lead">一键连接，流量走当前所选节点。</p>
      </div>

      <div className={`home-status ${connected ? "is-on" : ""}`}>
        <p className="home-status-label">{engineLabel(engine.state)}</p>
        {nodesEmpty ? (
          <p className="home-inline-sync">订阅同步中</p>
        ) : (
          <p className="home-node">
            {selected ? selected.name : "尚未选择节点"}
          </p>
        )}
        {engine.reason && engine.state === "failed" ? (
          <p className="home-reason">{engine.reason}</p>
        ) : null}
        {syncing && !nodesEmpty ? (
          <p className="home-inline-sync subtle">正在刷新订阅…</p>
        ) : null}
      </div>

      <button
        className={`home-connect ${connected ? "is-on" : ""}`}
        type="button"
        disabled={busy || (!connected && nodesEmpty)}
        onClick={() => {
          if (connected) void stop();
          else void start();
        }}
      >
        {busy ? "处理中…" : connected ? "断开" : "连接"}
      </button>
    </section>
  );
}
