"use client";

import { StateCard } from "./bits";

// 3b の新しい文のカード(40_design_brief.md Component Specs 2・3)。形は stock-food の正典のオフラインのカード・状態のカードのまま、文だけが新しい。

/** オフラインのカード。1行目「電波がありません」、2行目に本文、未同期があれば3行目「まだ送っていない変更 N件」 */
export function OfflineNote({ children, pending, className }: { children: React.ReactNode; pending?: number; className?: string }) {
  return (
    <StateCard role="status" title="電波がありません" className={className}>
      {children}
      {pending !== undefined && pending > 0 && <PendingText count={pending} className="mt-1" />}
    </StateCard>
  );
}

function PendingText({ count, className }: { count: number; className?: string }) {
  return (
    <span className={`block text-base ${className ?? ""}`} aria-atomic="true">
      まだ送っていない変更 <span className="tabular-nums">{count}</span>件
    </span>
  );
}

/** 電波はあるが 1秒を超えて送れていないとき: カードは無く、補足の文字の1行だけ */
export function PendingLine({ count, className }: { count: number; className?: string }) {
  return (
    <p role="status" aria-live="polite" aria-atomic="true" className={`text-base text-muted-foreground ${className ?? ""}`}>
      まだ送っていない変更 <span className="tabular-nums">{count}</span>件
    </p>
  );
}
