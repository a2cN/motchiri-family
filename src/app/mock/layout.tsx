import type { Metadata } from "next";
import { MockToaster } from "./_lib/frame";

// stock-food のモック(Supabase に接続しない。main にも Pages にも出さない。50 の区切り 4 で消す)。
export const metadata: Metadata = {
  title: { default: "モック", template: "%s | モック" },
  robots: { index: false, follow: false },
};

export default function MockLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <MockToaster />
    </>
  );
}
