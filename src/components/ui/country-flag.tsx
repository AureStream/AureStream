import * as Flags from "country-flag-icons/react/1x1"
import { hasFlag } from "country-flag-icons"

import { UnknownFlag } from "@/components/ui/unknown-flag"
import { cn } from "@/lib/utils"

type CountryFlagProps = {
  code: string
  className?: string
  title?: string
}

const UNKNOWN_CODES = new Set(["", "UN", "XX", "ZZ"])

function isUnknownCode(code: string): boolean {
  const normalized = code.trim().toUpperCase()
  return UNKNOWN_CODES.has(normalized) || !hasFlag(normalized)
}

export function CountryFlag({ code, className, title }: CountryFlagProps) {
  const normalized = code.trim().toUpperCase()
  const label = title ?? (normalized || "unknown")

  if (isUnknownCode(code)) {
    return (
      <UnknownFlag
        className={cn("h-full w-full", className)}
        aria-label={label}
      />
    )
  }

  const Flag = Flags[normalized as keyof typeof Flags]
  if (!Flag) {
    return (
      <UnknownFlag
        className={cn("h-full w-full", className)}
        aria-label={label}
      />
    )
  }

  return (
    <Flag
      className={cn("h-full w-full", className)}
      title={label}
      aria-label={label}
    />
  )
}
