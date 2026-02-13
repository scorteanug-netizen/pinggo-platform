import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium tracking-[0.01em] ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-200 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-orange-500 text-white shadow-[0_10px_22px_rgba(255,86,33,0.24)] hover:scale-[1.02] hover:bg-orange-600 hover:shadow-[0_14px_30px_rgba(255,86,33,0.34)]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[0_4px_12px_rgba(239,68,68,0.2)] hover:scale-[1.02] hover:bg-destructive/90 hover:shadow-[0_10px_24px_rgba(239,68,68,0.28)]",
        outline:
          "border border-slate-200 bg-white text-slate-700 shadow-[0_2px_8px_rgba(15,23,42,0.08)] hover:scale-[1.02] hover:border-orange-100 hover:bg-orange-50 hover:text-orange-700 hover:shadow-[0_8px_20px_rgba(15,23,42,0.12)]",
        secondary:
          "bg-slate-100 text-slate-700 shadow-[0_2px_8px_rgba(15,23,42,0.06)] hover:scale-[1.02] hover:bg-slate-200/80 hover:shadow-[0_8px_20px_rgba(15,23,42,0.1)]",
        ghost:
          "text-slate-600 hover:scale-[1.02] hover:bg-orange-50 hover:text-orange-700 hover:shadow-[0_6px_16px_rgba(15,23,42,0.1)]",
        link: "text-orange-600 font-extrabold underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-lg px-3",
        lg: "h-11 rounded-xl px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
