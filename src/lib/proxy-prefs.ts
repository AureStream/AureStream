/** Local proxy preference keys (UI-first; engine wiring can consume later). */

const SMART_ROUTING_KEY = "aurestream.pref.smartRouting"
const ENABLE_TUN_KEY = "aurestream.pref.enableTun"
const ENABLE_IPV6_KEY = "aurestream.pref.enableIpv6"

function readBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return raw === "1" || raw === "true"
  } catch {
    return fallback
  }
}

function writeBool(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "1" : "0")
  } catch {
    // ignore quota / private mode
  }
}

export type ProxyPrefs = {
  smartRouting: boolean
  enableTun: boolean
  enableIpv6: boolean
}

export function loadProxyPrefs(): ProxyPrefs {
  return {
    smartRouting: readBool(SMART_ROUTING_KEY, true),
    enableTun: readBool(ENABLE_TUN_KEY, false),
    enableIpv6: readBool(ENABLE_IPV6_KEY, false),
  }
}

export function setSmartRoutingPref(value: boolean) {
  writeBool(SMART_ROUTING_KEY, value)
}

export function setEnableTunPref(value: boolean) {
  writeBool(ENABLE_TUN_KEY, value)
}

export function setEnableIpv6Pref(value: boolean) {
  writeBool(ENABLE_IPV6_KEY, value)
}
