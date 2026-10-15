import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { getVersion } from "@tauri-apps/api/app"
import { isTauri } from "@tauri-apps/api/core"
import { Download, Loader2, RefreshCw, ShieldCheck, X } from "lucide-react"
import { relaunch } from "@tauri-apps/plugin-process"
import { check } from "@tauri-apps/plugin-updater"
import {
  allowUpdateCheckFailure,
  UPDATE_ENDPOINT_TIMEOUT_MS,
  withUpdateCheckDeadline,
} from "@/lib/update-check"
import { formatAppVersionLabel } from "@/lib/app-version"

export type AvailableUpdate = NonNullable<Awaited<ReturnType<typeof check>>>

export type UpdateContextValue = {
  currentVersion: string
  availableUpdate: AvailableUpdate | null
  isChecking: boolean
  isInstalling: boolean
  installProgress: number | null
  installError: string | null
  checkForUpdate: (options?: { interactive?: boolean }) => Promise<AvailableUpdate | null>
  openUpdateModal: () => void
  closeUpdateModal: () => void
  installUpdate: () => Promise<void>
}

const UpdateContext = createContext<UpdateContextValue | null>(null)

export function useUpdate(): UpdateContextValue {
  const ctx = useContext(UpdateContext)
  if (!ctx) {
    throw new Error("useUpdate must be used within ForceUpdateGate")
  }
  return ctx
}

export function useUpdateOptional(): UpdateContextValue | null {
  return useContext(UpdateContext)
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === "string" && error.trim()) return error
  return "更新失败，请检查网络后重试"
}

