import { useEffect, useRef } from "react"
import { useEngineState } from "./useEngineState"
import { subscribeTraffic } from "@/utils/singbox-api/traffic"
import { getStoreValue } from "@/single/store"
import { SSI_STORE_KEY } from "@/types/definition"
import { accumulateUsedTraffic, getLocalSubscriptions, uploadPendingTraffic } from "@/action/db"

const CONNECTED_UPLOAD_DELAY_MS = 5000

export function useTrafficAccumulator(onTrafficUpdated?: () => void) {
  const { isConnected } = useEngineState()
  const accumulatedUploadRef = useRef<number>(0)
  const accumulatedDownloadRef = useRef<number>(0)
  const activeSubIdRef = useRef<string>("")

  const persistAccumulatedTraffic = async () => {
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
  }
  
  // Save traffic to DB every 5 seconds
  useEffect(() => {
    if (!isConnected) return

    const persistInterval = setInterval(async () => {
      await persistAccumulatedTraffic()
    }, 5000)

    return () => {
      clearInterval(persistInterval)
    }
  }, [isConnected, onTrafficUpdated])

  // Upload traffic to cloud every 1 minute (60,000 ms)
  useEffect(() => {
    if (!isConnected) return

    const initialUploadTimeout = setTimeout(() => {
      void uploadPendingTraffic()
    }, CONNECTED_UPLOAD_DELAY_MS)
    const uploadInterval = setInterval(async () => {
      await uploadPendingTraffic()
    }, 60000)

    return () => {
      clearTimeout(initialUploadTimeout)
      clearInterval(uploadInterval)
    }
  }, [isConnected])

  // Subscribe to WebSocket traffic ticks
  useEffect(() => {
    if (!isConnected) {
      void persistAccumulatedTraffic()
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
      void persistAccumulatedTraffic()
    }
  }, [isConnected, onTrafficUpdated])
}
