"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { StockLevel } from "../_data/types";

// 残量の toggle-group(○ / △ / ×。3つから選ぶ)。fieldset と legend(40 rev3 Accessibility Notes)。
export const LEVEL_SYMBOL: Record<StockLevel, string> = { full: "○", low: "△", out: "×" };
const LEVELS: StockLevel[] = ["full", "low", "out"];

export function LevelField({
  value,
  onChange,
  label = "残量",
  legend = label,
}: {
  value: StockLevel;
  onChange: (v: StockLevel) => void;
  /** toggle-group の読み上げる名前 */
  label?: string;
  legend?: string;
}) {
  return (
    <fieldset className="mt-4 first:mt-0">
      <legend className="mb-1 text-base font-strong">{legend}</legend>
      <ToggleGroup
        aria-label={label}
        value={[value]}
        onValueChange={(v) => {
          if (v[0]) onChange(v[0] as StockLevel);
        }}
      >
        {LEVELS.map((l) => (
          <ToggleGroupItem key={l} value={l} aria-label={`残量 ${LEVEL_SYMBOL[l]}`}>
            {LEVEL_SYMBOL[l]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </fieldset>
  );
}
