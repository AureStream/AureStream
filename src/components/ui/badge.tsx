import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        success: "bg-accent-green text-accent-green-text",
        warning: "bg-accent-yellow text-accent-yellow-text",
        danger: "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300",
        info: "bg-primary-light text-primary",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  }
)

export interface BadgeProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
