import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAlert } from "@/contexts/AlertContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  onSubsUpdated,
  onTrafficLocalUpdated,
  subsList,
  subsSync,
  type NodeInfo,
  type PendingTraffic,
  type SubSummary,
  type SubsUpdatedPayload,
} from "@/lib/ipc";
import { withPendingTraffic } from "@/lib/local-traffic";
import {
  shouldRunAutoSubsSync,
  SUBS_SYNC_INTERVAL_MS,
} from "@/lib/subs-auto-sync";

type SubsContextValue = {
  subscriptions: SubSummary[];
  activeId: string | null;
  nodes: NodeInfo[];
  /** True while a background sync is in flight (inline hint only — never gates Home). */
  syncing: boolean;
};

const SubsContext = createContext<SubsContextValue>({
  subscriptions: [],
  activeId: null,
  nodes: [],
  syncing: false,
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
  const [remoteSubscriptions, setRemoteSubscriptions] = useState<SubSummary[]>([]);
  const [pendingTraffic, setPendingTraffic] = useState<PendingTraffic[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [syncing, setSyncing] = useState(false);

  const userRef = useRef(user);
  const inFlightRef = useRef(false);
  const lastSuccessAtRef = useRef<number | null>(null);

  userRef.current = user;

  const subscriptions = useMemo(
    () => withPendingTraffic(remoteSubscriptions, pendingTraffic),
    [remoteSubscriptions, pendingTraffic],
  );

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

  const runSync = useCallback(
    (opts: { ignoreInterval?: boolean; /** Dialog on failure (login only). */ notifyError?: boolean }) => {
      if (
        !shouldRunAutoSubsSync({
          hasUser: Boolean(userRef.current),
          inFlight: inFlightRef.current,
          lastSuccessAt: lastSuccessAtRef.current,
          now: Date.now(),
          ignoreInterval: opts.ignoreInterval,
        })
      ) {
        return;
      }

      inFlightRef.current = true;
      setSyncing(true);
      void subsSync()
        .then((payload) => {
          lastSuccessAtRef.current = Date.now();
          applyPayload(payload, setRemoteSubscriptions, setActiveId, setNodes);
        })
        .catch((err) => {
          // Keep last good cache. Auth failures always sign out; other errors
          // only surface a dialog on the login/restore attempt (not every tick).
          const code = (err as { code?: string } | null)?.code;
          if (code === "invalid_token" || code === "not_authenticated") {
            handleSyncError(err);
          } else if (opts.notifyError) {
            handleSyncError(err);
          }
        })
        .finally(() => {
          inFlightRef.current = false;
          setSyncing(false);
        });
    },
    [handleSyncError],
  );

  // Event bus is the source of truth for updates (e.g. future multi-window).
  useEffect(() => {
    let cancelled = false;
    let unlistenSubs: (() => void) | undefined;
    let unlistenTraffic: (() => void) | undefined;

    (async () => {
      unlistenSubs = await onSubsUpdated((payload) => {
        if (!cancelled) {
          applyPayload(payload, setRemoteSubscriptions, setActiveId, setNodes);
        }
      });
      if (cancelled) {
        unlistenSubs();
        return;
      }
      unlistenTraffic = await onTrafficLocalUpdated((payload) => {
        if (!cancelled && userRef.current) {
          setPendingTraffic(payload.pending);
        }
      });
      if (cancelled) {
        unlistenTraffic();
      }
    })();

    return () => {
      cancelled = true;
      unlistenSubs?.();
      unlistenTraffic?.();
    };
  }, []);

  // Mount / login / restore: hydrate cache then background sync. Never blocks Home.
  useEffect(() => {
    if (!user) {
      setRemoteSubscriptions([]);
      setPendingTraffic([]);
      setActiveId(null);
      setNodes([]);
      setSyncing(false);
      inFlightRef.current = false;
      lastSuccessAtRef.current = null;
      return;
    }

    let cancelled = false;
    void subsList()
      .then((payload) => {
        if (!cancelled) {
          applyPayload(payload, setRemoteSubscriptions, setActiveId, setNodes);
        }
      })
      .catch(() => {
        // Empty cache is fine; sync will fill.
      });

    // Initial sync after login/restore.
    runSync({ ignoreInterval: true, notifyError: true });

    return () => {
      cancelled = true;
    };
  }, [user, runSync]);

  // Periodic auto-sync while logged in, including during active connections.
  useEffect(() => {
    if (!user) return;

    const tick = () => {
      runSync({ ignoreInterval: false, notifyError: false });
    };

    const id = window.setInterval(tick, SUBS_SYNC_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [user, runSync]);

  return (
    <SubsContext.Provider
      value={{ subscriptions, activeId, nodes, syncing }}
    >
      {children}
    </SubsContext.Provider>
  );
}
