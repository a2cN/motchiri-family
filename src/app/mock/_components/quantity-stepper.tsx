"use client";

import { Button } from "@/components/ui/button";

// [−] 数+単位 [+](一覧の行。40_design_brief.md rev3 部品「管理のしかたの見せ方」)。数の欄の最小の幅は 4em、中央寄せ、数字の幅をそろえる。
// 押せないとき(日用品の 0 の −)も薄くしない。aria-disabled にして、押しても何もしない。
// 一覧の行では入力欄を出さず、数の文字と ± だけ(打ち込むのは品物の編集で)。
export function QuantityStepper({
  name,
  display,
  onDecrease,
  onIncrease,
  decreaseDisabled = false,
}: {
  name: string;
  /** 数と単位の文字(「2本」「1 本」「0.5個」) */
  display: string;
  onDecrease: () => void;
  onIncrease: () => void;
  decreaseDisabled?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        type="button"
        variant="secondary"
        size="icon"
        aria-label={`${name}を1減らす`}
        aria-disabled={decreaseDisabled || undefined}
        onClick={decreaseDisabled ? undefined : onDecrease}
      >
        <span aria-hidden="true">−</span>
      </Button>
      <span className="inline-block min-w-[4em] text-center text-lg tabular-nums">{display}</span>
      <Button type="button" variant="secondary" size="icon" aria-label={`${name}を1増やす`} onClick={onIncrease}>
        <span aria-hidden="true">+</span>
      </Button>
    </div>
  );
}
