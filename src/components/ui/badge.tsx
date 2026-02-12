import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "bg-orange-100 text-orange-700 border border-orange-200 font-extrabold",
        orange: "bg-orange-100 text-orange-700 border border-orange-200 font-extrabold",
        blue: "bg-blue-50 text-blue-700 border border-blue-200",
        green: "bg-green-50 text-green-700 border border-green-200",
        red: "bg-red-50 text-red-700 border border-red-200",
        gray: "bg-slate-100 text-slate-700 border border-slate-200",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
