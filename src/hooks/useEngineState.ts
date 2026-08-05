import { useEffect, useState } from "react";
import {
  engineGetState,
  onEngineState,
  type EngineStatePayload,
} from "@/lib/ipc";

const IDLE: EngineStatePayload = { state: "idle" };

/**
 * Event-driven engine state. Never gates on sessionReady / sync.
 * Initial hydrate via engine_get_state; updates only from `engine-state`.
 */
export function useEngineState(): EngineStatePayload {
  const [payload, setPayload] = useState<EngineStatePayload>(IDLE);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    (async () => {
      unlisten = await onEngineState((next) => {
        if (!cancelled) setPayload(next);
      });
      try {
        const current = await engineGetState();
        if (!cancelled) setPayload(current);
      } catch {
        // Offline / pre-ready invoke is fine; stay idle until an event.
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return payload;
}
