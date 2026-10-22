"use client";

import { Toaster } from "@/components/ui/sonner";

// 「元に戻す」の表示は、一番上の帯の 8px 上に出す(40 rev2 の部品の表)。帯の高さは BottomStack が測って
// --toast-bottom に入れる(帯が無い画面では 24px)。固定値は持たない。iPad では本文の領域の中央、最大の幅 480px。
export function MockToaster() {
  return (
    <Toaster
      offset={{ bottom: "var(--toast-bottom, 24px)" }}
      mobileOffset={{ bottom: "var(--toast-bottom, 16px)", left: 16, right: 16 }}
      style={{ "--width": "480px" } as React.CSSProperties}
    />
  );
}
