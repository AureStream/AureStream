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
import { isTauri } from "@tauri-apps/api/core";
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

export type SyncSubscriptionsOptions = {
  /** If true, bypass interval/min-gap checks (e.g. startup initial sync or manual click). */
  force?: boolean;
  /** If true, show user prompt on success (node count) and error (manual click). */
  interactive?: boolean;
};

type SubsContextValue = {
  subscriptions: SubSummary[];
  activeId: string | null;
  nodes: NodeInfo[];
  /** True while a background sync is in flight (inline hint only — never gates Home). */
  syncing: boolean;
  /** Unified subscription sync: pulls remote, parses nodes, persists to disk, updates state. */
  syncSubscriptions: (opts?: SyncSubscriptionsOptions) => Promise<SubsUpdatedPayload | null>;
};

const SubsContext = createContext<SubsContextValue>({
  subscriptions: [],
  activeId: null,
  nodes: [],
  syncing: false,
  syncSubscriptions: async () => null,
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
  const { showError, showInfo, showSuccess, showErrorFromUnknown } = useAlert();
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

  const syncSubscriptions = useCallback(
    async (opts?: SyncSubscriptionsOptions): Promise<SubsUpdatedPayload | null> => {
      const force = opts?.force ?? false;
      const interactive = opts?.interactive ?? false;

      if (!userRef.current) {
        if (interactive) {
          showError("请先登录账号", "同步失败");
        }
        return null;
      }

      if (inFlightRef.current) {
        return null;
      }

      if (
        !force &&
        !shouldRunAutoSubsSync({
          hasUser: Boolean(userRef.current),
          inFlight: false,
          lastSuccessAt: lastSuccessAtRef.current,
          now: Date.now(),
          ignoreInterval: false,
        })
      ) {
        return null;
      }

      inFlightRef.current = true;
      setSyncing(true);

      try {
        const payload = await subsSync();
        lastSuccessAtRef.current = Date.now();
        applyPayload(payload, setRemoteSubscriptions, setActiveId, setNodes);

        if (interactive) {
          const subCount = payload.subscriptions?.length ?? 0;
          const nodeCount = payload.nodes?.length ?? 0;
          if (subCount === 0) {
            showInfo("订阅已刷新，但未获取到有效订阅", "同步提示");
          } else if (nodeCount === 0) {
            showInfo(`已同步 ${subCount} 条订阅，但未解析到可用节点`, "同步提示");
          } else {
            showSuccess(`订阅同步成功，已解析并保存 ${nodeCount} 个节点`, "同步成功");
          }
        }

        return payload;
      } catch (err) {
        const code = (err as { code?: string } | null)?.code;
        if (code === "invalid_token" || code === "not_authenticated") {
          void logout();
        } else if (interactive) {
          showErrorFromUnknown(err, "同步订阅失败，请检查网络后重试", "同步失败");
        }
        return null;
      } finally {
        inFlightRef.current = false;
        setSyncing(false);
      }
    },
    [logout, showError, showInfo, showSuccess, showErrorFromUnknown],
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
        if (!isTauri()) {
          setNodes([{ tag: "hk-01", name: "香港 01 专线", protocol: "vless" }]);
        }
      });

    // Initial sync after mount/login/restore: update latest subscriptions to local
    if (isTauri()) {
      void syncSubscriptions({ force: true, interactive: false });
    }

    return () => {
      cancelled = true;
    };
  }, [user, syncSubscriptions]);

  // Periodic auto-sync while logged in, including during active connections (every 1 hour).
  useEffect(() => {
    if (!user) return;

    const tick = () => {
      void syncSubscriptions({ force: false, interactive: false });
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
  }, [user, syncSubscriptions]);

  return (
    <SubsContext.Provider
      value={{ subscriptions, activeId, nodes, syncing, syncSubscriptions }}
    >
      {children}
    </SubsContext.Provider>
  );
}
