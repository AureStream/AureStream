import { Loader2 } from "lucide-react"

type StartupLoadingScreenProps = {
  message: string
}

export default function StartupLoadingScreen({
  message,
}: StartupLoadingScreenProps) {
  return (
    <div
      className="flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center bg-white px-8 dark:bg-background"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2
        className="size-6 animate-spin text-[var(--auth-accent)]"
        strokeWidth={1.75}
        aria-hidden
      />
      <p className="mt-3 text-sm font-medium text-[#6b7280] dark:text-muted-foreground">
        {message}
      </p>
    </div>
  )
}
