"use client"

import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// 選択のチップ(40 の部品の表)。高さ 48px、左右 16px、角 rounded-control。
// 選ばれていない: 面 card、枠 1px input、文字 foreground。
// 選ばれている: 面 primary、枠 2px foreground、文字 primary-foreground、太字(決定 9。先頭の ✓ は toggle-group が足す)。
const toggleVariants = cva(
  "group/toggle inline-flex h-12 min-w-11 items-center justify-center gap-1 rounded-control border border-input bg-card px-4 text-base whitespace-nowrap text-foreground outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:bg-accent aria-pressed:border-2 aria-pressed:border-foreground aria-pressed:bg-primary aria-pressed:font-strong aria-pressed:text-primary-foreground disabled:pointer-events-none disabled:opacity-50"
)

function Toggle({
  className,
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(toggleVariants(), className)}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
