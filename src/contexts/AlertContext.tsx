import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { listen } from "@tauri-apps/api/event"
import { AuthError } from "@/lib/auth-errors"
import { cn } from "@/lib/utils"

export type AlertKind = "error" | "info" | "success"

export type AlertOptions = {
  title?: string
  message: string
  kind?: AlertKind
}

export type ConfirmOptions = AlertOptions & {
  confirmLabel?: string
  cancelLabel?: string
}

type AlertContextValue = {
  showAlert: (options: AlertOptions) => void
  showError: (message: string, title?: string) => void
  showInfo: (message: string, title?: string) => void
  showConfirm: (options: ConfirmOptions) => Promise<boolean>
  /** Convert unknown throw / IPC failure into a user-facing dialog. */
  showErrorFromUnknown: (err: unknown, fallback?: string, title?: string) => void
}

const AlertContext = createContext<AlertContextValue | null>(null)

export function useAlert(): AlertContextValue {
  const ctx = useContext(AlertContext)
  if (!ctx) {
    throw new Error("useAlert must be used within AlertProvider")
  }
  return ctx
}

/** Safe hook when provider might be optional in tests. */
export function useAlertOptional(): AlertContextValue | null {
  return useContext(AlertContext)
}

type QueueEntry = {
  title: string
  message: string
  kind: AlertKind
  confirmLabel?: string
  cancelLabel?: string
  /** Present for `showConfirm` entries; resolves the caller's promise. */
  resolve?: (confirmed: boolean) => void
}

const DEFAULT_TITLES: Record<AlertKind, string> = {
  error: "错误",
  info: "提示",
  success: "成功",
}

/** Normalize Tauri invoke / AuthError / string into a dialog message. */
export function formatUnknownError(err: unknown, fallback = "操作失败"): string {
  if (err instanceof AuthError) return err.message || fallback
  if (typeof err === "string" && err.trim()) return humanizeRawError(err)
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>
    if (typeof o.message === "string" && o.message.trim()) {
      return humanizeRawError(o.message)
    }
    if (typeof o.code === "string" && o.code.trim()) {
      return humanizeRawError(o.code)
    }
  }
  if (err instanceof Error && err.message.trim()) {
    return humanizeRawError(err.message)
  }
  return fallback
}

function humanizeRawError(raw: string): string {
  const s = raw.trim()
  if (!s) return "操作失败"
  // Common engine / IPC codes
  if (s === "not_authenticated") return "请先登录"
  if (s === "invalid_token") return "登录已过期，请重新登录"
  if (s === "no_active_subscription") return "暂无可用订阅，请先同步"
  if (s === "subscription_body_missing") return "订阅内容缺失，请重新同步"
  if (s === "no_nodes") return "暂无可用节点"
  if (s.startsWith("node_not_found:")) return "节点不存在或已失效，请重新选择"
  if (s.startsWith("set_system_proxy:")) return `设置系统代理失败：${s.slice("set_system_proxy:".length)}`
  if (s.startsWith("clear_system_proxy:")) return `清除系统代理失败：${s.slice("clear_system_proxy:".length)}`
  if (s.startsWith("sidecar failed:")) return `内核启动失败：${s.slice("sidecar failed:".length)}`
  if (s.startsWith("startup timeout:")) return "连接超时：代理端口未就绪"
  if (s.startsWith("decode:")) return `订阅解析失败：${s.slice("decode:".length)}`
  return s
}

/** Payload from Rust `app-alert` event (tray / shell). */
type AppAlertPayload = {
  kind?: AlertKind
  title?: string
  message: string
}

