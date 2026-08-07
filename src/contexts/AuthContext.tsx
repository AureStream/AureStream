import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  authLogin,
  authLogout,
  authRegister,
  authRestore,
  authVerify,
  onAuthChanged,
  type RegisterPending,
  type User,
} from "@/lib/ipc";

type AuthContextValue = {
  user: User | null;
  /** True while a login / register / verify request is in flight (button spinner). */
  authLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<RegisterPending>;
  verifyAndLogin: (email: string, password: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  authLoading: false,
  login: async () => {},
  register: async () => ({ email: "", expires_in: 0 }),
  verifyAndLogin: async () => {},
  logout: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    (async () => {
      unlisten = await onAuthChanged((payload) => {
        if (!cancelled) {
          // Startup emits `auth-changed` twice (setup spawn + authRestore) with
          // equal-but-distinct user objects. Keep the existing reference when
          // the identity is unchanged, so effects keyed on `user` don't re-run
          // and fire a second concurrent subs sync.
          setUser((prev) =>
            prev && payload.user && prev.id === payload.user.id
              ? prev
              : payload.user,
          );
        }
      });
      try {
        const restoredUser = await authRestore();
        if (!cancelled) {
          setUser(restoredUser);
        }
      } catch {
        if (!cancelled) {
          setUser(null);
        }
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setAuthLoading(true);
    try {
      const authenticatedUser = await authLogin(email, password);
      setUser(authenticatedUser);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    setAuthLoading(true);
    try {
      return await authRegister(email, password);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const verifyAndLogin = useCallback(
    async (email: string, password: string, code: string) => {
      setAuthLoading(true);
      try {
        await authVerify(email, code);
        await authLogin(email, password);
      } finally {
        setAuthLoading(false);
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    setAuthLoading(true);
    try {
      await authLogout();
    } finally {
      setAuthLoading(false);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, authLoading, login, register, verifyAndLogin, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
