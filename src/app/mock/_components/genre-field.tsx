"use client";

import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Label } from "@/components/ui/label";

// 日用品のジャンル(OD-stock-uiux-35 B・45 A): 自由入力 + 使っている語の候補のチップ。空でもかまわない。
// 打った文字で候補を部分一致に絞る。押すと入る。
export function SupplyGenreField({
  id,
  value,
  onChange,
  onCommit,
  candidates,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  /** 入力欄からフォーカスが外れたとき・チップを押したとき、確定した値で呼ぶ(品物の編集の「その場で反映」用) */
  onCommit?: (v: string) => void;
  candidates: string[];
}) {
  const q = value.trim().normalize("NFKC").toLowerCase();
  const shown = candidates.filter((c) => q === "" || c.normalize("NFKC").toLowerCase().includes(q));
  return (
    <div className="mt-4 first:mt-0">
      <Label htmlFor={id} className="mb-1">
        ジャンル
      </Label>
      <Input id={id} value={value} autoComplete="off" aria-describedby={`${id}-hint`} onChange={(e) => onChange(e.target.value)} onBlur={() => onCommit?.(value.trim())} />
      <p id={`${id}-hint`} className="mt-1 text-base text-muted-foreground">
        空でもかまいません
      </p>
      {shown.length > 0 && (
        <div className="mt-2">
          <ToggleGroup
            aria-label="ジャンルの候補"
            value={candidates.includes(value.trim()) ? [value.trim()] : []}
            onValueChange={(v) => {
              onChange(v[0] ?? "");
              onCommit?.(v[0] ?? "");
            }}
          >
            {shown.map((c) => (
              <ToggleGroupItem key={c} value={c}>
                {c}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}
    </div>
  );
}
