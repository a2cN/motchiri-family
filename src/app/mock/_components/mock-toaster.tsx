"use client";

import { usePathname } from "next/navigation";
import { Toaster } from "@/components/ui/sonner";

// 画面の下の操作の帯(買い物リスト、品物の登録)がある画面では、帯の上 8px に出す(40 の部品の表)。
// 帯の高さは 72px(余白 12px ×2 + 48px)。品物の登録の帯は 768px 未満だけなので、iPad では少し高く出る(仮)。
export function MockToaster() {
  const pathname = usePathname();
  const hasBar = /\/(shopping-list|item-new)\/$/.test(pathname);
  return <Toaster offset={{ bottom: hasBar ? 84 : 24 }} mobileOffset={{ bottom: hasBar ? 84 : 16, left: 16, right: 16 }} />;
}
