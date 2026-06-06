import { invoke } from "@tauri-apps/api/core"

let configDirPromise: Promise<string> | null = null
let configJsonPathPromise: Promise<string> | null = null

/** Cached app config directory (stable for the app lifetime). */
export async function getAppConfigDir(): Promise<string> {
  if (!configDirPromise) {
    configDirPromise = invoke<Record<string, string>>("get_app_paths")
      .then((paths) => paths.config_dir)
      .catch((err) => {
        configDirPromise = null
        throw err
      })
  }
  return configDirPromise
}

/** Absolute path to sing-box `config.json` (resolved once via Rust). */
export async function getConfigJsonPath(): Promise<string> {
  if (!configJsonPathPromise) {
    configJsonPathPromise = invoke<string>("get_config_json_path").catch((err) => {
      configJsonPathPromise = null
      throw err
    })
  }
  return configJsonPathPromise
}
