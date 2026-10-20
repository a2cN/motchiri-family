"use client";

import { toast } from "sonner";

// 「元に戻す」の表示(40_design_brief.md 決定 8)。同時に1つ。新しい表示は前の表示を置き換える。
export function showUndo(message: string, onUndo: () => void) {
  toast.dismiss();
  toast(message, { action: { label: "元に戻す", onClick: onUndo } });
}

/** 「元に戻す」なしの表示(登録した、など) */
export function showNotice(message: string) {
  toast.dismiss();
  toast(message);
}
