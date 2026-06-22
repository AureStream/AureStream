import type { EngineState } from "@/types/engine-state"
import type { ProxyMode as EngineProxyMode } from "@/utils/vpn-service"
import type { ProxyMode as UiProxyMode } from "@/components/ModeSelector"

export type TrayRequestedMode = "system" | "tun"

export type TrayEngineState =
  | Pick<Extract<EngineState, { kind: "starting" | "running" }>, "kind" | "mode">
  | Pick<Extract<EngineState, { kind: "switching" }>, "kind" | "to_mode">
  | Pick<Extract<EngineState, { kind: "idle" | "stopping" | "failed" }>, "kind">

export type TrayModeAction = "connect" | "switch" | "disconnect"

export type TrayModePlan = {
  action: TrayModeAction
  targetUiMode: Extract<UiProxyMode, "rule" | "tun">
  targetEngineMode: EngineProxyMode
}

export function uiModeFromEngineState(
  state: TrayEngineState
): Extract<UiProxyMode, "rule" | "tun"> | null {
  if (state.kind !== "running" && state.kind !== "starting") {
    return null
  }
  return state.mode === "tun" ? "tun" : "rule"
}

export function trayModeToUiMode(
  mode: TrayRequestedMode
): Extract<UiProxyMode, "rule" | "tun"> {
  return mode === "tun" ? "tun" : "rule"
}

export function trayModeToEngineMode(mode: TrayRequestedMode): EngineProxyMode {
  return mode === "tun" ? "IntoProxy" : "SystemProxy"
}

export function planTrayModeAction(
  state: TrayEngineState,
  requestedMode: TrayRequestedMode
): TrayModePlan {
  const targetUiMode = trayModeToUiMode(requestedMode)
  const targetEngineMode = trayModeToEngineMode(requestedMode)
  const currentUiMode = uiModeFromEngineState(state)

  // Engine not running: connect to requested mode
  if (currentUiMode === null) {
    return { action: "connect", targetUiMode, targetEngineMode }
  }

  // Clicking the already-active mode: disconnect (turn off proxy)
  if (currentUiMode === targetUiMode) {
    return { action: "disconnect", targetUiMode, targetEngineMode }
  }

  // Clicking the other mode while connected: fast switch
  return { action: "switch", targetUiMode, targetEngineMode }
}
