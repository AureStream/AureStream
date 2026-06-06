import { useTranslation } from "react-i18next"

import { CircularLoader } from "@/components/layout/CircularLoader"
import { cn } from "@/lib/utils"

type LoadingScreenProps = {
  variant?: "inline" | "panel" | "boot"
  message?: string
  className?: string
}

export function LoadingScreen({
  variant = "inline",
  message,
  className,
}: LoadingScreenProps) {
  const { t } = useTranslation()
  const text = message ?? (variant === "boot" ? t("app_booting") : t("loading"))
  const loaderSize = variant === "boot" ? 160 : variant === "panel" ? 104 : 84

  if (variant === "boot") {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-5",
          className
        )}
      >
        <CircularLoader size={loaderSize} withLogo />
        <div className="flex flex-col items-center gap-1.5 text-center">
          <p className="text-lg font-semibold tracking-tight text-foreground">
            AureStream
          </p>
          <p className="text-sm text-muted-foreground">{text}</p>
        </div>
      </div>
    )
  }

  if (variant === "panel") {
    return (
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col items-center justify-center gap-4 rounded-[20px] border border-border/70 bg-card/80 p-8 shadow-sm backdrop-blur-sm",
          className
        )}
      >
        <CircularLoader size={loaderSize} />
        <p className="text-sm font-medium text-muted-foreground">{text}</p>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col items-center justify-center gap-3",
        className
      )}
    >
      <CircularLoader size={loaderSize} />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  )
}
