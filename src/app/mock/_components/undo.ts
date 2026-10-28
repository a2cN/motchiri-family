"use client";

import { toast } from "sonner";

// 「元に戻す」の表示(40_design_brief.md 決定 10、OD-stock-uiux-21 A 確定: 6秒)。同時に1つ。新しい表示は前の表示を置き換える。
export const UNDO_SECONDS = 6;

export function showUndo(message: string, onUndo: () => void, seconds: number = UNDO_SECONDS) {
  toast.dismiss();
  toast(message, { duration: seconds * 1000, action: { label: "元に戻す", onClick: onUndo } });
}

/** 「元に戻す」なしの表示(登録した、など)。6秒 */
export function showNotice(message: string) {
  toast.dismiss();
  toast(message, { duration: UNDO_SECONDS * 1000 });
}
