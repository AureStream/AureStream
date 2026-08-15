import type { ReactNode } from "react"
import { flagEmojiForNodeName } from "@/lib/node-flag"
import { HkFlagIcon, MoFlagIcon, TwFlagIcon } from "@/components/icons/RegionFlags"

/**
 * Windows' Segoe UI Emoji doesn't ship glyphs for these regional flags —
 * they render as bare letters instead of a flag. Swap in bundled SVGs.
 */
const SVG_FLAGS: Record<string, (className?: string) => ReactNode> = {
  "🇭🇰": (className) => <HkFlagIcon className={className} />,
  "🇹🇼": (className) => <TwFlagIcon className={className} />,
  "🇲🇴": (className) => <MoFlagIcon className={className} />,
}

type NodeFlagProps = {
  name: string | null | undefined
  /** Applied to the wrapping span — same sizing/positioning classes used for the old emoji text. */
  className?: string
}

/** Renders a node's inferred region flag, drop-in replacement for `{flagEmojiForNodeName(name)}`. */
export default function NodeFlag({ name, className }: NodeFlagProps) {
  const emoji = flagEmojiForNodeName(name)
  const svg = SVG_FLAGS[emoji]
  return (
    <span className={className} aria-hidden>
      {svg ? svg("h-[65%] w-[65%] rounded-[3px] overflow-hidden") : emoji}
    </span>
  )
}
