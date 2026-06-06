import {
  getAutoStart,
  getControllerPort,
  getHideOnLaunch,
  getMinimizeToTray,
  getProxyBypass,
  getProxyPort,
  getTunStack,
  type TunStack,
} from "@/single/store"

export type NetworkSettingsSnapshot = {
  proxyPort: number
  controllerPort: number
  tunStack: TunStack
  proxyBypass: string
  autoStart: boolean
  hideOnLaunch: boolean
  minimizeToTray: boolean
}

/** Single batched read for settings page network/tray section. */
export async function loadNetworkSettingsSnapshot(): Promise<NetworkSettingsSnapshot> {
  const [
    proxyPort,
    controllerPort,
    tunStack,
    proxyBypass,
    autoStart,
    hideOnLaunch,
    minimizeToTray,
  ] = await Promise.all([
    getProxyPort(),
    getControllerPort(),
    getTunStack(),
    getProxyBypass(),
    getAutoStart(),
    getHideOnLaunch(),
    getMinimizeToTray(),
  ])

  return {
    proxyPort,
    controllerPort,
    tunStack,
    proxyBypass,
    autoStart,
    hideOnLaunch,
    minimizeToTray,
  }
}
