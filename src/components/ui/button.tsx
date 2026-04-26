"use client";
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all focus-ring disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--color-accent)] text-white hover:bg-[#6d4ee8] shadow-[0_0_24px_-4px_rgba(124,92,255,0.6)] hover:shadow-[0_0_32px_-2px_rgba(124,92,255,0.8)]",
        secondary:
          "bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-fg)] hover:bg-[var(--color-bg-elev)] hover:border-[var(--color-border-strong)]",
        ghost:
          "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-bg-card)]",
        outline:
          "border border-[var(--color-border-strong)] bg-transparent text-[var(--color-fg)] hover:bg-[var(--color-bg-card)]",
        danger:
          "bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/20",
        gradient:
          "text-white shadow-[0_0_30px_-4px_rgba(124,92,255,0.5)] bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)] hover:brightness-110",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
    );
  },
);
Button.displayName = "Button";