export default function ForceUpdateGate({ children }: { children: ReactNode }) {
  const [currentVersion, setCurrentVersion] = useState(() =>
    !isTauri() ? "v1.0.2" : "",
  )
  const [update, setUpdate] = useState<AvailableUpdate | null>(() => {
    if (!isTauri()) {
      return {
        version: "1.0.3",
        body: "• 增加开机自启动配置支持\n• 优化启动更新机制与国内网络容灾\n• 修复 DNS 分流兼容性问题",
        date: "2026-09-21T02:19:19Z",
        downloadAndInstall: async (onEvent: (event: any) => void) => {
          onEvent({ event: "Started", data: { contentLength: 20_000_000 } })
          for (let i = 1; i <= 10; i++) {
            await new Promise((r) => setTimeout(r, 180))
            onEvent({ event: "Progress", data: { chunkLength: 2_000_000 } })
          }
        },
      } as unknown as AvailableUpdate
    }
    return null
  })
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isChecking, setIsChecking] = useState(false)
  const [isInstalling, setIsInstalling] = useState(false)
  const [installError, setInstallError] = useState<string | null>(null)
  const [downloaded, setDownloaded] = useState(0)
  const [contentLength, setContentLength] = useState<number | null>(null)

  const checkForUpdate = useCallback(
    async (options?: { interactive?: boolean }) => {
      if (!isTauri()) return null
      setIsChecking(true)
      setInstallError(null)
      try {
        const timeoutMs = options?.interactive ? 10_000 : UPDATE_ENDPOINT_TIMEOUT_MS
        const checkPromise = check({ timeout: timeoutMs })
        const available = options?.interactive
          ? await checkPromise
          : await allowUpdateCheckFailure(
              withUpdateCheckDeadline(checkPromise),
              (err) => console.error("update check failed", err),
            )

        if (available) {
          setUpdate(available)
          if (options?.interactive) {
            setIsModalOpen(true)
          }
        }
        return available
      } catch (err) {
        if (options?.interactive) {
          throw err
        }
        return null
      } finally {
        setIsChecking(false)
      }
    },
    [],
  )

  const openUpdateModal = useCallback(() => {
    setIsModalOpen(true)
  }, [])

  const closeUpdateModal = useCallback(() => {
    if (!isInstalling) {
      setIsModalOpen(false)
    }
  }, [isInstalling])

  const installUpdate = useCallback(async () => {
    if (!update || isInstalling) return

    setInstallError(null)
    setDownloaded(0)
    setContentLength(null)
    setIsInstalling(true)
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          setContentLength(event.data.contentLength ?? null)
        } else if (event.event === "Progress") {
          setDownloaded((value) => value + event.data.chunkLength)
        }
      })
      await relaunch()
    } catch (installErr) {
      console.error("update install failed", installErr)
      setInstallError(errorMessage(installErr))
      setIsInstalling(false)
    }
  }, [update, isInstalling])

  useEffect(() => {
    let cancelled = false

    void getVersion().then(
      (version) => {
        if (!cancelled) setCurrentVersion(formatAppVersionLabel(version))
      },
      () => {},
    )

    // Background silent check on startup without blocking user
    if (isTauri()) {
      void checkForUpdate({ interactive: false })
    }

    return () => {
      cancelled = true
    }
  }, [checkForUpdate])

  const progress =
    contentLength && contentLength > 0
      ? Math.min(100, Math.round((downloaded / contentLength) * 100))
      : null

  const contextValue = useMemo<UpdateContextValue>(
    () => ({
      currentVersion,
      availableUpdate: update,
      isChecking,
      isInstalling,
      installProgress: progress,
      installError,
      checkForUpdate,
      openUpdateModal,
      closeUpdateModal,
      installUpdate,
    }),
    [
      currentVersion,
      update,
      isChecking,
      isInstalling,
      progress,
      installError,
      checkForUpdate,
      openUpdateModal,
      closeUpdateModal,
      installUpdate,
    ],
  )

  return (
    <UpdateContext.Provider value={contextValue}>
      {children}

      {/* Update Modal Dialog */}
      {isModalOpen && update ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative flex w-full max-w-[320px] flex-col rounded-2xl border border-border bg-white p-6 shadow-2xl dark:bg-card">
            {!isInstalling && (
              <button
                type="button"
                onClick={closeUpdateModal}
                className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="关闭"
              >
                <X className="size-4" />
              </button>
            )}

            <div className="flex size-11 items-center justify-center rounded-xl bg-[#e9f8f0] text-[#118456] dark:bg-[#12382b] dark:text-[#5dd39e]">
              <ShieldCheck className="size-5" strokeWidth={2} aria-hidden />
            </div>

            <h2 className="mt-4 text-lg font-bold text-foreground">发现新版本</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              检测到 AureStream 有新版本可用。建议更新以获得最新的功能与节点支持。
            </p>

            <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border border-border/80 bg-muted/30 py-3 text-center">
              <div>
                <p className="text-[11px] text-muted-foreground">当前版本</p>
                <p className="mt-0.5 font-mono text-xs font-semibold text-foreground">
                  {currentVersion || "..."}
                </p>
              </div>
              <RefreshCw className="size-3.5 text-muted-foreground/60" aria-hidden />
              <div>
                <p className="text-[11px] text-muted-foreground">最新版本</p>
                <p className="mt-0.5 font-mono text-xs font-semibold text-[#118456] dark:text-[#5dd39e]">
                  v{update.version}
                </p>
              </div>
            </div>

            {update.body ? (
              <div className="mt-3 max-h-24 overflow-y-auto rounded-lg bg-muted/40 p-2.5 text-left font-mono text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap">
                {update.body}
              </div>
            ) : null}

            {isInstalling ? (
              <div className="mt-4" aria-live="polite">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>正在下载并安装</span>
                  <span>{progress === null ? "请稍候…" : `${progress}%`}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-[#118456] transition-[width] duration-200"
                    style={{ width: progress === null ? "20%" : `${progress}%` }}
                  />
                </div>
              </div>
            ) : null}

            {installError ? (
              <p className="mt-3 break-words text-xs text-destructive" role="alert">
                {installError}
              </p>
            ) : null}

            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void installUpdate()}
                disabled={isInstalling}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[var(--auth-accent)] px-4 text-xs font-semibold text-white transition-opacity disabled:cursor-wait disabled:opacity-70"
              >
                {isInstalling ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Download className="size-4" aria-hidden />
                )}
                {isInstalling ? "正在更新…" : installError ? "重试更新" : "立即更新"}
              </button>

              {!isInstalling && (
                <button
                  type="button"
                  onClick={closeUpdateModal}
                  className="flex h-8 w-full items-center justify-center text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  稍后再说
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </UpdateContext.Provider>
  )
}
