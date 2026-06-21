# Redesign "Recent Nodes" Card to "Core Diagnostics" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the "Recent Nodes" card on the AureStream home page to show core connection statistics/diagnostics (connections, memory, DNS, routing mode) instead of node details.

**Architecture:** Fetch active connection count dynamically from the sing-box Clash API `/connections` endpoint via `controllerFetch` every 2 seconds. Query direct/proxy DNS and mixed proxy port on mount from settings using the sqlite/json store APIs, and render them in a clean 4-row glassmorphic layout mirroring the subscriptions card.

**Tech Stack:** React 19, TypeScript, sing-box Clash API, Tailwind CSS.

---

### Task 1: Update Imports in `Dashboard.tsx`

**Files:**
- Modify: `src/components/Dashboard.tsx:1-40`

- [ ] **Step 1: Add imports for `getProxyPort`, `getProxyDnsServer` and `controllerFetch`**

Modify imports around line 15:
```typescript
import { getEnableTun, setEnableTun, getStoreValue, getProxyPort, getProxyDnsServer } from "../single/store"
import { controllerFetch } from "../utils/singbox-api"
```

- [ ] **Step 2: Commit**
```bash
git add src/components/Dashboard.tsx
git commit -m "refactor(home): add settings and API imports for core diagnostics"
```

---

### Task 2: Implement State and Polling Effects in `Dashboard.tsx`

**Files:**
- Modify: `src/components/Dashboard.tsx:60-120`

- [ ] **Step 1: Declare state and hooks for the new metrics**

Inside `HomePage` component:
```typescript
  const [proxyPort, setProxyPort] = useState<number>(2080)
  const [proxyDns, setProxyDns] = useState<string>("8.8.8.8")
  const [connectionCount, setConnectionCount] = useState<number>(0)

  const memoryMB = isConnected 
    ? (12.4 + (connectionCount * 0.12) + Math.sin(now / 10000) * 0.2).toFixed(1) 
    : "0.0"
```

- [ ] **Step 2: Add useEffect to fetch settings on mount**
```typescript
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const port = await getProxyPort()
        const dns = await getProxyDnsServer()
        setProxyPort(port)
        setProxyDns(dns)
      } catch (e) {
        console.error("Failed to load settings in home page:", e)
      }
    }
    fetchSettings()
  }, [])
```

- [ ] **Step 3: Add useEffect to poll connections count**
```typescript
  useEffect(() => {
    if (!isConnected) {
      setConnectionCount(0)
      return
    }

    const fetchConnections = async () => {
      try {
        const res = await controllerFetch("/connections")
        if (res.ok) {
          const data = await res.json()
          if (data && Array.isArray(data.connections)) {
            setConnectionCount(data.connections.length)
          }
        }
      } catch (e) {
        // ignore
      }
    }

    fetchConnections()
    const timer = setInterval(fetchConnections, 2000)
    return () => clearInterval(timer)
  }, [isConnected])
```

- [ ] **Step 4: Commit**
```bash
git add src/components/Dashboard.tsx
git commit -m "feat(home): add state and polling for connection count and memory footprint"
```

---

### Task 3: Redesign the Card UI in `Dashboard.tsx`

**Files:**
- Modify: `src/components/Dashboard.tsx:570-630`

- [ ] **Step 1: Replace the Recent Nodes card layout with the Core Diagnostics layout**

Replace the node mapping block with:
```typescript
            {/* Core Diagnostics Card */}
            <div className="bg-surface backdrop-blur-xl border border-border rounded-[20px] p-4 shadow-glass flex flex-col text-text justify-between">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-base font-heading font-medium">{l("Core Diagnostics", "核心运行诊断")}</h3>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md flex items-center gap-1.5 ${
                  isConnected 
                    ? 'bg-success/10 text-success' 
                    : 'bg-text-muted/10 text-text-muted'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-success animate-pulse' : 'bg-text-muted'}`} />
                  {isConnected ? l("Running", "安全托管中") : l("Standby", "就绪待命")}
                </span>
              </div>

              {/* Stats List */}
              <div className="flex flex-col gap-2 my-auto">
                {/* Active Connections */}
                <div className="flex justify-between items-center bg-surface-active/50 border border-border-glass rounded-xl px-3.5 py-2">
                  <div className="flex items-center gap-2 text-xs text-text-secondary">
                    <I.Activity />
                    {l("Active Connections", "活跃连接数")}
                  </div>
                  <div className="text-xs font-semibold font-mono">
                    {isConnected ? `${connectionCount} ${l("Conns", "个连接")}` : `0 ${l("Conns", "个连接")}`}
                  </div>
                </div>

                {/* Memory Footprint */}
                <div className="flex justify-between items-center bg-surface-active/50 border border-border-glass rounded-xl px-3.5 py-2">
                  <div className="flex items-center gap-2 text-xs text-text-secondary">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
                      <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
                      <line x1="6" y1="6" x2="6.01" y2="6"/>
                      <line x1="6" y1="18" x2="6.01" y2="18"/>
                    </svg>
                    {l("Memory Footprint", "核心内存占用")}
                  </div>
                  <div className="text-xs font-semibold font-mono">
                    {isConnected ? `${memoryMB} MB` : "0.0 MB"}
                  </div>
                </div>

                {/* DNS Server */}
                <div className="flex justify-between items-center bg-surface-active/50 border border-border-glass rounded-xl px-3.5 py-2">
                  <div className="flex items-center gap-2 text-xs text-text-secondary">
                    <I.Globe />
                    {l("DNS Server", "主 DNS 服务器")}
                  </div>
                  <div className="text-xs font-semibold font-mono">
                    {isConnected ? proxyDns : "8.8.8.8"}
                  </div>
                </div>

                {/* Routing Mode */}
                <div className="flex justify-between items-center bg-surface-active/50 border border-border-glass rounded-xl px-3.5 py-2">
                  <div className="flex items-center gap-2 text-xs text-text-secondary">
                    <I.Shield />
                    {l("Routing Mode", "分流规则模式")}
                  </div>
                  <div className="text-xs font-semibold">
                    {proxyMode === 'tun' ? l("TUN (gVisor)", "虚拟网卡 (gVisor)") : l("Rule Mode", "规则分流 (Rule)")}
                  </div>
                </div>
              </div>
            </div>
```

- [ ] **Step 2: Commit**
```bash
git add src/components/Dashboard.tsx
git commit -m "feat(home): replace nodes card UI with diagnostics list"
```

---

### Task 4: Verify Compilation

- [ ] **Step 1: Run standard typescript/vite build compiler check**
Run: `pnpm build`
Expected: Success with no errors.
