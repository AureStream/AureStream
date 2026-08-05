import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

/** Full-width pill field used on mobile-style auth screens. */
export function AuthMobileField({
  icon,
  trailing,
  className,
  inputClassName,
  ...inputProps
}: React.ComponentProps<typeof Input> & {
  icon?: ReactNode
  trailing?: ReactNode
  inputClassName?: string
}) {
  return (
    <label
      className={cn(
        "flex h-14 w-full items-center gap-3 rounded-full border border-border/70 bg-card/80 px-5 shadow-sm backdrop-blur-sm",
        "transition-colors focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20",
        "dark:bg-card/60 dark:border-border",
        className,
      )}
    >
      {icon ? (
        <span className="shrink-0 text-muted-foreground [&_svg]:size-[18px]">{icon}</span>
      ) : null}
      <Input
        {...inputProps}
        className={cn(
          "h-auto flex-1 border-0 bg-transparent p-0 text-[16px] font-semibold shadow-none",
          "placeholder:text-muted-foreground/80 focus-visible:ring-0 focus-visible:ring-offset-0",
          "dark:bg-transparent",
          inputClassName,
        )}
      />
      {trailing}
    </label>
  )
}
