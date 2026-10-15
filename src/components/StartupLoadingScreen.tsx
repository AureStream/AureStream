import { Loader2 } from "lucide-react"
import { APP_VERSION } from "@/lib/app-version"

type StartupLoadingScreenProps = {
  message: string
}

export default function StartupLoadingScreen({
  message,
}: StartupLoadingScreenProps) {
  return (
    <div
      className="flex h-full min-h-0 w-full flex-1 flex-col items-center justify-between bg-white px-8 py-12 dark:bg-background animate-fade-in"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="h-4" />

      <div className="flex flex-col items-center text-center">
        <div className="relative size-20 overflow-hidden rounded-2xl shadow-[0_8px_24px_rgba(15,23,42,0.08)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
          <img src="/logo.png" alt="AureStream" className="h-full w-full object-cover" />
        </div>
        <h1 className="mt-5 text-xl font-bold tracking-tight text-foreground">
          AureStream
        </h1>
        <div className="mt-6 flex items-center gap-2">
          <Loader2
            className="size-4 animate-spin text-[var(--auth-accent)]"
            strokeWidth={2}
            aria-hidden
          />
          <p className="text-xs font-medium text-[#6b7280] dark:text-muted-foreground">
            {message}
          </p>
        </div>
      </div>

      <div className="text-center">
        <p className="text-[11px] font-mono text-muted-foreground/60">
          {APP_VERSION}
        </p>
      </div>
    </div>
  )
}

