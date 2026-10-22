"use client";

import { Button } from "@/components/ui/button";

// [−] 数+単位 [+](40_design_brief.md「場所別の在庫の一覧」)。数の欄の最小の幅は 4em、中央寄せ、数字の幅をそろえる。
// 押せないとき(個数 1 の −)も薄くしない。aria-disabled にして、押しても何もしない(40 rev2 の部品の直し)。
export function QuantityStepper({
  name,
  quantity,
  unit,
  onDecrease,
  onIncrease,
  decreaseDisabled = false,
  spaced = false,
}: {
  name: string;
  quantity: number;
  unit: string;
  onDecrease: () => void;
  onIncrease: () => void;
  decreaseDisabled?: boolean;
  spaced?: boolean;
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
      <span className="inline-block min-w-[4em] text-center text-lg tabular-nums">
        {quantity}
        {spaced && unit ? <span className="ml-1">{unit}</span> : unit}
      </span>
      <Button type="button" variant="secondary" size="icon" aria-label={`${name}を1増やす`} onClick={onIncrease}>
        <span aria-hidden="true">+</span>
      </Button>
    </div>
  );
}
