import { useState, type ReactNode } from "react"
import { useUpdate } from "../contexts/UpdateContext"

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
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
          <span className="text-sm text-text-muted">AureStream</span>
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
      <div className="flex items-center justify-center h-full w-full p-6">
        <div className="glass-card w-full max-w-[320px] rounded-[24px] p-6 flex flex-col items-center text-center shadow-glass">
          <div className="w-14 h-14 rounded-2xl bg-secondary/10 text-secondary flex items-center justify-center mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m18 15-6-6-6 6" />
            </svg>
          </div>

          <h2 className="text-lg font-extrabold text-text mb-1.5">{"必须更新"}</h2>
          <p className="text-xs text-text-muted mb-2 leading-relaxed">
            {"发现新版本，请更新至最新版本后继续使用。"}
          </p>
          <p className="text-xs font-mono text-text mb-4">
            {currentVersion || "..."} <span className="text-text-muted">→</span> {newVersion || "..."}
          </p>

          {error && <p className="text-[11px] text-danger mb-3 break-all">{error}</p>}

          <button
            onClick={handleUpdate}
            disabled={installing}
            className="w-full py-3 rounded-2xl bg-secondary hover:bg-secondary/90 active:scale-[0.98] text-white text-sm font-extrabold shadow-md transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {installing ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                {"更新中..."}
              </>
            ) : error ? (
              "重试"
            ) : (
              "立即更新"
            )}
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
