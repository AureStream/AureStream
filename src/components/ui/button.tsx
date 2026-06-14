import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 cursor-pointer [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-text-inverse hover:bg-primary-hover shadow-sm hover:shadow-glow-primary",
        secondary: "bg-primary-light text-primary hover:bg-primary hover:text-text-inverse",
        ghost: "text-text-secondary hover:bg-surface-hover hover:text-text",
        destructive: "bg-danger text-text-inverse hover:opacity-90",
        gradient:
          "bg-gradient-to-br from-[#6C63FF] via-[#8B5CF6] to-[#3B82F6] text-text-inverse hover:opacity-90 shadow-glow-primary",
        outline: "border border-border bg-transparent hover:bg-surface-hover text-text",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        default: "h-10 px-5",
        lg: "h-12 px-7 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button"
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />
}

export { Button, buttonVariants }
