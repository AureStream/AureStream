import { type CSSProperties, type ReactNode } from "react"

interface MobileTopBarProps {
  onBack?: () => void
  title?: string
  left?: ReactNode
  right?: ReactNode
}

/** Shared top-bar icon button style (matches Home → Profile). */
export const topBarIconBtnClass =
  "w-9 h-9 flex items-center justify-center rounded-xl text-text-secondary hover:text-text hover:bg-surface-active/60 transition-colors cursor-pointer shrink-0"

const noDragStyle = { WebkitAppRegion: "no-drag" } as CSSProperties

/**
 * Reusable mobile top status bar. Sits below the global OS TitleBar.
 * - Home page: pass `left` (About) + `right` (Profile), no back/title.
 * - Secondary pages: pass `onBack` (+ centered `title` + optional `right` actions).
 */
export default function MobileTopBar({ onBack, title, left, right }: MobileTopBarProps) {
  return (
    <div className="sticky top-0 z-20 flex items-center h-12 px-2 bg-transparent shrink-0">
      <div className="relative z-30 flex items-center gap-1 min-w-0 flex-1 justify-start" style={noDragStyle}>
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className={topBarIconBtnClass}
            aria-label="Back"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        ) : (
          left
        )}
      </div>

      {title && (
        <div className="absolute left-1/2 -translate-x-1/2 text-sm font-extrabold text-text truncate max-w-[55%] pointer-events-none">
          {title}
        </div>
      )}

      <div className="relative z-30 flex items-center gap-1 flex-1 justify-end" style={noDragStyle}>
        {right}
      </div>
    </div>
  )
}
