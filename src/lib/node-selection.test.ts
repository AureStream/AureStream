import { describe, expect, it } from "vitest"
import { confirmedSelection, nodeKey, resolveSelectedNode } from "./node-selection"
import type { NodeInfo } from "./ipc"

const node = (id: string, tag: string): NodeInfo => ({
  id,
  tag,
  name: tag,
  protocol: "vless",
})

describe("resolveSelectedNode", () => {
  it("follows the id when the provider renamed the node", () => {
    const nodes = [node("n2:a", "联通-0.52mb/s"), node("n2:b", "电信-69.68mb/s")]
    const selected = resolveSelectedNode(nodes, {
      selectedNodeId: "n2:b",
      selectedNode: "电信-60.48mb/s",
    })
    expect(selected?.tag).toBe("电信-69.68mb/s")
  })

  it("falls back to the tag for selections stored before ids existed", () => {
    const nodes = [node("n2:a", "HK-1"), node("n2:b", "JP-1")]
    expect(resolveSelectedNode(nodes, { selectedNode: "JP-1" })?.id).toBe("n2:b")
  })

  /** The bug: a remembered node that no longer exists must not become a
   * phantom entry the user then tries to connect to. */
  it("falls back to the first node when nothing matches", () => {
    const nodes = [node("n2:a", "HK-1")]
    const selected = resolveSelectedNode(nodes, {
      selectedNodeId: "n2:gone",
      selectedNode: "已删除的节点",
    })
    expect(selected?.id).toBe("n2:a")
  })

  it("returns null only when there are no nodes", () => {
    expect(resolveSelectedNode([], { selectedNode: "HK-1" })).toBeNull()
  })
})

describe("confirmedSelection", () => {
  it("returns null instead of inventing a node from a remembered tag", () => {
    const nodes = [node("n2:a", "HK-1")]
    expect(
      confirmedSelection(nodes, {
        selectedNodeId: "n2:gone",
        selectedNode: "已删除的节点",
      }),
    ).toBeNull()
  })

  it("returns the real row when the id still matches", () => {
    const nodes = [node("n2:a", "HK-1"), node("n2:b", "JP-1")]
    expect(
      confirmedSelection(nodes, { selectedNodeId: "n2:b", selectedNode: "旧名" })?.id,
    ).toBe("n2:b")
  })

  it("accepts a tag-only memory from builds that predate ids", () => {
    const nodes = [node("n2:a", "HK-1"), node("n2:b", "JP-1")]
    expect(confirmedSelection(nodes, { selectedNode: "JP-1" })?.id).toBe("n2:b")
  })
})

describe("nodeKey", () => {
  it("prefers the id and falls back to the tag", () => {
    expect(nodeKey(node("n2:a", "HK-1"))).toBe("n2:a")
    expect(nodeKey({ tag: "HK-1", name: "HK-1", protocol: "vless" })).toBe("HK-1")
  })
})
