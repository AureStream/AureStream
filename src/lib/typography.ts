import { cn } from "@/lib/utils"

/** Semantic class names — styles live in `src/index.css` @layer components */
export const type = {
  pageTitle: "type-page-title",
  pageSubtitle: "type-page-subtitle",
  sectionTitle: "type-section-title",
  label: "type-label",
  value: "type-value",
  valueLg: "type-value-lg",
  description: "type-description",
  caption: "type-caption",
  hint: "type-hint",
  overline: "type-overline",
  mono: "type-mono",
  link: "type-link",
  kvLabel: "type-kv-label",
  kvValue: "type-kv-value",
  kvValueMono: "type-kv-value-mono",
} as const

export const surface = {
  row: "surface-row",
  rowInteractive: "surface-row-interactive",
  inset: "surface-inset",
  chip: "surface-chip",
} as const

export const iconBadge = {
  sm: "icon-badge-sm",
  primary: "icon-badge-sm icon-badge-primary",
  indigo: "icon-badge-sm icon-badge-indigo",
  teal: "icon-badge-sm icon-badge-teal",
  blue: "icon-badge-sm icon-badge-blue",
  purple: "icon-badge-sm icon-badge-purple",
  emerald: "icon-badge-sm icon-badge-emerald",
  slate: "icon-badge-sm icon-badge-slate",
} as const

export const btn = {
  accent: "btn-accent",
  accentMuted: "btn-accent-muted",
  pill: "btn-pill",
  pillActive: "btn-pill-active",
} as const

export const badge = {
  default: "ui-badge",
  success: "ui-badge ui-badge-success",
  warning: "ui-badge ui-badge-warning",
  danger: "ui-badge ui-badge-danger",
  brand: "ui-badge ui-badge-brand",
} as const

export function pageHeaderIconClassName(className?: string) {
  return cn("page-header-icon", className)
}
