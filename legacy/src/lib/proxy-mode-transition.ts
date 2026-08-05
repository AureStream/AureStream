import type { TrayModeAction } from "./tray-mode"
import type { ProxyMode } from "@/types/proxy-mode"

export function shouldEnsureTunServiceBeforeModeAction(
  action: TrayModeAction,
  targetUiMode: Extract<ProxyMode, "rule" | "tun">
): boolean {
  return targetUiMode === "tun" && action !== "disconnect"
}
