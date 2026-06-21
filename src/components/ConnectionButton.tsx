import { useState } from "react"
import { useTranslation } from "react-i18next"

interface ConnectionButtonProps {
  onToggle?: (connected: boolean) => void
  compact?: boolean
}

export default function ConnectionButton({ onToggle, compact }: ConnectionButtonProps) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected")
  const [timer, setTimer] = useState("00:00:00")
  const [intervalId, setIntervalId] = useState<ReturnType<typeof setInterval> | null>(null)

  const handleClick = () => {
    if (status === "disconnected") {
      setStatus("connecting")
      setTimeout(() => {
        setStatus("connected")
        onToggle?.(true)
        let seconds = 0
        const id = setInterval(() => {
          seconds++
          const h = String(Math.floor(seconds / 3600)).padStart(2, "0")
          const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")
          const s = String(seconds % 60).padStart(2, "0")
          setTimer(`${h}:${m}:${s}`)
        }, 1000)
        setIntervalId(id)
      }, 1500)
    } else if (status === "connected") {
      setStatus("disconnected")
      onToggle?.(false)
      if (intervalId) {
        clearInterval(intervalId)
        setIntervalId(null)
      }
      setTimer("00:00:00")
    }
  }

  const actionLabel =
    status === "connected"
      ? t("tap_to_disconnect")
      : status === "connecting"
      ? t("status_connecting")
      : t("tap_to_connect")

  const size = compact ? 48 : 120
  const iconSize = compact ? 20 : 40

  return (
    <div className={compact ? "" : "connection-btn-wrapper"}>
      <button
        className={`connection-btn ${status}`}
        onClick={handleClick}
        disabled={status === "connecting"}
        aria-label={actionLabel}
        style={compact ? { width: size, height: size } : undefined}
      >
        {status === "connecting" && <span className="pulse-ring" />}
        {status === "connected" && (
          <>
            <span className="pulse-ring" />
            <span className="pulse-ring" style={{ animationDelay: "0.5s" }} />
          </>
        )}
        <svg
          className={compact ? "" : "btn-inner-icon"}
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {status === "connected" ? (
            <>
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </>
          ) : (
            <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
          )}
        </svg>
      </button>

      {!compact && (
        <>
          <div className="connection-status-row">
            <span
              className={`status-dot ${
                status === "connected"
                  ? "status-dot-success"
                  : status === "connecting"
                  ? "status-dot-warning"
                  : "status-dot-danger"
              }`}
            />
            <span>
              {status === "connected"
                ? t("status_connected")
                : status === "connecting"
                ? t("status_connecting")
                : t("status_disconnected")}
            </span>
          </div>
          <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{actionLabel}</span>
          {status === "connected" && (
            <div className="connection-timer animate-fade-in">{timer}</div>
          )}
        </>
      )}
    </div>
  )
}
