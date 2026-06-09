import type { SVGProps } from "react"

/** 1x1 flat fallback flag — white field + primary-blue globe (country-flag-icons canvas). */
export function UnknownFlag({
  "aria-label": ariaLabel,
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="75.24 0 342 342"
      aria-label={ariaLabel}
      {...props}
    >
      {ariaLabel ? <title>{ariaLabel}</title> : null}
      <path fill="#FFF" d="M75.24 0h342v342H75.24z" />
      <circle cx="246.24" cy="171" r="86" fill="#2563EB" />
      <g fill="none" stroke="#FFF" strokeWidth="6" strokeLinecap="round">
        <ellipse cx="246.24" cy="171" rx="27" ry="86" />
        <path d="M160.24 171h172" />
        <path d="M246.24 85c17 19 26 41 26 86s-9 67-26 86" />
        <path d="M246.24 85c-17 19-26 41-26 86s9 67 26 86" />
      </g>
    </svg>
  )
}
