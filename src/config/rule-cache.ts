import type { configType } from "./common"

export function cacheFileNameForProfile(mode: configType): string {
  switch (mode) {
    case "mixed":
      return "mixed-cache-rule-v2.db"
    case "tun":
      return "tun-cache-rule-v2.db"
    case "mixed-global":
      return "mixed-cache-global-v2.db"
    case "tun-global":
      return "tun-cache-global-v2.db"
  }
}
