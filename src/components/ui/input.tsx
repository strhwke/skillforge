import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-md bg-[var(--color-bg-elev)] border border-[var(--color-border)] px-3 text-sm text-[var(--color-fg)] placeholder:text-[var(--color-fg-dim)] focus-ring focus:border-[var(--color-accent)] transition-colors file:bg-transparent file:border-0 file:text-sm file:font-medium file:text-[var(--color-fg-muted)] file:mr-3 file:cursor-pointer",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
