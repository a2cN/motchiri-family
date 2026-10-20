"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"

// 「元に戻す」の表示(40 の部品の表)。面 inverse、文字 inverse-foreground 16px、角 rounded-lg、影 shadow-card、
// 右に主なボタンの見た目の「元に戻す」(高さ 44px)。同時に1つ(visibleToasts)。6 秒(duration)。
// next-themes は使わない(ライトモードのみ、UI-01)。生成された色の変数(--normal-bg など)は消し、
// unstyled にしてトークンのクラスだけで描く。
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      position="bottom-center"
      duration={6000}
      visibleToasts={1}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-full items-center gap-3 rounded-lg bg-inverse px-4 py-3 text-base text-inverse-foreground shadow-card",
          content: "flex-1",
          title: "text-base",
          actionButton:
            "inline-flex h-11 min-w-11 shrink-0 items-center justify-center rounded-control bg-primary px-4 text-base font-strong text-primary-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:bg-accent",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
