import { useEffect, useRef } from "react"
import { useEngineState } from "./useEngineState"
import { subscribeTraffic } from "@/utils/singbox-api/traffic"
import { getStoreValue } from "@/single/store"
import { SSI_STORE_KEY } from "@/types/definition"
import { accumulateUsedTraffic, getLocalSubscriptions, uploadPendingTraffic } from "@/action/db"

export function useTrafficAccumulator(onTrafficUpdated?: () => void) {
  const { isConnected } = useEngineState()
  const accumulatedUploadRef = useRef<number>(0)
  const accumulatedDownloadRef = useRef<number>(0)
  const activeSubIdRef = useRef<string>("")
  
  // Save traffic to DB every 5 seconds
  useEffect(() => {
    if (!isConnected) return

    const persistInterval = setInterval(async () => {
      const up = accumulatedUploadRef.current
      const down = accumulatedDownloadRef.current
      if (up <= 0 && down <= 0) return
      
      const subId = activeSubIdRef.current || (await getStoreValue(SSI_STORE_KEY))
      if (subId) {
        await accumulateUsedTraffic(subId, up, down)
        accumulatedUploadRef.current -= up
        accumulatedDownloadRef.current -= down
        if (onTrafficUpdated) {
          onTrafficUpdated()
        }
      }
    }, 5000)

    return () => {
      clearInterval(persistInterval)
    }
  }, [isConnected, onTrafficUpdated])

  // Upload traffic to cloud every 1 minute (60,000 ms)
  useEffect(() => {
    if (!isConnected) return

    const uploadInterval = setInterval(async () => {
      await uploadPendingTraffic()
    }, 60000)

    return () => {
      clearInterval(uploadInterval)
    }
  }, [isConnected])

  // Subscribe to WebSocket traffic ticks
  useEffect(() => {
    // Force database persist and upload on state change/disconnect
    const flushRemaining = async () => {
      const up = accumulatedUploadRef.current
      const down = accumulatedDownloadRef.current
      const subId = activeSubIdRef.current || (await getStoreValue(SSI_STORE_KEY))
      
      if (subId && (up > 0 || down > 0)) {
        await accumulateUsedTraffic(subId, up, down)
        accumulatedUploadRef.current -= up
        accumulatedDownloadRef.current -= down
        if (onTrafficUpdated) {
          onTrafficUpdated()
        }
      }
      // Sync with API
      await uploadPendingTraffic()
    }

    if (!isConnected) {
      flushRemaining()
      return
    }

    const abort = new AbortController()
    
    // Cache active subscription ID
    getStoreValue(SSI_STORE_KEY).then((val) => {
      if (val) {
        activeSubIdRef.current = val
      } else {
        getLocalSubscriptions().then(subs => {
          if (subs && subs.length > 0) {
            activeSubIdRef.current = subs[0].id
          }
        })
      }
    })

    subscribeTraffic((tick) => {
      if (tick.up > 0) accumulatedUploadRef.current += tick.up
      if (tick.down > 0) accumulatedDownloadRef.current += tick.down
    }, abort.signal).catch(err => {
      if (err.name !== "AbortError") {
        console.error("Traffic accumulation subscription failed:", err)
      }
    })

    return () => {
      abort.abort()
      flushRemaining()
    }
  }, [isConnected, onTrafficUpdated])
}
