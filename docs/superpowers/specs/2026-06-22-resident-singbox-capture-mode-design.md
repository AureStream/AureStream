# Resident sing-box Capture Mode Design

## Problem

Mode switching currently stops one sing-box process and starts another with a different config profile. Local logs show this fails on macOS when TUN shutdown leaves `2345` or `9191` temporarily not bindable. A following SystemProxy start can then fail with `listen tcp 127.0.0.1:9191: bind: address already in use`.

The desired behavior is to keep sing-box running after application startup. Clicking disconnect should disable system traffic capture, not stop sing-box. Switching between system proxy and virtual gateway should change only the OS capture layer.

## Goals

- Start sing-box once after the app has a valid active config, then keep it running until app exit.
- Use a stable config that always contains both `mixed` and `tun` inbounds.
- Represent connection state as capture state: `off`, `system`, or `tun`.
- Change tray/home mode switching to update capture state without restarting sing-box or sending SIGHUP.
- Avoid structural config reloads during mode switches.

## Non-Goals

- Do not use SIGHUP as the primary mode switch mechanism.
- Do not dynamically add or remove sing-box inbounds at runtime.
- Do not keep OS traffic captured when the user chooses disconnect.
- Do not solve unrelated subscription-fetch retries or node latency behavior.

## Architecture

The app will split engine state into two responsibilities:

- Core lifecycle: whether the sing-box process is available.
- Capture state: whether OS traffic is currently routed through system proxy, TUN, or neither.

Core lifecycle stays long-lived. Capture state is changed by platform-specific network operations.

## Stable Config Profile

The config template already contains both `tun` and `mixed` inbounds. The mixed profile currently filters out the TUN inbound in `src/config/templates/index.ts`; that behavior will be removed or replaced by a new resident profile.

The resident profile will:

- Always include `mixed` inbound on the configured proxy port.
- Always include `tun` inbound with the configured TUN stack/interface settings.
- Keep Clash API enabled on the configured controller port.
- Continue updating outbound selector data and routing rules through the existing merger.

Mode changes will not rewrite config solely to add or remove inbounds.

For resident profiles, `tun.auto_route` is disabled in the generated template. This prevents the long-lived core from taking over routes while capture state is `off` or `system`; TUN capture must be enabled by platform route/DNS operations instead.

## Reference Implementations Checked

- Clash Verge Rev (`clash-verge-rev/clash-verge-rev` at `9b87cd53`) keeps system proxy and TUN as separate user-facing switches. Its TUN flow patches runtime config (`patch_base_config`) to change `tun.enable`, and its shutdown path disables TUN before stopping the core.
- Hiddify (`hiddify/hiddify-app` at `276a7eff`) uses platform VPN/packet-tunnel service models for TUN-class capture on Apple/Android platforms. This reinforces keeping capture as an OS/service state instead of conflating it with the UI proxy mode.
- GUI.for.SingBox (`GUI-for-Cores/GUI.for.SingBox` at `cd51ffd9`) models mixed and TUN inbounds in the profile data and exposes TUN enable/disable as configuration state. Some changes still restart the core, so only its inbound modeling pattern applies to AureStream; the no-restart requirement still needs separate capture operations.

## Capture State Semantics

`off` means:

- sing-box process remains running.
- system proxy is disabled.
- TUN routes are removed.
- TUN DNS override is restored to the captured original DNS.

`system` means:

- sing-box process remains running.
- system proxy points to the mixed inbound.
- TUN routes are removed.
- TUN DNS override is restored.

`tun` means:

- sing-box process remains running.
- system proxy is disabled.
- TUN routes are active.
- DNS points to the TUN gateway.

The home page connection indicator is connected when capture state is `system` or `tun`, not merely when sing-box is running.

## Tray Behavior

- When capture state is `off`, no tray mode is checked.
- When capture state is `system`, only system proxy is checked.
- When capture state is `tun`, only virtual gateway is checked.
- Clicking the currently checked mode changes capture state to `off`.
- Clicking the other mode switches directly to that capture state.

## macOS Platform Work

macOS currently starts TUN through the privileged helper and removes TUN routes through `remove_tun_routes`. For resident mode switching, route activation must be callable independently from sing-box startup.

Add helper-facing operations:

- `enable_tun_capture(interface_name, gateway, bypass_router_enabled)`: apply routes, apply DNS override, enable optional IP forwarding.
- `disable_tun_capture(interface_name)`: remove routes, restore DNS, disable optional IP forwarding.

If sing-box with `auto_route` only adds routes during process startup, resident mode needs either:

- helper-owned route add/remove operations matching the routes sing-box expects, or
- a config strategy where TUN inbound remains present but route ownership is controlled outside automatic startup.

The implementation must verify route state after switching to or from TUN.

## Frontend State Flow

The frontend will stop treating `enableTun` as process mode. It becomes the preferred capture mode, or is replaced by a dedicated capture-mode store key.

Mode switch flow:

1. User clicks home mode control or tray item.
2. Frontend invokes a backend command like `set_capture_mode(mode)`.
3. Backend applies platform capture changes.
4. Backend emits a capture-state event.
5. Home and tray render from the emitted capture state.

The frontend must not call `stopEngine()` or `startEngine()` for normal mode changes.

## Backend State Flow

On app setup:

1. Load active subscription/config inputs.
2. Ensure resident config exists.
3. Start sing-box if it is not already running.
4. Set capture state to the persisted mode or `off`.
5. Emit both core lifecycle and capture state.

On mode switch:

1. Reject concurrent capture changes.
2. Apply platform capture transition.
3. Persist the new capture mode.
4. Emit capture state.

On app exit:

1. Disable capture.
2. Stop sing-box.
3. Run existing shutdown cleanup as fallback.

## Error Handling

- If sing-box is not running when a capture mode is requested, backend attempts to start it once, then applies capture.
- If route or DNS activation fails, capture state becomes `off` or `failed` and the previous OS state is restored where possible.
- If system proxy setup fails, capture state remains `off`.
- Any structural config change that requires a sing-box restart is surfaced as a restart-required condition instead of silently restarting during a mode switch.

## Testing

- Unit-test resident config generation: mixed and TUN inbounds both exist for resident mode.
- Unit-test tray/home capture decisions: current checked mode click maps to `off`; other mode maps to the requested capture mode.
- Unit-test backend state transitions for `off`, `system`, and `tun`.
- Add macOS helper integration checks for route/DNS apply and removal where local privileges allow.
- Manually verify macOS logs no longer show stop/start cycles or `bind: address already in use` during mode switches.

## Migration

Existing `last_proxy_mode` can map to initial capture mode:

- `system` -> `system`
- `tun` -> `tun`
- missing or invalid -> `off`

Existing `enableTun` remains readable during migration but should not drive process lifecycle after resident mode is implemented.
