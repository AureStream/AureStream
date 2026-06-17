import { getControllerPort, getControllerSecret } from "@/single/store"
import {
  getCachedControllerAuth,
  setCachedControllerAuth,
} from "./controller-cache"

export async function getControllerAuth() {
  const cached = getCachedControllerAuth()
  if (cached) {
    return cached
  }

  const [port, secret] = await Promise.all([
    getControllerPort(),
    getControllerSecret(),
  ])
  const auth = {
    baseUrl: `http://127.0.0.1:${port}`,
    secret,
  }
  setCachedControllerAuth(auth)
  return auth
}

/** Base URL for sing-box `experimental.clash_api.external_controller`. */
export async function getControllerBaseUrl(): Promise<string> {
  const { baseUrl } = await getControllerAuth()
  return baseUrl
}

export async function controllerFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const { baseUrl, secret } = await getControllerAuth()
  const headers = new Headers(init.headers)
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${secret}`)
  }
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json")
  }
  return fetch(`${baseUrl}${path}`, { ...init, headers })
}
