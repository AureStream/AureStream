import { describe, expect, it } from "vitest"

import { buildNodeList } from "./nodes-page-model"

describe("nodes page model", () => {
  it("deduplicates proxy outbounds by tag to keep React rows stable during speed tests", () => {
    const nodes = buildNodeList(
      [
        { type: "selector", tag: "ExitGateway" },
        { type: "shadowsocks", tag: "日本 01", server: "jp.example.com", server_port: 443 },
        { type: "shadowsocks", tag: "日本 01", server: "jp-duplicate.example.com", server_port: 8443 },
        { type: "direct", tag: "direct" },
        { type: "vmess", tag: "美国 01", server: "us.example.com", server_port: "443" },
      ],
      () => 0,
    )

    expect(nodes.map((node) => node.id)).toEqual(["日本 01", "美国 01"])
    expect(nodes.map((node) => node.key)).toEqual(["日本 01", "美国 01"])
    expect(nodes[0]).toMatchObject({
      flag: "🇯🇵",
      protocol: "SHADOWSOCKS",
      server: "jp.example.com",
      port: 443,
    })
  })

  it("supports Xray-style protocol/settings.vnext outbounds", () => {
    const nodes = buildNodeList(
      [
        { protocol: "freedom", tag: "direct" },
        {
          protocol: "vless",
          tag: "节点 A",
          settings: { vnext: [{ address: "1.2.3.4", port: 443 }] },
        },
        {
          protocol: "vless",
          tag: "节点 A",
          settings: { vnext: [{ address: "5.6.7.8", port: 8443 }] },
        },
      ],
      () => 12,
    )

    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toMatchObject({
      id: "节点 A",
      protocol: "VLESS",
      server: "1.2.3.4",
      port: 443,
      ping: 12,
    })
  })
})
