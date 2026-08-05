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

export { AuthError };
