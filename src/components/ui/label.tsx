"use client"

import * as React from "react"
import { cn } from "cn"

// 16px、font-strong。
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn("block text-base font-strong select-none", className)}
      {...props}
    />
  )
}

export { Label }
