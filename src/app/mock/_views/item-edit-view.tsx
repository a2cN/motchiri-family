"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Card } from "../_lib/card";
import { Field, GroupField, MSG_OFFLINE, OfflineCard, QtyField, StateCard, notify } from "../_lib/bits";
import { ITEMS, LEVEL_SYMBOL, LOCATIONS, STOCKS, byExpiry, formatQty, isCountable, parseQty, type Item, type Level, type Stock } from "../_lib/data";
import { Frame } from "../_lib/frame";

// 品物の編集(run 1 の形: h1 の下に品物名の h2、その下に在庫(数で管理)か残量(残量で管理)のカードだけ。40_design_brief.md Component Specs 1)。

export function ItemEditView() {
  const params = useSearchParams();
  const id = params.get("id");
  const offline = params.get("state") === "offline";
  const item = ITEMS.find((i) => i.id === id);

  return (
    <Frame back="list" title="品物の編集" widthClass="max-w-[640px]">
      {!item ? (
        <StateCard title="品物がありません" className="mt-4">
          「‹ もどる」から、食材の一覧に戻ってください。
        </StateCard>
      ) : (
        <>
          {offline && <OfflineCard className="mt-4" />}
          <h2 className="mt-2 text-xl font-heading">{item.name}</h2>
          <div className="mt-4">{item.tracking === "count" ? <CountBlocks item={item} offline={offline} /> : <LevelCard item={item} offline={offline} />}</div>
        </>
      )}
    </Frame>
  );
}

const guardOf = (offline: boolean) => (fn: () => void) => () => (offline ? notify(MSG_OFFLINE) : fn());

function CountBlocks({ item, offline }: { item: Item; offline: boolean }) {
  const [stocks, setStocks] = useState<Stock[]>(() => STOCKS.filter((s) => s.itemId === item.id).sort(byExpiry));
  if (stocks.length === 0) return <p className="text-base text-muted-foreground">在庫はありません</p>;
  return (
    <ul>
      {stocks.map((s) => (
        <StockBlock
          key={s.id}
          stock={s}
          item={item}
          offline={offline}
          onPatch={(p) => setStocks((all) => all.map((x) => (x.id === s.id ? { ...x, ...p } : x)))}
          onFinish={() => {
            const index = stocks.findIndex((x) => x.id === s.id);
            setStocks((all) => all.filter((x) => x.id !== s.id));
            notify(`${item.name}を使い切りました`, {
              label: "元に戻す",
              onClick: () =>
                setStocks((all) => {
                  const copy = [...all];
                  copy.splice(Math.min(index, copy.length), 0, s);
                  return copy;
                }),
            });
          }}
        />
      ))}
    </ul>
  );
}

function StockBlock({ stock, item, offline, onPatch, onFinish }: { stock: Stock; item: Item; offline: boolean; onPatch: (p: Partial<Stock>) => void; onFinish: () => void }) {
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

function LevelCard({ item, offline }: { item: Item; offline: boolean }) {
  const guard = guardOf(offline);
  const [level, setLevel] = useState<Level>(item.level);
  const [location, setLocation] = useState(item.location);
  return (
    <Card as="section">
      <fieldset>
        <legend className="mb-1 text-base font-strong">残量</legend>
        <ToggleGroup aria-label="残量" value={[level]} onValueChange={(v) => v[0] && guard(() => setLevel(v[0] as Level))()}>
          {(["full", "low", "out"] as const).map((l) => (
            <ToggleGroupItem key={l} value={l} aria-label={`残量 ${LEVEL_SYMBOL[l]}`}>
              {LEVEL_SYMBOL[l]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </fieldset>
      <GroupField label="場所">
        <ToggleGroup aria-label={`${item.name}の場所`} value={location ? [location] : []} onValueChange={(v) => v[0] && guard(() => setLocation(v[0]))()}>
          {LOCATIONS.map((l) => (
            <ToggleGroupItem key={l} value={l}>
              {l}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </GroupField>
    </Card>
  );
}
