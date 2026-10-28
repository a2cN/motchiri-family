"use client";

import { Button } from "@/components/ui/button";
import type { StockLevel } from "../_data/types";

// 残量のボタン(40_design_brief.md の部品の表、rev2 で 64×48)。管理のしかたが level の品物の行で、食材の画面にも日用品の画面にも出る。面は残量の色、枠 2px はその -foreground、
// 記号 ○ △ × を 20px で。1タップで ○→△→×→○。読み上げは aria-label で補う。
const SYMBOL: Record<StockLevel, string> = { full: "○", low: "△", out: "×" };
const NEXT_SYMBOL: Record<StockLevel, string> = { full: "△", low: "×", out: "○" };
const VARIANT = { full: "ok", low: "warn", out: "alert" } as const;

export function StockLevelButton({ name, level, onCycle }: { name: string; level: StockLevel; onCycle: () => void }) {
  return (
    <Button
      type="button"
      variant={VARIANT[level]}
      size="level"
      aria-label={`${name}の残量 ${SYMBOL[level]}。押すと ${NEXT_SYMBOL[level]} にする`}
      onClick={onCycle}
    >
      {SYMBOL[level]}
    </Button>
  );
}