export function AlertProvider({ children }: { children: ReactNode }) {
  // FIFO queue: the currently shown dialog is always queue[0]. Queuing
  // (instead of replacing a single slot) ensures a fast second alert never
  // silently clobbers one the user hasn't read yet.
  const [queue, setQueue] = useState<QueueEntry[]>([])

  /** Resolve the currently shown entry (if it's a confirm) and advance to the next. */
  const advance = useCallback((confirmed: boolean) => {
    setQueue((q) => {
      const [current, ...rest] = q
      current?.resolve?.(confirmed)
      return rest
    })
  }, [])

  const close = useCallback(() => advance(false), [advance])

  const showAlert = useCallback((options: AlertOptions) => {
    const kind = options.kind ?? "error"
    const message = (options.message || "").trim()
    if (!message) return
    setQueue((q) => [
      ...q,
      {
        title: options.title?.trim() || DEFAULT_TITLES[kind],
        message,
        kind,
      },
    ])
  }, [])

  const showConfirm = useCallback((options: ConfirmOptions) => {
    const kind = options.kind ?? "info"
    const message = (options.message || "").trim()
    if (!message) return Promise.resolve(false)

    return new Promise<boolean>((resolve) => {
      setQueue((q) => [
        ...q,
        {
          title: options.title?.trim() || "请确认",
          message,
          kind,
          confirmLabel: options.confirmLabel?.trim() || "确认",
          cancelLabel: options.cancelLabel?.trim() || "取消",
          resolve,
        },
      ])
    })
  }, [])

  const showError = useCallback(
    (message: string, title = "错误") => {
      showAlert({ message, title, kind: "error" })
    },
    [showAlert],
  )

  const showInfo = useCallback(
    (message: string, title = "提示") => {
      showAlert({ message, title, kind: "info" })
    },
    [showAlert],
  )

  const showErrorFromUnknown = useCallback(
    (err: unknown, fallback = "操作失败", title = "错误") => {
      showError(formatUnknownError(err, fallback), title)
    },
    [showError],
  )

  // Rust tray / shell errors → same modal.
  useEffect(() => {
    let unlisten: (() => void) | undefined
    let cancelled = false
    void listen<AppAlertPayload>("app-alert", (event) => {
      if (cancelled) return
      const p = event.payload
      if (!p?.message) return
      showAlert({
        message: p.message,
        title: p.title,
        kind: p.kind ?? "error",
      })
    }).then((fn) => {
      unlisten = fn
    })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [showAlert])

  const value = useMemo(
    () => ({ showAlert, showError, showInfo, showConfirm, showErrorFromUnknown }),
    [showAlert, showError, showInfo, showConfirm, showErrorFromUnknown],
  )

  const current = queue[0]

  return (
    <AlertContext.Provider value={value}>
      {children}
      <AlertDialog
        open={current !== undefined}
        title={current?.title ?? DEFAULT_TITLES.error}
        message={current?.message ?? ""}
        kind={current?.kind ?? "error"}
        confirmLabel={current?.confirmLabel}
        cancelLabel={current?.cancelLabel}
        onClose={close}
        onConfirm={() => advance(true)}
      />
    </AlertContext.Provider>
  )
}

function AlertDialog({
  open,
  title,
  message,
  kind,
  confirmLabel,
  cancelLabel,
  onClose,
  onConfirm,
}: {
  open: boolean
  title: string
  message: string
  kind: AlertKind
  confirmLabel?: string
  cancelLabel?: string
  onClose: () => void
  onConfirm: () => void
}) {
  if (!open) return null

  const accent =
    kind === "error"
      ? "text-destructive"
      : kind === "success"
        ? "text-success"
        : "text-[var(--auth-accent)]"

  const btn =
    kind === "error"
      ? "bg-destructive text-white hover:opacity-95"
      : kind === "success"
        ? "bg-success text-white hover:opacity-95"
        : "bg-[var(--auth-accent)] text-white hover:opacity-95"

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-6 animate-fade-in"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        aria-label="关闭"
        onClick={onClose}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="app-alert-title"
        aria-describedby="app-alert-message"
        className={cn(
          "relative z-[1] w-full max-w-[300px] overflow-hidden rounded-[1.25rem]",
          "bg-white shadow-[0_16px_48px_rgba(15,23,42,0.18)]",
          "dark:bg-card dark:text-foreground",
        )}
      >
        <div className="px-5 pb-2 pt-5 text-center">
          <h2
            id="app-alert-title"
            className={cn("text-[16px] font-bold tracking-tight", accent)}
          >
            {title}
          </h2>
          <p
            id="app-alert-message"
            className="mt-2.5 max-h-[40vh] overflow-y-auto whitespace-pre-wrap break-words text-[13px] font-medium leading-relaxed text-[#4b5563] dark:text-muted-foreground"
          >
            {message}
          </p>
        </div>
        <div
          className={cn(
            "border-t border-[#eceef1] p-3 dark:border-border",
            confirmLabel && "grid grid-cols-2 gap-2",
          )}
        >
          {confirmLabel ? (
            <>
              <button
                type="button"
                autoFocus
                onClick={onClose}
                className="flex h-11 items-center justify-center rounded-full bg-[#f1f2f4] text-[14px] font-semibold text-[#4b5563] transition-opacity active:scale-[0.98] dark:bg-muted dark:text-foreground"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className={cn(
                  "flex h-11 items-center justify-center rounded-full text-[14px] font-semibold",
                  "transition-opacity active:scale-[0.98]",
                  btn,
                )}
              >
                {confirmLabel}
              </button>
            </>
          ) : (
            <button
              type="button"
              autoFocus
              onClick={onClose}
              className={cn(
                "flex h-11 w-full items-center justify-center rounded-full text-[14px] font-semibold",
                "transition-opacity active:scale-[0.98]",
                btn,
              )}
            >
              知道了
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
