import * as React from "react";
import { cn } from "@/lib/utils";

const Badge = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { variant?: "default" | "coral" | "success" | "warning" | "outline" }>(
  ({ className, variant = "default", ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
        variant === "default" && "border-transparent bg-slate-100 text-slate-700",
        variant === "coral" && "border-transparent bg-coral/10 text-coral",
        variant === "success" && "border-transparent bg-emerald-50 text-emerald-700",
        variant === "warning" && "border-transparent bg-amber-50 text-amber-700",
        variant === "outline" && "text-foreground",
        className
      )}
      {...props}
    />
  )
);
Badge.displayName = "Badge";

export { Badge };
