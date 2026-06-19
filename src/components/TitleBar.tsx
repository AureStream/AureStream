import { useState } from "react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { type as osType } from "@tauri-apps/plugin-os"

/* ── Windows / Linux control icons ── */
const Min = () => (
  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
    <line x1="2.5" y1="6" x2="9.5" y2="6" />
  </svg>
)
const Close = () => (
  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
    <line x1="3" y1="3" x2="9" y2="9" />
    <line x1="9" y1="3" x2="3" y2="9" />
  </svg>
)

export default function TitleBar() {
  const [isMac] = useState(() => {
    try {
      return osType() === "macos"
    } catch {
      return false
    }
  })
  const appWindow = getCurrentWindow()

  const title = (
    <span className="text-[11px] font-extrabold tracking-wide text-text-secondary">AureStream</span>
  )

  // macOS traffic lights: red close · yellow minimize.
  const lightBtn =
    "w-[13px] h-[13px] rounded-full border border-black/10 flex items-center justify-center text-black/60 cursor-pointer"
  const glyph = "w-2 h-2 opacity-0 group-hover:opacity-100 transition-opacity"
  const trafficLights = (
    <div className="group flex items-center gap-1.5 pl-1 shrink-0">
      <button onClick={() => appWindow.close()} title="Close" className={`${lightBtn} bg-[#FF5F57]`}>
        <svg className={glyph} viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
          <line x1="2" y1="2" x2="6" y2="6" />
          <line x1="6" y1="2" x2="2" y2="6" />
        </svg>
      </button>
      <button onClick={() => appWindow.minimize()} title="Minimize" className={`${lightBtn} bg-[#FEBC2E]`}>
        <svg className={glyph} viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
          <line x1="1.6" y1="4" x2="6.4" y2="4" />
        </svg>
      </button>
    </div>
  )

  // Windows / Linux icon controls.
  const btn =
    "w-9 h-9 flex items-center justify-center rounded-lg text-text-muted hover:text-text hover:bg-surface-active/70 transition-colors cursor-pointer"
  const winControls = (
    <div className="flex items-center gap-1 shrink-0">
      <button className={btn} title="Minimize" onClick={() => appWindow.minimize()}>
        <Min />
      </button>
      <button
        className="w-9 h-9 flex items-center justify-center rounded-lg text-text-muted hover:text-white hover:bg-danger transition-colors cursor-pointer"
        title="Close"
        onClick={() => appWindow.close()}
      >
        <Close />
      </button>
    </div>
  )

  return (
    <div
      data-tauri-drag-region
      className="h-9 shrink-0 flex items-center gap-2 select-none px-3 bg-bg/60 backdrop-blur-xl border-b border-border-glass/40 z-50"
    >
      {isMac ? (
        <>
          {trafficLights}
          <div data-tauri-drag-region className="flex-1 flex justify-center pointer-events-none">
            {title}
          </div>
          {/* balance the centered title against the left traffic lights */}
          <div className="w-[64px] shrink-0" />
        </>
      ) : (
        <>
          <div data-tauri-drag-region className="flex-1 flex items-center pointer-events-none">
            {title}
          </div>
          {winControls}
        </>
      )}
    </div>
  )
}
