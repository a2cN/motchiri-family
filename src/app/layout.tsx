import type { Metadata, Viewport } from "next";
import { Zen_Maru_Gothic } from "next/font/google";
import { GateSwitch } from "@/components/auth/gate-switch";
import { startupImages } from "@/pwa/startup-images";
import "./globals.css";

// Web フォントはビルドのときに取り込む(30_architecture.md D-16)。変数名は tokens.css の --font-sans が読む。
const zenMaruGothic = Zen_Maru_Gothic({
  weight: ["400", "500", "700"],
  variable: "--font-zen-maru-gothic",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: {
    default: "もっちりファミリー",
    template: "%s | もっちりファミリー",
  },
  // ホーム画面から枠なしで起動する(iOS)。状態バーは正典(OD-stock-uiux-22 A)の 'default'。
  // 起動時の画面は機種の大きさごとの画像(OD-stock-uiux-24 A、30_architecture.md D-18)。
  appleWebApp: {
    capable: true,
    title: "もっちりファミリー",
    statusBarStyle: "default",
    startupImage: startupImages.map(({ url, media }) => ({ url, media })),
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={zenMaruGothic.variable}>
      <body className="flex min-h-dvh flex-col font-sans">
        <GateSwitch>{children}</GateSwitch>
      </body>
    </html>
  );
}
