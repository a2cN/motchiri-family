"use client";

import { Button } from "@/components/ui/button";

// [−] 数+単位 [+](40_design_brief.md「場所別の在庫の一覧」)。数の欄の最小の幅は 4em、中央寄せ、数字の幅をそろえる。
export function QuantityStepper({
  name,
  quantity,
  unit,
  onDecrease,
  onIncrease,
  decreaseDisabled = false,
}: {
  name: string;
  quantity: number;
  unit: string;
  onDecrease: () => void;
  onIncrease: () => void;
  decreaseDisabled?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button type="button" variant="secondary" size="icon" aria-label={`${name}を1減らす`} disabled={decreaseDisabled} onClick={onDecrease}>
        <span aria-hidden="true">−</span>
      </Button>
      <span className="inline-block min-w-[4em] text-center text-lg tabular-nums">
        {quantity}
        {unit}
      </span>
      <Button type="button" variant="secondary" size="icon" aria-label={`${name}を1増やす`} onClick={onIncrease}>
        <span aria-hidden="true">+</span>
      </Button>
    </div>
  );
}
