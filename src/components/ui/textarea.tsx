import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full rounded-md bg-[var(--color-bg-elev)] border border-[var(--color-border)] px-3 py-2.5 text-sm text-[var(--color-fg)] placeholder:text-[var(--color-fg-dim)] focus-ring focus:border-[var(--color-accent)] transition-colors resize-y min-h-[120px]",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
