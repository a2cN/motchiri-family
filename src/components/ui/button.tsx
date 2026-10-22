import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// shadcn/ui(Base UI)の button を、40_design_brief.md の部品の約束に合わせて直したもの。
// 直した所: 高さ 48px(UI-03 の 44px 以上)、角は rounded-control、フォーカスの輪は ring の 2px + 外に 2px、
// 押している間は面 accent、dark: を消した、destructive の variant を消した(面に destructive を使わない)。
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-control text-base whitespace-nowrap no-underline outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        // 主なボタン
        // font-strong と font-normal を同じ文字列に入れない(cn が font-strong を文字の種類と見て、太さと食い違うため)
        default:
          "bg-primary font-strong text-primary-foreground active:bg-accent",
        // 控えめなボタン(+1/−1、在庫に登録)
        secondary: "bg-secondary font-strong text-secondary-foreground active:bg-accent",
        // 文字だけのボタン(外す、クリア)。面なし
        ghost: "bg-transparent font-normal text-foreground active:bg-accent",
        // 残量のボタン(○ △ ×)。面は残量の色、枠 2px はその -foreground
        ok: "border-2 border-ok-foreground bg-ok font-strong text-ok-foreground",
        warn: "border-2 border-warn-foreground bg-warn font-strong text-warn-foreground",
        alert: "border-2 border-alert-foreground bg-alert font-strong text-alert-foreground",
      },
      size: {
        // 高さ 48px
        default: "h-12 min-w-11 px-4",
        // 文字だけのボタン用: 高さ 44px
        text: "h-11 min-w-11 px-3",
        // 記号だけ: 44×44px
        icon: "size-11 text-xl",
        // 残量のボタン: 64×48px(40 rev2 の部品の直し。ほかのボタンの高さにそろえる)
        level: "h-12 w-16 text-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
