"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// 部品「数の入力」(40_design_brief.md rev3)。[−] [入力欄] [+] と、右に単位の文字。
// 数える単位でないときは − と + を出さない(showSteppers)。入力欄は type="text"、inputmode="decimal"、幅 96px、18px。
// label は見えない(欄の上に見える label がある画面ではそれを aria-labelledby ではなく aria-label で兼ねる)。
export function QtyField({
  id,
  label,
  value,
  onChange,
  onBlur,
  unit,
  showSteppers = true,
  minusDisabled = false,
  onStep,
  error,
  suffix,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  unit: string;
  showSteppers?: boolean;
  minusDisabled?: boolean;
  onStep?: (delta: 1 | -1) => void;
  error?: string | null;
  /** 単位の右の文字(「以下で」など) */
  suffix?: string;
}) {
  const errId = `${id}-err`;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {showSteppers && (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label={`${label}を1減らす`}
            aria-disabled={minusDisabled || undefined}
            onClick={minusDisabled ? undefined : () => onStep?.(-1)}
          >
            <span aria-hidden="true">−</span>
          </Button>
        )}
        <Input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-label={label}
          className="w-24 text-center text-lg tabular-nums"
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : undefined}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
        {showSteppers && (
          <Button type="button" variant="secondary" size="icon" aria-label={`${label}を1増やす`} onClick={() => onStep?.(1)}>
            <span aria-hidden="true">+</span>
          </Button>
        )}
        {(unit || suffix) && (
          <span className="text-base">
            {unit}
            {suffix ? ` ${suffix}` : ""}
          </span>
        )}
      </div>
      {error && (
        <p id={errId} className="mt-1 text-base text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
