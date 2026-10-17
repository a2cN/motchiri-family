import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "もっちりファミリー",
    template: "%s | もっちりファミリー",
  },
  // ホーム画面から枠なしで起動する(iOS)。statusBarStyle は既定の 'default'(正典: 状態バーの見た目は次の UI/UX 設計タスク)。
  appleWebApp: { capable: true, title: "もっちりファミリー" },
};

export const viewport: Viewport = {
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="flex min-h-dvh flex-col font-sans">{children}</body>
    </html>
  );
}
