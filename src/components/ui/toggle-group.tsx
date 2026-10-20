"use client"

import * as React from "react"
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group"
import { cn } from "cn"

import { toggleVariants } from "@/components/ui/toggle"

// 1つ選ぶ型のチップの並び。joined のときは間隔 0 の横並び(両端だけ角を丸める)。
// 折り返して並べ、間隔 8px(40 の部品の表)。
function ToggleGroup({
  className,
  joined = false,
  ...props
}: ToggleGroupPrimitive.Props & { joined?: boolean }) {
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      data-joined={joined ? "" : undefined}
      className={cn(
        "flex flex-row flex-wrap items-center",
        joined ? "w-fit gap-0" : "gap-2",
        className
      )}
      {...props}
    />
  )
}

function ToggleGroupItem({
  className,
  children,
  ...props
}: TogglePrimitive.Props) {
  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      className={cn(
        toggleVariants(),
        "in-data-joined:rounded-none in-data-joined:first:rounded-l-control in-data-joined:last:rounded-r-control",
        className
      )}
      {...props}
    >
      {/* 選ばれているときだけ見える ✓(色に頼らず、選ばれていることを示す) */}
      <span aria-hidden="true" className="hidden group-aria-pressed/toggle:inline">
        ✓
      </span>
      {children}
    </TogglePrimitive>
  )
}

export { ToggleGroup, ToggleGroupItem }
