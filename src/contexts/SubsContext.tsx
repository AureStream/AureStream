import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useAlert } from "@/contexts/AlertContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  onSubsUpdated,
  subsList,
  subsSync,
  type NodeInfo,
  type SubSummary,
  type SubsUpdatedPayload,
} from "@/lib/ipc";

type SubsContextValue = {
  subscriptions: SubSummary[];
  activeId: string | null;
  nodes: NodeInfo[];
  /** True while a background sync is in flight (inline hint only — never gates Home). */
  syncing: boolean;
  refresh: () => void;
};

const SubsContext = createContext<SubsContextValue>({
  subscriptions: [],
  activeId: null,
  nodes: [],
  syncing: false,
  refresh: () => {},
});

export function useSubs() {
  return useContext(SubsContext);
}

function applyPayload(
  payload: SubsUpdatedPayload,
  setSubscriptions: (v: SubSummary[]) => void,
  setActiveId: (v: string | null) => void,
  setNodes: (v: NodeInfo[]) => void,
) {
  setSubscriptions(payload.subscriptions);
  setActiveId(payload.activeId);
  setNodes(payload.nodes);
}

export function SubsProvider({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { showErrorFromUnknown } = useAlert();
  const [subscriptions, setSubscriptions] = useState<SubSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [syncing, setSyncing] = useState(false);

  // Rust refreshes expired access tokens and retries, so a token error here
  // means the session is unrecoverable — sign out instead of showing an error
  // the user cannot act on.
  const handleSyncError = useCallback(
    (err: unknown) => {
      const code = (err as { code?: string } | null)?.code;
      if (code === "invalid_token" || code === "not_authenticated") {
        void logout();
        return;
      }
      showErrorFromUnknown(err, "订阅同步失败", "同步失败");
    },
    [logout, showErrorFromUnknown],
  );

  // Event bus is the source of truth for updates.
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    (async () => {
      unlisten = await onSubsUpdated((payload) => {
        if (!cancelled) {
          applyPayload(payload, setSubscriptions, setActiveId, setNodes);
          setSyncing(false);
        }
      });
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const refresh = useCallback(() => {
    if (!user) return;
    setSyncing(true);
    void subsSync()
      .then((payload) => {
        applyPayload(payload, setSubscriptions, setActiveId, setNodes);
      })
      .catch((err) => {
        // Keep last good cache; surface error in dialog.
        handleSyncError(err);
      })
      .finally(() => {
        setSyncing(false);
      });
  }, [user, handleSyncError]);

  // Mount / login / restore: hydrate cache then background sync. Never blocks Home.
  useEffect(() => {
    if (!user) {
      setSubscriptions([]);
      setActiveId(null);
      setNodes([]);
      setSyncing(false);
      return;
    }

    let cancelled = false;
    void subsList()
      .then((payload) => {
        if (!cancelled) {
          applyPayload(payload, setSubscriptions, setActiveId, setNodes);
        }
      })
      .catch(() => {
        // Empty cache is fine; sync will fill.
      });

    // Background sync — must not delay login navigation (login never awaits this).
    setSyncing(true);
    void subsSync()
      .then((payload) => {
        if (!cancelled) {
          applyPayload(payload, setSubscriptions, setActiveId, setNodes);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          handleSyncError(err);
        }
      })
      .finally(() => {
        if (!cancelled) setSyncing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, handleSyncError]);

  return (
    <SubsContext.Provider
      value={{ subscriptions, activeId, nodes, syncing, refresh }}
    >
      {children}
    </SubsContext.Provider>
  );
}
