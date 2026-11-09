"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Card } from "../_lib/card";
import { Field, GroupField, MSG_OFFLINE, QtyField, notify } from "../_lib/bits";
import { LOCATIONS, formatQty, isCountable, parseQty, type Item, type Stock } from "../_lib/data";

const guardOf = (offline: boolean) => (fn: () => void) => () => (offline ? notify(MSG_OFFLINE) : fn());

// 在庫のブロック(run 1 の形のまま。`ab250aa` の StockBlock と同じ)。
export function StockBlock({ stock, item, offline, onPatch, onFinish }: { stock: Stock; item: Item; offline: boolean; onPatch: (p: Partial<Stock>) => void; onFinish: () => void }) {
  const guard = guardOf(offline);
  const [draft, setDraft] = useState<{ text: string; error: string | null } | null>(null);
  const shown = draft ?? { text: formatQty(stock.qty), error: null };
  const place = stock.location || "場所なし";
  const setQuantity = (n: number) => (n <= 0 ? onFinish() : onPatch({ qty: n }));
  const commit = () => {
    if (!draft || offline) return;
    const r = parseQty(draft.text);
    if (!r.ok) return setDraft({ text: draft.text, error: r.error });
    setDraft(null);
    if (r.value !== stock.qty) setQuantity(r.value);
  };
  return (
    <li>
      <Card as="section" className="mt-4 first:mt-0">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-strong break-words">
            {item.name}
            <span className="font-normal">({place})</span>
          </h3>
          <Button type="button" variant="ghost" size="text" aria-label={`${item.name}(${place})を使い切り`} aria-disabled={offline || undefined} onClick={guard(onFinish)}>
            使い切り
          </Button>
        </div>
        <GroupField label="数">
          <QtyField
            id={`edit-stock-${stock.id}`}
            label={`${item.name}の数`}
            value={shown.text}
            unit={item.unit}
            steppers={isCountable(item.unit)}
            readOnly={offline}
            error={shown.error}
            onChange={(text) => setDraft({ text, error: null })}
            onBlur={commit}
            onStep={(delta) => guard(() => setQuantity(Math.max(0, Math.round((stock.qty + delta) * 10) / 10)))()}
          />
        </GroupField>
        <GroupField label="場所">
          <ToggleGroup
            aria-label={`${item.name}の場所`}
            value={stock.location ? [stock.location] : []}
            onValueChange={(v) => v[0] && guard(() => onPatch({ location: v[0] }))()}
          >
            {LOCATIONS.map((l) => (
              <ToggleGroupItem key={l} value={l}>
                {l}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </GroupField>
        <Field label="期限" htmlFor={`edit-exp-${stock.id}`}>
          <div className="flex items-center gap-2">
            <Input
              id={`edit-exp-${stock.id}`}
              type="date"
              value={stock.expires ?? ""}
              readOnly={offline}
              onChange={(e) => (offline ? notify(MSG_OFFLINE) : onPatch({ expires: e.target.value || null }))}
            />
            <Button type="button" variant="ghost" size="text" aria-label={`${item.name}(${place})の期限をクリア`} aria-disabled={offline || undefined} onClick={guard(() => onPatch({ expires: null }))}>
              クリア
            </Button>
          </div>
        </Field>
      </Card>
    </li>
  );
}
