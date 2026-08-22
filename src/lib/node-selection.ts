import type { EngineStatePayload, NodeInfo } from "@/lib/ipc"

/**
 * Key a node by its stable id, never by its display tag.
 *
 * Providers rebuild node names on every subscription refresh (live speed in
 * the name, `电信-60.48mb/s`), so a tag-keyed lookup silently stops matching.
 * `id` comes from the backend decode; the tag fallback only covers payloads
 * from a build that predates it.
 */
export function nodeKey(node: NodeInfo): string {
  return node.id || node.tag
}

/**
 * Which node the UI should treat as selected.
 *
 * Resolution mirrors the backend ladder (id → tag → first node) so the two
 * never disagree about what "the selected node" means. Returns `null` only
 * when there are no nodes at all.
 *
 * Deliberately never invents a node from a remembered tag: a phantom entry
 * that is not in the list is exactly what got sent to `engine_start` as an
 * explicit pick and came back as `node_not_found`.
 */
export function resolveSelectedNode(
  nodes: NodeInfo[],
  engine: Pick<EngineStatePayload, "selectedNode" | "selectedNodeId">,
): NodeInfo | null {
  if (nodes.length === 0) return null
  return matchRememberedNode(nodes, engine) ?? nodes[0]
}

/**
 * The node the engine actually remembers, if it is still in the list.
 *
 * Distinct from {@link resolveSelectedNode}: a first-node fallback is fine
 * for display, but must not be sent to `engine_start` as an explicit pick —
 * that is how a stale 1.0.0 tag became `node_not_found`.
 */
export function confirmedSelection(
  nodes: NodeInfo[],
  engine: Pick<EngineStatePayload, "selectedNode" | "selectedNodeId">,
): NodeInfo | null {
  return matchRememberedNode(nodes, engine)
}

function matchRememberedNode(
  nodes: NodeInfo[],
  engine: Pick<EngineStatePayload, "selectedNode" | "selectedNodeId">,
): NodeInfo | null {
  if (engine.selectedNodeId) {
    const byId = nodes.find((n) => n.id && n.id === engine.selectedNodeId)
    if (byId) return byId
  }
  if (engine.selectedNode) {
    const byTag = nodes.find((n) => n.tag === engine.selectedNode)
    if (byTag) return byTag
  }
  return null
}
