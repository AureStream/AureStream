import { describe, expect, it } from "vitest"
import { parseSubscriptionBody, filterProxyOutbounds, isProxyOutbound } from "./subscription-decoder"

describe("subscription-decoder (Xray-core schema)", () => {
  it("parses a real vless+ws+tls+fragment URI (chilix subscription sample)", () => {
    const uri =
      "vless://095909af-8903-4305-8a7d-07fd0fb8c0e3@162.159.38.162:443?security=tls&sni=snip.auvip.ddns-ip.net&alpn=&fp=random&type=ws&host=snip.auvip.ddns-ip.net&path=%2F%3Fed%3D2560&fragment=1%2C40-60%2C30-50%2Ctlshello&encryption=none#Gslege"

    const { outbounds } = parseSubscriptionBody(uri)
    expect(outbounds).toHaveLength(1)
    const node = outbounds[0]

    expect(node.protocol).toBe("vless")
    expect(node.tag).toBe("Gslege")
    expect(node.settings).toEqual({
      vnext: [
        {
          address: "162.159.38.162",
          port: 443,
          users: [{ id: "095909af-8903-4305-8a7d-07fd0fb8c0e3", encryption: "none" }],
        },
      ],
    })
    expect(node.streamSettings).toEqual({
      network: "ws",
      wsSettings: { path: "/?ed=2560", host: "snip.auvip.ddns-ip.net" },
      security: "tls",
      tlsSettings: { serverName: "snip.auvip.ddns-ip.net", fingerprint: "random" },
    })
    expect(node._fragment).toEqual({ packets: "tlshello", length: "40-60", interval: "30-50" })
  })

  it("parses a base64-encoded newline list of vless URIs (real subscription shape)", () => {
    const lines = [
      "vless://095909af-8903-4305-8a7d-07fd0fb8c0e3@162.159.38.162:443?security=tls&sni=snip.auvip.ddns-ip.net&type=ws&host=snip.auvip.ddns-ip.net&path=%2F&encryption=none#node1",
      "vless://095909af-8903-4305-8a7d-07fd0fb8c0e3@172.64.53.121:443?security=tls&sni=snip.auvip.ddns-ip.net&type=ws&host=snip.auvip.ddns-ip.net&path=%2F&encryption=none#node2",
    ].join("\n")
    const body = btoa(lines)

    const { outbounds } = parseSubscriptionBody(body)
    expect(outbounds).toHaveLength(2)
    expect(outbounds.map((o) => o.tag)).toEqual(["node1", "node2"])
    expect(outbounds.every((o) => o.protocol === "vless")).toBe(true)
  })

  it("parses vmess:// with ws transport and tls", () => {
    const cfg = {
      v: "2",
      ps: "VMess Node",
      add: "1.2.3.4",
      port: "443",
      id: "uuid-1234",
      aid: "0",
      scy: "auto",
      net: "ws",
      path: "/vmess",
      host: "vmess.example.com",
      tls: "tls",
      sni: "vmess.example.com",
    }
    const uri = "vmess://" + btoa(JSON.stringify(cfg))

    const { outbounds } = parseSubscriptionBody(uri)
    expect(outbounds).toHaveLength(1)
    const node = outbounds[0]
    expect(node.protocol).toBe("vmess")
    expect(node.settings).toEqual({
      vnext: [{ address: "1.2.3.4", port: 443, users: [{ id: "uuid-1234", security: "auto", alterId: 0 }] }],
    })
    expect(node.streamSettings).toEqual({
      network: "ws",
      wsSettings: { path: "/vmess", host: "vmess.example.com" },
      security: "tls",
      tlsSettings: { serverName: "vmess.example.com" },
    })
  })

  it("parses trojan:// defaulting to TLS", () => {
    const uri = "trojan://mypassword@trojan.example.com:443?sni=trojan.example.com#Trojan%20Node"
    const { outbounds } = parseSubscriptionBody(uri)
    expect(outbounds).toHaveLength(1)
    const node = outbounds[0]
    expect(node.protocol).toBe("trojan")
    expect(node.settings).toEqual({
      servers: [{ address: "trojan.example.com", port: 443, password: "mypassword" }],
    })
    expect(node.streamSettings).toEqual({
      security: "tls",
      tlsSettings: { serverName: "trojan.example.com" },
    })
  })

  it("parses ss:// SIP002 form", () => {
    const userinfo = btoa("aes-128-gcm:secret")
    const uri = `ss://${userinfo}@ss.example.com:8388#SS%20Node`
    const { outbounds } = parseSubscriptionBody(uri)
    expect(outbounds).toHaveLength(1)
    expect(outbounds[0]).toMatchObject({
      tag: "SS Node",
      protocol: "shadowsocks",
      settings: {
        servers: [{ address: "ss.example.com", port: 8388, method: "aes-128-gcm", password: "secret" }],
      },
    })
  })

  it("parses hysteria2:// with password and sni", () => {
    const uri = "hysteria2://mypw@hy2.example.com:443?sni=hy2.example.com#HY2%20Node"
    const { outbounds } = parseSubscriptionBody(uri)
    expect(outbounds).toHaveLength(1)
    expect(outbounds[0]).toMatchObject({
      tag: "HY2 Node",
      protocol: "hysteria2",
      settings: { servers: [{ address: "hy2.example.com", port: 443, password: "mypw" }] },
      streamSettings: { security: "tls", tlsSettings: { serverName: "hy2.example.com" } },
    })
  })

  it("round-trips already-Xray-shaped JSON, filtering out non-proxy outbounds", () => {
    const body = JSON.stringify({
      outbounds: [
        { tag: "node-a", protocol: "vless", settings: {} },
        { tag: "direct", protocol: "freedom" },
        { tag: "block", protocol: "blackhole" },
      ],
    })
    const { outbounds } = parseSubscriptionBody(body)
    expect(outbounds).toHaveLength(1)
    expect(outbounds[0].tag).toBe("node-a")
  })

  it("isProxyOutbound / filterProxyOutbounds dedupe by tag and exclude infra protocols", () => {
    const items = [
      { tag: "node-a", protocol: "vless" },
      { tag: "node-a", protocol: "vless" }, // duplicate tag
      { tag: "direct", protocol: "freedom" },
      { tag: "block", protocol: "blackhole" },
      { tag: "bad" }, // missing protocol
    ]
    expect(items.map(isProxyOutbound)).toEqual([true, true, false, false, false])
    expect(filterProxyOutbounds(items)).toHaveLength(1)
  })

  it("throws on unrecognized subscription content", () => {
    expect(() => parseSubscriptionBody("not a proxy list, not json, not base64 !!!")).toThrow()
  })
})
