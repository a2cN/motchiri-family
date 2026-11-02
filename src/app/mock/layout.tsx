import type { Metadata } from "next";
import { MockProvider } from "./_state/mock-state";

// 公開サイトに置くモック。検索に出さない。本番の画面からのリンクは無い。
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function MockLayout({ children }: { children: React.ReactNode }) {
  return <MockProvider>{children}</MockProvider>;
}
