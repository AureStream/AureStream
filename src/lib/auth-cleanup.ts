import { clearAllLocalSubscriptionData } from '../action/db'
import { clearUserDataStore } from '../single/store'
import { clearNodeLatency } from './node-latency'

/**
 * Clears all user-specific local data (SQLite database subscriptions,
 * settings store user config, and in-memory node latency caches).
 * Call this during logout, login, or registration to ensure a clean state.
 */
export async function clearLocalUserData(): Promise<void> {
  try {
    // 1. Clear database subscriptions, subscription configs, and node latencies
    await clearAllLocalSubscriptionData()

    // 2. Clear user-specific store values
    await clearUserDataStore()

    // 3. Clear in-memory node latency caches
    clearNodeLatency()

    console.info('[AuthCleanup] Successfully cleared all local user data')
  } catch (error) {
    console.error('[AuthCleanup] Failed to clear local user data:', error)
  }
}
