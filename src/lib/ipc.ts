import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { AuthError, parseAuthInvokeError } from "./auth-errors";

export type User = {
  id: string;
  email: string;
  created_at: number;
};

export type RegisterPending = {
  email: string;
  expires_in: number;
};

export type AuthChangedPayload = {
  user: User | null;
};

export const AUTH_CHANGED_EVENT = "auth-changed";

async function invokeAuth<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (raw) {
    throw parseAuthInvokeError(raw);
  }
}

export async function authLogin(email: string, password: string): Promise<User> {
  return invokeAuth<User>("auth_login", { email, password });
}

export async function authRegister(
  email: string,
  password: string,
): Promise<RegisterPending> {
  return invokeAuth<RegisterPending>("auth_register", { email, password });
}

export async function authVerify(email: string, code: string): Promise<User> {
  return invokeAuth<User>("auth_verify", { email, code });
}

export async function authLogout(): Promise<void> {
  try {
    await invoke<void>("auth_logout");
  } catch (raw) {
    throw parseAuthInvokeError(raw);
  }
}

/** Non-blocking: Rust returns immediately and later emits `auth-changed`. */
export async function authRestore(): Promise<void> {
  await invoke<void>("auth_restore");
}

export async function onAuthChanged(
  handler: (payload: AuthChangedPayload) => void,
): Promise<UnlistenFn> {
  return listen<AuthChangedPayload>(AUTH_CHANGED_EVENT, (event) => {
    handler(event.payload);
  });
}

export type SubSummary = {
  id: string;
  name: string;
  trafficUsed: number;
  trafficTotal: number;
  expireTime: number;
};

export type NodeInfo = {
  tag: string;
  name: string;
  protocol: string;
  /** Server host for TCP latency probe. */
  server?: string;
  /** Server port for TCP latency probe. */
  port?: number;
};

/** TCP connect RTT in ms; rejects on timeout / error. */
export async function pingTcp(
  host: string,
  port: number,
  timeoutMs?: number,
): Promise<number> {
  return invoke<number>("ping_tcp", {
    host,
    port,
    timeoutMs: timeoutMs ?? null,
  });
}

export type SubsUpdatedPayload = {
  subscriptions: SubSummary[];
  activeId: string | null;
  nodes: NodeInfo[];
};

export const SUBS_UPDATED_EVENT = "subs-updated";

/** Fire-and-forget friendly: returns when sync finishes, but callers should not await before navigate. */
export async function subsSync(): Promise<SubsUpdatedPayload> {
  return invoke<SubsUpdatedPayload>("subs_sync");
}

export async function subsList(): Promise<SubsUpdatedPayload> {
  return invoke<SubsUpdatedPayload>("subs_list");
}

export async function onSubsUpdated(
  handler: (payload: SubsUpdatedPayload) => void,
): Promise<UnlistenFn> {
  return listen<SubsUpdatedPayload>(SUBS_UPDATED_EVENT, (event) => {
    handler(event.payload);
  });
}

export type CaptureMode = "off" | "system" | "tun";

export type EngineStatePayload = {
  state: string;
  reason?: string;
  selectedNode?: string;
  /** `off` | `system` | `tun` */
  captureMode?: CaptureMode | string;
};

export const ENGINE_STATE_EVENT = "engine-state";

export type EngineStartOptions = {
  nodeTag?: string;
  /** default `system` */
  mode?: "system" | "tun";
  smartRouting?: boolean;
};

export async function engineStart(
  nodeTagOrOpts?: string | EngineStartOptions,
): Promise<EngineStatePayload> {
  const opts: EngineStartOptions =
    typeof nodeTagOrOpts === "string" || nodeTagOrOpts === undefined
      ? { nodeTag: nodeTagOrOpts }
      : nodeTagOrOpts;
  return invoke<EngineStatePayload>("engine_start", {
    nodeTag: opts.nodeTag ?? null,
    mode: opts.mode ?? "system",
    smartRouting: opts.smartRouting ?? null,
  });
}

export async function engineProbeTun(): Promise<"notInstalled" | "ready" | "running" | string> {
  return invoke<string>("engine_probe_tun");
}

/** Uninstall elevated TUN helper/service (macOS / Windows). May prompt admin once. */
export async function engineUninstallHelper(): Promise<void> {
  await invoke("engine_uninstall_helper");
}

export async function engineStop(): Promise<EngineStatePayload> {
  return invoke<EngineStatePayload>("engine_stop");
}

export async function engineSelectNode(nodeTag: string): Promise<EngineStatePayload> {
  return invoke<EngineStatePayload>("engine_select_node", { nodeTag });
}

export async function engineGetState(): Promise<EngineStatePayload> {
  return invoke<EngineStatePayload>("engine_get_state");
}

export async function onEngineState(
  handler: (payload: EngineStatePayload) => void,
): Promise<UnlistenFn> {
  return listen<EngineStatePayload>(ENGINE_STATE_EVENT, (event) => {
    handler(event.payload);
  });
}

export { AuthError };
