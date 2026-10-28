"use client";

import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Item, RestockAt, Tracking } from "../_data/types";
import { formatQty, parseQty, settleQty } from "./quantity";

// 部品「補充の目安」(40_design_brief.md rev3、OD-stock-uiux-39 A・決定 28)。
// 数で管理: 切れたら / 数で決める(数の欄 + 「<単位> 以下で」)/ なし。残量で管理: △で / ×で / なし。

export type RestockUi = { mode: "none" | "zero" | "count" | "low" | "out"; n: string; error: string | null };

export const DEFAULT_RESTOCK: Record<Tracking, RestockUi> = {
  count: { mode: "none", n: "1", error: null },
  level: { mode: "low", n: "1", error: null },
};

export function toRestockUi(r: RestockAt): RestockUi {
  return { mode: r.kind, n: r.kind === "count" ? formatQty(r.n) : "1", error: null };
}

/** 画面の値 → 品物の値。「数で決める」の数が読めなければ null */
export function fromRestockUi(ui: RestockUi): RestockAt | null {
  if (ui.mode === "count") {
    const r = parseQty(ui.n, "positive");
    return r.ok ? { kind: "count", n: r.value } : null;
  }
  return { kind: ui.mode };
}

/** 一覧・品物の一覧での表示(補足の文字) */
export function restockLabel(item: Pick<Item, "tracking" | "restockAt" | "unit">): string {
  const r = item.restockAt;
  switch (r.kind) {
    case "none":
      return "目安なし";
    case "zero":
      return "目安 切れたら";
    case "count":
      return `目安 ${formatQty(r.n)} ${item.unit}以下`;
    case "low":
      return "目安 △";
    case "out":
      return "目安 ×";
  }
}

const COUNT_MODES: { value: RestockUi["mode"]; label: string }[] = [
  { value: "zero", label: "切れたら" },
  { value: "count", label: "数で決める" },
  { value: "none", label: "なし" },
];
const LEVEL_MODES: { value: RestockUi["mode"]; label: string }[] = [
  { value: "low", label: "△で" },
  { value: "out", label: "×で" },
  { value: "none", label: "なし" },
];

export function RestockField({
  idPrefix,
  tracking,
  unit,
  value,
  onChange,
}: {
  idPrefix: string;
  tracking: Tracking;
  unit: string;
  value: RestockUi;
  onChange: (next: RestockUi) => void;
}) {
  const modes = tracking === "count" ? COUNT_MODES : LEVEL_MODES;
  const errId = `${idPrefix}-n-err`;
  return (
    <fieldset className="mt-4 first:mt-0">
      <legend className="mb-1 text-base font-strong">補充の目安</legend>
      <p className="mb-2 text-base text-muted-foreground">ここまで減ったら、買い物リストに載ります。</p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <ToggleGroup
          aria-label="補充の目安"
          value={[value.mode]}
          onValueChange={(v) => {
            if (v[0]) onChange({ ...value, mode: v[0] as RestockUi["mode"], error: null });
          }}
        >
          {modes.map((m) => (
            <ToggleGroupItem key={m.value} value={m.value}>
              {m.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {tracking === "count" && value.mode === "count" && (
          <div className="flex items-center gap-2">
            <Input
              id={`${idPrefix}-n`}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              aria-label="補充の目安の数"
              className="w-24 text-center text-lg tabular-nums"
              value={value.n}
              aria-invalid={value.error ? true : undefined}
              aria-describedby={value.error ? errId : undefined}
              onChange={(e) => onChange({ ...value, n: e.target.value, error: null })}
              onBlur={() => {
                const s = settleQty(value.n, "positive");
                onChange({ ...value, n: s.text, error: s.error });
              }}
            />
            <span className="text-base">{unit ? `${unit} 以下で` : "以下で"}</span>
          </div>
        )}
      </div>
      {value.error && (
        <p id={errId} className="mt-1 text-base text-destructive">
          {value.error}
        </p>
      )}
    </fieldset>
  );
}
