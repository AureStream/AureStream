import { describe, it, expect } from "vitest"
import { parseSubscriptionBody } from "../subscription-decoder"

describe("subscription-decoder", () => {
  describe("plain proxy list", () => {
    it("parses ss:// SIP002 URIs", () => {
      const body = "ss://YWVzLTI1Ni1nY206dGVzdA==@10.0.0.1:8388#MySS"
      const result = parseSubscriptionBody(body)
      expect(result.outbounds).toHaveLength(1)
      expect(result.outbounds[0]).toMatchObject({
        type: "shadowsocks",
        tag: "MySS",
        server: "10.0.0.1",
        server_port: 8388,
        method: "aes-256-gcm",
      })
    })

    it("parses vmess:// URIs", () => {
      const cfg = btoa(JSON.stringify({
        v: "2", ps: "MyVMess", add: "10.0.0.2", port: "443",
        id: "abc-def-ghi", aid: "0", net: "ws", path: "/ws",
        host: "example.com", tls: "tls",
      }))
      const body = `vmess://${cfg}`
      const result = parseSubscriptionBody(body)
      expect(result.outbounds).toHaveLength(1)
      expect(result.outbounds[0]).toMatchObject({
        type: "vmess",
        tag: "MyVMess",
        server: "10.0.0.2",
        server_port: 443,
        uuid: "abc-def-ghi",
      })
      expect(result.outbounds[0].transport).toMatchObject({ type: "ws", path: "/ws" })
      expect(result.outbounds[0].tls).toMatchObject({ enabled: true })
    })

    it("parses trojan:// URIs", () => {
      const body = "trojan://secret123@10.0.0.3:443?sni=example.com#MyTrojan"
      const result = parseSubscriptionBody(body)
      expect(result.outbounds).toHaveLength(1)
      expect(result.outbounds[0]).toMatchObject({
        type: "trojan",
        tag: "MyTrojan",
        server: "10.0.0.3",
        server_port: 443,
        password: "secret123",
      })
      expect(result.outbounds[0].tls).toMatchObject({
        enabled: true,
        server_name: "example.com",
      })
    })

    it("parses vless:// URIs with reality", () => {
      const body = "vless://uuid-1234@10.0.0.4:443?security=reality&sni=google.com&pbk=pubkey&sid=abcd&flow=xtls-rprx-vision#MyVLESS"
      const result = parseSubscriptionBody(body)
      expect(result.outbounds).toHaveLength(1)
      expect(result.outbounds[0]).toMatchObject({
        type: "vless",
        tag: "MyVLESS",
        server: "10.0.0.4",
        server_port: 443,
        uuid: "uuid-1234",
      })
    })

    it("parses hysteria2:// URIs", () => {
      const body = "hysteria2://passwd@10.0.0.5:443?sni=example.com#MyHysteria"
      const result = parseSubscriptionBody(body)
      expect(result.outbounds).toHaveLength(1)
      expect(result.outbounds[0]).toMatchObject({
        type: "hysteria2",
        tag: "MyHysteria",
        server: "10.0.0.5",
        server_port: 443,
        password: "passwd",
      })
    })

    it("parses hy2:// shorthand URIs", () => {
      const body = "hy2://passwd@10.0.0.6:8888#Hy2Node"
      const result = parseSubscriptionBody(body)
      expect(result.outbounds).toHaveLength(1)
      expect(result.outbounds[0]).toMatchObject({
        type: "hysteria2",
        tag: "Hy2Node",
        server: "10.0.0.6",
        server_port: 8888,
      })
    })
  })

  describe("multi-line proxy list", () => {
    it("parses multiple proxy URIs from one body", () => {
      const body = [
        "ss://YWVzLTI1Ni1nY206dGVzdA==@10.0.0.1:8388#Node1",
        "trojan://pwd@10.0.0.2:443#Node2",
        "", // empty line should be skipped
        "vmess://eyJ2IjoiMiIsInBzIjoiTm9kZTMiLCJhZGQiOiIxMC4wLjAuMyIsInBvcnQiOiI0NDMiLCJpZCI6InV1aWQiLCJhaWQiOiIwIn0=",
      ].join("\n")
      const result = parseSubscriptionBody(body)
      expect(result.outbounds).toHaveLength(3)
      expect(result.outbounds.map((o) => o.tag)).toEqual(["Node1", "Node2", "Node3"])
    })
  })

  describe("JSON subscriptions", () => {
    it("passes through valid JSON as-is", () => {
      const json = JSON.stringify({
        outbounds: [
          { type: "shadowsocks", tag: "ss1", server: "1.2.3.4", server_port: 8388, method: "aes-128-gcm", password: "pw" },
        ],
      })
      const result = parseSubscriptionBody(json)
      expect(result.outbounds).toHaveLength(1)
      expect(result.outbounds[0].tag).toBe("ss1")
    })
  })

  describe("base64-encoded proxy lists", () => {
    it("decodes base64 and parses proxy URIs", () => {
      const raw = "ss://YWVzLTI1Ni1nY206dGVzdA==@10.0.0.1:8388#B64Node\n"
      const body = btoa(raw)
      const result = parseSubscriptionBody(body)
      expect(result.outbounds).toHaveLength(1)
      expect(result.outbounds[0].tag).toBe("B64Node")
    })

    it("handles URL-safe base64", () => {
      // URL-safe base64 uses - and _ instead of + and /
      const raw = "ss://YWVzLTI1Ni1nY206dGVzdA==@10.0.0.1:8388#SafeNode\n"
      const standard = btoa(raw)
      const urlSafe = standard.replace(/\+/g, "-").replace(/\//g, "_")
      const result = parseSubscriptionBody(urlSafe)
      expect(result.outbounds).toHaveLength(1)
      expect(result.outbounds[0].tag).toBe("SafeNode")
    })
  })

  describe("edge cases", () => {
    it("returns empty outbounds for empty input", () => {
      expect(() => parseSubscriptionBody("")).toThrow()
    })

    it("skips unrecognised protocol lines", () => {
      const body = "ss://YWVzLTI1Ni1nY206dGVzdA==@10.0.0.1:8388#Valid\nhttp://invalid.com\n"
      const result = parseSubscriptionBody(body)
      expect(result.outbounds).toHaveLength(1)
    })

    it("throws for completely unparseable input", () => {
      expect(() => parseSubscriptionBody("not a valid subscription at all")).toThrow()
    })
  })
})
