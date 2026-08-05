import type { InputHTMLAttributes, ReactNode } from "react"
import { cn } from "@/lib/utils"

/** Light gray pill field (login reference style). */
export function AuthMobileField({
  icon,
  trailing,
  className,
  inputClassName,
  ...inputProps
}: InputHTMLAttributes<HTMLInputElement> & {
  icon?: ReactNode
  trailing?: ReactNode
  inputClassName?: string
}) {
  return (
    <label
      className={cn(
        "flex h-11 w-full items-center gap-2.5 rounded-full bg-[#f1f2f4] px-4",
        "transition-shadow focus-within:ring-2 focus-within:ring-[var(--auth-accent)]/25",
        "dark:bg-muted",
        className,
      )}
    >
      {icon ? (
        <span className="shrink-0 text-[#9aa0a6] [&_svg]:size-4">{icon}</span>
      ) : null}
      <input
        {...inputProps}
        className={cn(
          "h-auto min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] font-medium text-[#1a1d21] shadow-none outline-none",
          "placeholder:font-normal placeholder:text-[#a0a5ab]",
          "dark:bg-transparent dark:text-foreground",
          inputClassName,
        )}
      />
      {trailing}
    </label>
  )
}
