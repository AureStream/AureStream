import { getControllerPort, getControllerSecret } from "@/single/store"

/** Base URL for sing-box `experimental.clash_api.external_controller`. */
export async function getControllerBaseUrl(): Promise<string> {
  const port = await getControllerPort()
  return `http://127.0.0.1:${port}`
}

export async function controllerFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const secret = await getControllerSecret()
  const baseUrl = await getControllerBaseUrl()
  const headers = new Headers(init.headers)
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${secret}`)
  }
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json")
  }
  return fetch(`${baseUrl}${path}`, { ...init, headers })
}
