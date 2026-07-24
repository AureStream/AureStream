import type { Subscription } from "../api/subscriptions"
import { SSI_STORE_KEY } from "../types/definition"

interface LoginInitializationDeps {
  fetchSubscriptions: () => Promise<Subscription[]>
  setStoreValue: (key: string, value: unknown) => Promise<void>
  insertSubscription: (url: string, name?: string, customIdentifier?: string) => Promise<string | undefined>
  syncActiveConnectionConfig: (reason?: string) => Promise<unknown>
}

/**
 * @deprecated Prefer `bootstrapSessionData("login")` via AuthContext.
 * Kept for unit tests that inject deps; production login uses session-bootstrap.
 */
export async function initializeAfterLogin(deps: LoginInitializationDeps) {
  const subs = await deps.fetchSubscriptions()
  if (!subs || subs.length === 0) {
    throw new Error("当前账号没有可用订阅")
  }

  // Full multi-sub sync path is production default; this legacy helper still
  // seeds the first subscription for isolated tests.
  const activeSubscription = subs[0]
  await deps.setStoreValue(SSI_STORE_KEY, activeSubscription.id)
  const inserted = await deps.insertSubscription(
    activeSubscription.url,
    activeSubscription.name,
    activeSubscription.id
  )
  if (!inserted) {
    throw new Error("订阅配置拉取失败")
  }

  void deps.syncActiveConnectionConfig("login-init").catch((error) => {
    console.error("[login-init] config sync failed:", error)
  })
}
