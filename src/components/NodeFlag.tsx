import { flagAssetForRegionCode } from "@/components/icons/RegionFlagAssets"
import { regionCodeForNodeName } from "@/lib/node-flag"

type NodeFlagProps = {
  name: string | null | undefined
  /** Applied to the fixed-size wrapping span used by node rows and the home card. */
  className?: string
}

/** Renders a bundled SVG flag that is independent of platform emoji fonts. */
export default function NodeFlag({ name, className }: NodeFlagProps) {
  const code = regionCodeForNodeName(name)

  return (
    <span className={className} aria-hidden>
      <img
        src={flagAssetForRegionCode(code)}
        alt=""
        className="h-5 w-[1.6875rem] rounded-[3px] object-cover shadow-[0_1px_2px_rgba(15,23,42,0.16)]"
        draggable={false}
      />
    </span>
  )
}
