import { message } from "@tauri-apps/plugin-dialog"

import { ENGINE_BUSY_MESSAGE, isEngineBusy } from "@/lib/engine-guard"
import { getEngineState } from "@/utils/vpn-service"

/** Returns false when the engine is busy and a warning was shown. */
export async function requireEngineIdle(): Promise<boolean> {
  const state = await getEngineState()
  if (isEngineBusy(state)) {
    await message(ENGINE_BUSY_MESSAGE, { title: "提示", kind: "warning" })
    return false
  }
  return true
}
