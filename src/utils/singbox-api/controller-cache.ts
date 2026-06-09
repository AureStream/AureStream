export type ControllerAuth = {
  baseUrl: string
  secret: string
}

let cachedAuth: ControllerAuth | null = null

export function getCachedControllerAuth(): ControllerAuth | null {
  return cachedAuth
}

export function setCachedControllerAuth(auth: ControllerAuth): void {
  cachedAuth = auth
}

export function invalidateControllerClientCache(): void {
  cachedAuth = null
}
