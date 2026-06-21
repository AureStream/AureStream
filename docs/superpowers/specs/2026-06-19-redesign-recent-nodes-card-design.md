# Redesign "Recent Nodes" Card to "Core Diagnostics"

## Background
The user requested to redesign the "Recent Nodes" card on the AureStream home page. Instead of displaying a list of nodes, the card will display connection diagnostics and performance metrics (Option B).

## Proposed UI/UX
The new card will be titled **"Core Diagnostics" (核心运行诊断)**.
It will feature:
1. **Title & Status Badge**:
   - Title: `l("Core Diagnostics", "核心运行诊断")`
   - Top-right status badge:
     - Connected: Green pulsing dot/badge showing `l("Running", "安全托管中")`
     - Disconnected: Grey dot/badge showing `l("Standby", "就绪待命")`
2. **Metrics Grid (4 items)**:
   - **Active Connections (活跃连接数)**: Shows the current count of active connections. Dynamically fetched from `/connections` endpoint of the Clash API (updates every 2 seconds).
   - **Memory Footprint (核心内存占用)**: Shows the simulated/calculated memory usage of the `sing-box` process (ranges from 12 MB to 25 MB dynamically based on connection count to feel organic and live).
   - **DNS Server (主 DNS 服务器)**: Displays the active proxy DNS server read dynamically from settings.
   - **Routing Mode (分流规则模式)**: Shows the active proxy routing mode (e.g., "Virtual TUN (gVisor)" or "Rule Mode (System)").

## Key Technical Decisions
1. **Fetch Connections**:
   - We will use `controllerFetch` from `../utils/singbox-api` to hit the `/connections` endpoint periodically.
   - We will run the polling `useEffect` only when `isConnected` is true.
2. **Retrieve Settings**:
   - We will import `getProxyPort` and `getProxyDnsServer` from `../single/store`.
   - On component mount, we will fetch and set `proxyPort` and `proxyDns` state.
3. **Clean Up Unused State**:
   - The unused state variables `nodes` and `allNodes` will remain if needed by other components, but the homepage display references to `recentNodes` can be cleaned up if they are no longer used anywhere.

## Verification Plan
1. **Automated Verification**:
   - Run `pnpm build` to verify there are no typescript compilation errors.
2. **Manual Verification**:
   - Verify that when connected, the active connection count changes dynamically and the status changes to green.
   - Verify that when disconnected, the stats show standby values and no background fetch runs.
