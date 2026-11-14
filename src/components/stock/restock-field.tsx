"use client";

import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { parseQuantity } from "@/modules/stock/quantity";
import { formatQuantity } from "@/modules/stock/quantity";
import { restockDefaults, type RestockUi } from "@/modules/stock/restock";
import type { Tracking } from "@/modules/stock/types";
import { QUANTITY_ERROR } from "./bits";

// 部品「補充の目安」(docs/design/stock/ の部品、docs/design/stock-shopping/ のスクリーンショット)。
// 数で管理: 切れたら / 数で決める(数の欄 + 「<単位> 以下で」)/ なし。残量で管理: △で / ×で / なし。

/** 欄の値。数の欄は文字のまま持つ */
export type RestockForm = { mode: RestockUi["kind"]; n: string; error: string | null };

export const toRestockForm = (ui: RestockUi): RestockForm => ({ mode: ui.kind, n: ui.kind === "count" ? formatQuantity(ui.n) : "1", error: null });
export const defaultRestockForm = (tracking: Tracking): RestockForm => toRestockForm(restockDefaults(tracking));

/** 欄の値を RestockUi に直す。数で決めるの数が読めなければ null(誤り) */
export function restockUiFromForm(form: RestockForm): RestockUi | null {
  if (form.mode !== "count") return { kind: form.mode } as RestockUi;
  const q = parseQuantity(form.n, "positive");
  return q.ok ? { kind: "count", n: q.value } : null;
}

const COUNT_MODES: { value: RestockUi["kind"]; label: string }[] = [
  { value: "zero", label: "切れたら" },
  { value: "count", label: "数で決める" },
  { value: "none", label: "なし" },
];
const LEVEL_MODES: { value: RestockUi["kind"]; label: string }[] = [
  { value: "low", label: "△で" },
  { value: "out", label: "×で" },
  { value: "none", label: "なし" },
];

function settle(text: string): { text: string; error: string | null } {
  const r = parseQuantity(text, "positive");
  if (!r.ok) return { text, error: QUANTITY_ERROR[r.error] };
  return { text: formatQuantity(r.value), error: null };
}

export function RestockField({
  idPrefix, tracking, unit, value, onChange, onCommit, readOnly = false,
}: {
  idPrefix: string;
  tracking: Tracking;
  unit: string;
  value: RestockForm;
  onChange: (next: RestockForm) => void;
  /** 選び直したとき・数の欄を離れたとき(品物の編集は、ここで保存する) */
  onCommit?: (next: RestockForm) => void;
  readOnly?: boolean;
}) {
  const modes = tracking === "count" ? COUNT_MODES : LEVEL_MODES;
  const errId = `${idPrefix}-n-err`;
  return (
    <fieldset className="mt-4 first:mt-0" data-restock="">
      <legend className="mb-1 text-base font-strong">補充の目安</legend>
      <p className="mb-2 text-base text-muted-foreground">ここまで減ったら、買い物リストに載ります。</p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <ToggleGroup
          aria-label="補充の目安"
          value={[value.mode]}
          onValueChange={(v) => {
            if (!v[0]) return;
            const next = { ...value, mode: v[0] as RestockUi["kind"], error: null };
            onChange(next);
            onCommit?.(next);
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
              readOnly={readOnly}
              aria-invalid={value.error ? true : undefined}
              aria-describedby={value.error ? errId : undefined}
              onChange={(e) => onChange({ ...value, n: e.target.value, error: null })}
              onBlur={() => {
                const s = settle(value.n);
                const next = { ...value, n: s.text, error: s.error };
                onChange(next);
                onCommit?.(next);
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
