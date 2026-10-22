import type { Metadata } from "next";
import { Zen_Maru_Gothic } from "next/font/google";
import { MockToaster } from "./_components/mock-toaster";
import { MockProvider } from "./_state/mock-state";

// モック全体の枠(30_architecture.md §3)。検索に出さない。包む要素は data-direction="sakura"(人間が選んだ方向性、OD-stock-uiux-07)。
// Web フォント(Zen Maru Gothic)はビルドのときに取り込む(D-16)。フォントの変数は tokens.css の sakura の範囲の --font-sans の先頭にある。
// 状態の Provider はここに置く(レイアウトは画面の移動で作り直されないので、モックの中を移動しても状態が続く。D-10)。
// モックと一緒に消える。
export const metadata: Metadata = {
  title: { absolute: "モック" },
  robots: { index: false, follow: false },
};

const zenMaruGothic = Zen_Maru_Gothic({
  weight: ["400", "500", "700"],
  variable: "--font-zen-maru-gothic",
  display: "swap",
  preload: false,
});

export default function MockLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-direction="sakura"
      className={`${zenMaruGothic.variable} flex min-h-dvh flex-1 flex-col bg-background font-sans text-foreground`}
    >
      <MockProvider>{children}</MockProvider>
      {/* 「元に戻す」の表示も data-direction の中に置く(さくらもちの色・角を読むため) */}
      <MockToaster />
    </div>
  );
}
