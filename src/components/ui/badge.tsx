import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border",
  {
    variants: {
      variant: {
        default:
          "border-[var(--color-border)] bg-[var(--color-bg-elev)] text-[var(--color-fg-muted)]",
        accent:
          "border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 text-[var(--color-accent)]",
        cyan:
          "border-[var(--color-accent-2)]/40 bg-[var(--color-accent-2)]/10 text-[var(--color-accent-2)]",
        success:
          "border-[var(--color-success)]/40 bg-[var(--color-success)]/10 text-[var(--color-success)]",
        warn:
          "border-[var(--color-warn)]/40 bg-[var(--color-warn)]/10 text-[var(--color-warn)]",
        danger:
          "border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 text-[var(--color-danger)]",
        critical:
          "border-[var(--color-critical)]/50 bg-[var(--color-critical)]/15 text-[var(--color-critical)]",
        major:
          "border-[var(--color-major)]/50 bg-[var(--color-major)]/15 text-[var(--color-major)]",
        minor:
          "border-[var(--color-minor)]/50 bg-[var(--color-minor)]/10 text-[var(--color-minor)]",
        strength:
          "border-[var(--color-strength)]/50 bg-[var(--color-strength)]/15 text-[var(--color-strength)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}
