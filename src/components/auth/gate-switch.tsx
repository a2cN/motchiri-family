"use client";

import { usePathname } from "next/navigation";
import { AuthGate } from "./auth-gate";

// モック(/mock/ の下)は Supabase に接続しないので、AuthGate を通さない(stock-food のモック用。50 の区切り 4 で、モックと一緒にこのファイルも消す)。
export function GateSwitch({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/mock" || pathname.startsWith("/mock/")) return <>{children}</>;
  return <AuthGate>{children}</AuthGate>;
}
