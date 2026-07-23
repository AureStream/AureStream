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
  await deps.insertSubscription(activeSubscription.url, activeSubscription.name, activeSubscription.id)
  await deps.syncActiveConnectionConfig("login-init")
}
