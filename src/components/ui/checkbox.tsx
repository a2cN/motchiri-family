"use client"

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { cn } from "cn"
import { CheckIcon } from "lucide-react"

// 箱 28×28px、枠 2px input、角 rounded-check。チェック済み: 面 primary、✓ は primary-foreground。
// 押せる範囲は、この箱を包む label(行全体、高さ 56px 以上)で作る。擬似要素で広げない(30 D-15)。
function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-check border-2 border-input bg-card text-primary-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-checked:bg-primary",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current"
      >
        <CheckIcon aria-hidden="true" strokeWidth={3} className="size-5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
