import {
  createContext,
  useCallback,
  useContext,
  type ReactNode,
} from "react";
import { useEngineState } from "@/hooks/useEngineState";
import {
  engineSelectNode,
  engineStart,
  engineStop,
  type EngineStatePayload,
} from "@/lib/ipc";

type EngineContextValue = {
  /** Source of truth from `engine-state` events (plus one-shot hydrate). */
  engine: EngineStatePayload;
  start: (nodeTag?: string) => Promise<void>;
  stop: () => Promise<void>;
  selectNode: (nodeTag: string) => Promise<void>;
};

const EngineContext = createContext<EngineContextValue>({
  engine: { state: "idle" },
  start: async () => {},
  stop: async () => {},
  selectNode: async () => {},
});

export function useEngine() {
  return useContext(EngineContext);
}

/**
 * Thin command wrappers + event-driven state. UI must not invent a parallel FSM.
 */
export function EngineProvider({ children }: { children: ReactNode }) {
  const engine = useEngineState();

  const start = useCallback(async (nodeTag?: string) => {
    await engineStart(nodeTag);
  }, []);

  const stop = useCallback(async () => {
    await engineStop();
  }, []);

  const selectNode = useCallback(async (nodeTag: string) => {
    await engineSelectNode(nodeTag);
  }, []);

  return (
    <EngineContext.Provider value={{ engine, start, stop, selectNode }}>
      {children}
    </EngineContext.Provider>
  );
}
