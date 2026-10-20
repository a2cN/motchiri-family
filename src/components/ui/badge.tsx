import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// 印。高さ 28px(押せないので 44px は要らない)、左右 10px、文字 16px font-strong。
// 期限切れ・残量×: alert、期限間近・残量△: warn、いつもの: secondary、手入力: muted。
// 面の上には、その面の -foreground だけを置く(コントラストの検査の範囲、40 の「検査されない使い方をしない」)。
const badgeVariants = cva(
  "inline-flex h-7 w-fit shrink-0 items-center justify-center rounded-control px-2.5 text-base font-strong whitespace-nowrap",
  {
    variants: {
      variant: {
        alert: "bg-alert text-alert-foreground",
        warn: "bg-warn text-warn-foreground",
        ok: "bg-ok text-ok-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        muted: "bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "secondary",
    },
  }
)

function Badge({
  className,
  variant = "secondary",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
