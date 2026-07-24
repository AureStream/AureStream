import type { Subscription } from "../api/subscriptions"
import { SSI_STORE_KEY } from "../types/definition"

interface LoginInitializationDeps {
  fetchSubscriptions: () => Promise<Subscription[]>
  setStoreValue: (key: string, value: unknown) => Promise<void>
  insertSubscription: (url: string, name?: string, customIdentifier?: string) => Promise<string | undefined>
  syncActiveConnectionConfig: (reason?: string) => Promise<unknown>
}

export async function initializeAfterLogin(deps: LoginInitializationDeps) {
  const subs = await deps.fetchSubscriptions()
  if (!subs || subs.length === 0) {
    throw new Error("当前账号没有可用订阅")
  }

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

  // Config merge can finish after navigation; blocking here delays home paint.
  void deps.syncActiveConnectionConfig("login-init").catch((error) => {
    console.error("[login-init] config sync failed:", error)
  })
}
