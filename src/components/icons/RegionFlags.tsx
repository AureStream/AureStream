/**
 * Inline SVG flags for regions whose Unicode flag emoji (🇭🇰 🇹🇼 🇲🇴) render as
 * plain two-letter text on Windows — Segoe UI Emoji omits these glyphs.
 * Used as a drop-in replacement wherever those emoji would otherwise appear.
 */

type FlagIconProps = {
  className?: string
}

const PETAL_ANGLES = [0, 72, 144, 216, 288]

/** Hong Kong: red field, stylised white five-petal bauhinia flower. */
export function HkFlagIcon({ className }: FlagIconProps) {
  return (
    <svg viewBox="0 0 30 20" className={className} aria-hidden>
      <rect width="30" height="20" fill="#DE2910" />
      <g transform="translate(15,10)">
        {PETAL_ANGLES.map((angle) => (
          <path
            key={angle}
            d="M0,-1 C-2.3,-3.6 -2.3,-6.6 0,-7.6 C2.3,-6.6 2.3,-3.6 0,-1 Z"
            fill="#FFFFFF"
            transform={`rotate(${angle})`}
          />
        ))}
      </g>
    </svg>
  )
}

/** Taiwan: red field, blue canton with a white 12-ray sun. */
export function TwFlagIcon({ className }: FlagIconProps) {
  const rays = Array.from({ length: 12 }, (_, i) => i * 30)
  return (
    <svg viewBox="0 0 30 20" className={className} aria-hidden>
      <rect width="30" height="20" fill="#FE0000" />
      <rect width="15" height="10" fill="#000095" />
      <g transform="translate(7.5,5)">
        {rays.map((angle) => (
          <path key={angle} d="M0,-3.6 L0.7,-1.6 L-0.7,-1.6 Z" fill="#FFFFFF" transform={`rotate(${angle})`} />
        ))}
        <circle r="1.6" fill="#000095" stroke="#FFFFFF" strokeWidth="0.5" />
      </g>
    </svg>
  )
}

const LOTUS_PETAL_ANGLES = [-40, 0, 40]

/** Macau: green field, white three-petal lotus, gold star arc above. */
export function MoFlagIcon({ className }: FlagIconProps) {
  return (
    <svg viewBox="0 0 30 20" className={className} aria-hidden>
      <rect width="30" height="20" fill="#00785E" />
      <g transform="translate(15,13.5)">
        {LOTUS_PETAL_ANGLES.map((angle) => (
          <path
            key={angle}
            d="M0,-0.5 C-1.5,-2.6 -1.5,-5 0,-6.4 C1.5,-5 1.5,-2.6 0,-0.5 Z"
            fill="#FFFFFF"
            transform={`rotate(${angle})`}
          />
        ))}
        <ellipse cx="0" cy="0" rx="2.6" ry="0.9" fill="#FFFFFF" />
      </g>
      <g fill="#FFC72C">
        <circle cx="15" cy="4.6" r="0.85" />
        <circle cx="11.9" cy="5.7" r="0.65" />
        <circle cx="18.1" cy="5.7" r="0.65" />
        <circle cx="10" cy="7.9" r="0.5" />
        <circle cx="20" cy="7.9" r="0.5" />
      </g>
    </svg>
  )
}
