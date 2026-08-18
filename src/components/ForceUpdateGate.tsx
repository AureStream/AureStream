import { useEffect, useState, type ReactNode } from "react"
import { getVersion } from "@tauri-apps/api/app"
import { isTauri } from "@tauri-apps/api/core"
import { Download, Loader2, RefreshCw, ShieldCheck } from "lucide-react"
import { relaunch } from "@tauri-apps/plugin-process"
import { check } from "@tauri-apps/plugin-updater"
import StartupLoadingScreen from "@/components/StartupLoadingScreen"
import {
  allowUpdateCheckFailure,
  UPDATE_ENDPOINT_TIMEOUT_MS,
  withUpdateCheckDeadline,
} from "@/lib/update-check"

type AvailableUpdate = NonNullable<Awaited<ReturnType<typeof check>>>
type GatePhase = "checking" | "ready" | "required" | "installing"

let startupCheck: Promise<AvailableUpdate | null> | null = null

function checkAtStartup() {
  startupCheck ??= allowUpdateCheckFailure(
    withUpdateCheckDeadline(check({ timeout: UPDATE_ENDPOINT_TIMEOUT_MS })),
    (error) => console.error("startup update check failed", error),
  )
  return startupCheck
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === "string" && error.trim()) return error
  return "更新失败，请检查网络后重试"
}

/** Blocks product providers while checking and when an update is confirmed. */
export default function ForceUpdateGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<GatePhase>(() =>
    isTauri() ? "checking" : "ready",
  )
  const [currentVersion, setCurrentVersion] = useState("")
  const [update, setUpdate] = useState<AvailableUpdate | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [downloaded, setDownloaded] = useState(0)
  const [contentLength, setContentLength] = useState<number | null>(null)

  useEffect(() => {
    if (!isTauri()) return

    let cancelled = false
    void getVersion().then(
      (version) => {
        if (!cancelled) setCurrentVersion(version)
      },
      () => {},
    )
    void checkAtStartup().then((available) => {
      if (cancelled) return
      setError(null)
      if (available) {
        setUpdate(available)
        setPhase("required")
      } else {
        setPhase("ready")
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  const installUpdate = async () => {
    if (!update || phase === "installing") return

    setError(null)
    setDownloaded(0)
    setContentLength(null)
    setPhase("installing")
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          setContentLength(event.data.contentLength ?? null)
        } else if (event.event === "Progress") {
          setDownloaded((value) => value + event.data.chunkLength)
        }
      })
      await relaunch()
    } catch (installError) {
      console.error("required update install failed", installError)
      setError(errorMessage(installError))
      setPhase("required")
    }
  }

  if (phase === "ready") return <>{children}</>

  if (phase === "checking") {
    return <StartupLoadingScreen message="正在检查版本更新…" />
  }

  const progress =
    contentLength && contentLength > 0
      ? Math.min(100, Math.round((downloaded / contentLength) * 100))
      : null

  return (
    <main className="flex h-full min-h-0 w-full flex-col bg-white px-7 pb-8 pt-20 dark:bg-background">
      <div className="mx-auto flex w-full max-w-[300px] flex-1 flex-col">
        <div className="flex size-12 items-center justify-center rounded-lg bg-[#e9f8f0] text-[#118456] dark:bg-[#12382b] dark:text-[#5dd39e]">
          <ShieldCheck className="size-6" strokeWidth={1.8} aria-hidden />
        </div>

        <h1 className="mt-7 text-[22px] font-bold text-foreground">需要更新 AureStream</h1>
        <p className="mt-2 text-sm leading-6 text-[#6b7280] dark:text-muted-foreground">
          已发布新版本。完成更新并重新启动后才能继续使用。
        </p>

        <div className="mt-7 grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-y border-border py-4 text-center">
          <div>
            <p className="text-[11px] text-muted-foreground">当前版本</p>
            <p className="mt-1 font-mono text-sm font-semibold text-foreground">
              {currentVersion || "..."}
            </p>
          </div>
          <RefreshCw className="size-4 text-muted-foreground" aria-hidden />
          <div>
            <p className="text-[11px] text-muted-foreground">最新版本</p>
            <p className="mt-1 font-mono text-sm font-semibold text-[#118456] dark:text-[#5dd39e]">
              {update?.version ?? "..."}
            </p>
          </div>
        </div>

        {phase === "installing" ? (
          <div className="mt-7" aria-live="polite">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>正在下载并安装</span>
              <span>{progress === null ? "请稍候" : `${progress}%`}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-[#118456] transition-[width] duration-200"
                style={{ width: progress === null ? "18%" : `${progress}%` }}
              />
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="mt-5 break-words text-xs leading-5 text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void installUpdate()}
          disabled={phase === "installing"}
          className="mt-auto flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[var(--auth-accent)] px-4 text-sm font-semibold text-white transition-opacity disabled:cursor-wait disabled:opacity-70"
        >
          {phase === "installing" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Download className="size-4" aria-hidden />
          )}
          {phase === "installing" ? "正在更新" : error ? "重试更新" : "立即更新"}
        </button>
      </div>
    </main>
  )
}
