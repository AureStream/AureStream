import { useState, type ReactNode } from "react"
import { ArrowUp, Loader2 } from "lucide-react"
import { useUpdate } from "../contexts/UpdateContext"
import { Button } from "@/components/ui/button"

/**
 * Blocks the entire app on launch when an update is available.
 * - While the first check is pending: splash (no child flash).
 * - If an update exists: full-screen no-skip modal forcing download+install+relaunch.
 * - If the check fails (network) or no update: renders children.
 */
export default function ForceUpdateGate({ children }: { children: ReactNode }) {
  const { updateAvailable, newVersion, currentVersion, checking, performForceUpdate } = useUpdate()
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (checking && !updateAvailable) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="size-10 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">AureStream</span>
        </div>
      </div>
    )
  }

  if (updateAvailable) {
    const handleUpdate = async () => {
      setError(null)
      setInstalling(true)
      try {
        await performForceUpdate()
      } catch (err) {
        setError(String(err))
        setInstalling(false)
      }
    }

    return (
      <div className="flex h-full w-full items-center justify-center bg-background p-6">
        <div className="flex w-full max-w-[320px] flex-col items-center rounded-3xl border border-border bg-card p-6 text-center shadow-sm">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ArrowUp className="size-7" strokeWidth={2.2} />
          </div>

          <h2 className="mb-1.5 text-lg font-extrabold text-foreground">必须更新</h2>
          <p className="mb-2 text-xs leading-relaxed text-muted-foreground">
            发现新版本，请更新至最新版本后继续使用。
          </p>
          <p className="mb-4 font-mono text-xs text-foreground">
            {currentVersion || "..."} <span className="text-muted-foreground">→</span>{" "}
            {newVersion || "..."}
          </p>

          {error ? (
            <p className="mb-3 break-all text-[11px] text-destructive">{error}</p>
          ) : null}

          <Button
            type="button"
            className="h-12 w-full rounded-2xl text-sm font-extrabold"
            disabled={installing}
            onClick={() => void handleUpdate()}
          >
            {installing ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                更新中...
              </>
            ) : error ? (
              "重试"
            ) : (
              "立即更新"
            )}
          </Button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
