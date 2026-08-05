import { cn } from "@/lib/utils"

type SwitchProps = {
  checked: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  size?: "default" | "sm"
  className?: string
  "aria-label"?: string
}

/** Lightweight switch (no Radix) for home preference toggles. */
export function Switch({
  checked,
  onCheckedChange,
  disabled,
  size = "default",
  className,
  "aria-label": ariaLabel,
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => {
        if (disabled) return
        onCheckedChange?.(!checked)
      }}
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--auth-accent)]/35",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-[var(--auth-accent)]" : "bg-[#d5d9de]",
        size === "sm" ? "h-4 w-7" : "h-5 w-9",
        className,
      )}
    >
      <span
        className={cn(
          "pointer-events-none block rounded-full bg-white shadow-sm transition-transform",
          size === "sm" ? "h-3 w-3" : "h-4 w-4",
          checked
            ? size === "sm"
              ? "translate-x-3"
              : "translate-x-4"
            : "translate-x-0",
        )}
      />
    </button>
  )
}
