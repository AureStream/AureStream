# AureStream privileged helper (macOS)

Root-level launchd helper invoked from the AureStream app via XPC. It runs TUN startup, DNS override, IP forwarding, and route cleanup so the main app never holds sudo credentials.

## Bundle identifiers

| Component | Identifier |
|-----------|------------|
| Main app | `com.root.aurestream` |
| Helper | `com.root.aurestream.helper` |

## Config path validation

`startSingBoxWithConfigPath:` only accepts JSON under:

`~/Library/Application Support/com.root.aurestream/`

The sing-box binary path is derived from the caller's code signature (not client-supplied).

## XPC capabilities

| Method | Purpose |
|--------|---------|
| `ping` | Heartbeat / install check |
| `startSingBoxWithConfigPath:` | `posix_spawn` sing-box as root |
| `stopSingBox` | `SIGTERM` to tracked pid |
| `reloadSingBox` | `SIGHUP` to tracked pid |
| `setIpForwarding:` | Enable/disable IP forwarding |
| `setDnsServersForService:spec:` | `networksetup -setdnsservers` |
| `flushDnsCache` | Flush system DNS cache |
| `removeTunRoutesForInterface:` | Clean TUN routes (`utun*` only) |
| `uninstallSelf` | Unload launchd job and remove blessed helper files |

## Layout

```
src-tauri/helper/
  Sources/main.m       # Helper entry + XPC service
  Info.plist
  Launchd.plist
  com.root.aurestream.helper.plist
```

Build and sign via `pnpm pre-bundle` (see project root `scripts/prebundle.ts`).
