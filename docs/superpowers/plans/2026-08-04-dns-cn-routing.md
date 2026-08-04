# DNS-based CN Routing Implementation Plan

> **For agentic workers:** Execute task-by-task with TDD. Spec: `docs/superpowers/specs/2026-08-04-dns-cn-routing-design.md`.

**Goal:** Implement Xray doc example-1 DNS split + IP-first CN routing for smart (rule) mode; keep three home toggles independent; global keeps private-direct only.

**Architecture:** Extend `xray-base-template.ts` to emit full DNS + routing; `helper.updateDnsSettings` only patches queryStrategy / direct domainStrategy and injects custom direct DNS into `dns-direct` entries.

**Tech Stack:** TypeScript, Vitest, Xray-core config JSON.

## Global Constraints

- ECS `clientIp` fixed `222.85.85.85`
- DNS proxy path uses `balancerTag: "proxy-balancer"`
- Drop `geosite:cn` domain direct in rule mode
- Global retains `geoip:private → direct`
- TUN sniffing `routeOnly: true`

---

### Task 1: Failing merger tests

**Files:**
- Modify: `src/config/merger/main.test.ts`

- [x] Replace geosite:cn assertions with IP-first + DNS tag rules
- [x] Add tests for full DNS chain, global private-only, custom direct DNS, TUN routeOnly
- [x] Run tests — expect FAIL

### Task 2: Base template DNS + routing

**Files:**
- Modify: `src/config/xray-base-template.ts`

- [x] `buildDnsConfig(global, enableIpv6)`
- [x] `buildRoutingRules(global)` with DNS tags + IP rules
- [x] TUN `routeOnly: true`

### Task 3: Helper DNS patch

**Files:**
- Modify: `src/config/merger/helper.ts`

- [x] `updateDnsSettings`: do not wipe servers; inject into `dns-direct` only

### Task 4: Green + verify

- [x] `pnpm test` merger (+ full suite if quick)
- [x] Implementation complete (commit on request)
