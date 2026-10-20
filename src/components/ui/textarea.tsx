import * as React from "react"
import { cn } from "cn"

// 高さ 96px(min-h-24)、文字 16px(md:text-sm を消した。ADR 0006 決定 12)。
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "block min-h-24 w-full rounded-control border border-input bg-card px-3 py-2 text-base text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
