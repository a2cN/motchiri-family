import type { Metadata } from "next";
import { M_PLUS_Rounded_1c, Zen_Maru_Gothic } from "next/font/google";

// モック全体の枠(30_architecture.md §3)。検索に出さない。Web フォント(案 B・C)はビルドのときに取り込む(D-16)。
// フォントの変数は、方向性の範囲の --font-sans の先頭に置く(tokens.css)。モックと一緒に消える。
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

const mplusRounded = M_PLUS_Rounded_1c({
  weight: ["400", "700", "800"],
  variable: "--font-mplus-rounded-1c",
  display: "swap",
  preload: false,
});

export default function MockLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${zenMaruGothic.variable} ${mplusRounded.variable} flex min-h-dvh flex-col`}>
      {children}
    </div>
  );
}
