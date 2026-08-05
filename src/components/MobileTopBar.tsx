import { ChevronLeft } from "lucide-react"
import { type CSSProperties, type ReactNode } from "react"
import { cn } from "@/lib/utils"

interface MobileTopBarProps {
  onBack?: () => void
  title?: string
  left?: ReactNode
  right?: ReactNode
}

/** Shared top-bar icon button style. */
export const topBarIconBtnClass = cn(
  "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl",
  "text-[#8b93a0] transition-colors hover:bg-[#f1f2f4] hover:text-[#1a1d21]",
  "dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground",
)

const noDragStyle = { WebkitAppRegion: "no-drag" } as CSSProperties

/**
 * Reusable mobile top status bar.
 * - Home: pass `right` (Profile), no back/title.
 * - Secondary: pass `onBack` (+ centered `title` + optional `right`).
 */
export default function MobileTopBar({ onBack, title, left, right }: MobileTopBarProps) {
  return (
    <div className="sticky top-0 z-20 flex h-12 shrink-0 items-center bg-transparent px-2">
      <div
        className="relative z-30 flex min-w-0 flex-1 items-center justify-start gap-1"
        style={noDragStyle}
      >
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className={topBarIconBtnClass}
            aria-label="返回"
          >
            <ChevronLeft className="size-5" />
          </button>
        ) : (
          left
        )}
      </div>

      {title ? (
        <div className="pointer-events-none absolute left-1/2 max-w-[55%] -translate-x-1/2 truncate text-[15px] font-semibold tracking-tight text-[#1a1d21] dark:text-foreground">
          {title}
        </div>
      ) : null}

      <div
        className="relative z-30 flex flex-1 items-center justify-end gap-1"
        style={noDragStyle}
      >
        {right}
      </div>
    </div>
  )
}
