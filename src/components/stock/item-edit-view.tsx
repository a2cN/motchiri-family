"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LEVEL_SYMBOL } from "@/modules/stock/levels";
import { formatQuantity, parseQuantity, stepQuantity } from "@/modules/stock/quantity";
import type { Item, ItemStock, StockLevel } from "@/modules/stock/types";
import { Field, GroupField, MSG_OFFLINE, OfflineCard, QUANTITY_ERROR, QtyField, RetryButton, StateCard, notify } from "./bits";
import { Card } from "./card";
import { Frame } from "./frame";
import { useLookup } from "./lookup";
import { useAfterDelay, useStock } from "./stock-provider";

// 品物の編集(run 1 の形: h1 の下に品物名の h2、その下に在庫(数で管理)か残量(残量で管理)のカードだけ。
// docs/design/stock-food/brief.md Component Specs 1)。開く品物は ?id=(30_architecture.md D-18)。

export function ItemEditView() {
  const id = useSearchParams().get("id");
  const { store, snapshot } = useStock();
  const { load, connection, data } = snapshot;
  const offline = connection === "offline";
  const lookup = useLookup(data);
  const showLoadingText = useAfterDelay(load === "loading", 1000);
  const item = id ? data.items.find((i) => i.id === id && i.itemKind === "food") : undefined;

  let body: React.ReactNode;
  if (load === "loading") {
    body = showLoadingText ? (
      <StateCard role="status" className="mt-4">
        読み込んでいます…
      </StateCard>
    ) : null;
  } else if (load === "error") {
    body = offline ? (
      <StateCard title="電波がありません" className="mt-4" action={<RetryButton onClick={() => store.reload()} />}>
        在庫を読み込むには電波が要ります。電波のある所で、もう一度お試しください。
      </StateCard>
    ) : (
      <StateCard title="つながりませんでした" className="mt-4" action={<RetryButton onClick={() => store.reload()} />}>
        通信できなかったため、在庫を読み込めませんでした。電波のよい場所で、もう一度お試しください。
      </StateCard>
    );
  } else if (!item) {
    body = (
      <StateCard title="品物がありません" className="mt-4">
        「‹ もどる」から、食材の一覧に戻ってください。
      </StateCard>
    );
  } else {
    body = (
      <>
        {offline && <OfflineCard className="mt-4" />}
        <h2 className="mt-2 text-xl font-heading">{item.name}</h2>
        <div className="mt-4">
          {item.tracking === "count" ? (
            <CountBlocks item={item} stocks={data.stocks.filter((s) => s.itemId === item.id)} offline={offline} lookup={lookup} />
          ) : (
            <LevelCard item={item} offline={offline} lookup={lookup} />
          )}
        </div>
      </>
    );
  }
  return (
    <Frame back="list" title="品物の編集" widthClass="max-w-[640px]">
      {body}
    </Frame>
  );
}

type Lookup = ReturnType<typeof useLookup>;
const guardOf = (offline: boolean) => (fn: () => void) => () => (offline ? notify(MSG_OFFLINE) : fn());

function CountBlocks({ item, stocks, offline, lookup }: { item: Item; stocks: ItemStock[]; offline: boolean; lookup: Lookup }) {
  // 期限の近い順 → 期限なし。同じ期限は登録した順(一覧と同じ並び)
  const sorted = [...stocks].sort((a, b) => {
    if ((a.expiresOn === null) !== (b.expiresOn === null)) return a.expiresOn === null ? 1 : -1;
    if (a.expiresOn !== b.expiresOn && a.expiresOn !== null && b.expiresOn !== null) return a.expiresOn < b.expiresOn ? -1 : 1;
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1;
  });
  if (sorted.length === 0) return <p className="text-base text-muted-foreground">在庫はありません</p>;
  return (
    <ul>
      {sorted.map((s) => (
        <StockBlock key={s.id} stock={s} item={item} offline={offline} lookup={lookup} />
      ))}
    </ul>
  );
}

function StockBlock({ stock, item, offline, lookup }: { stock: ItemStock; item: Item; offline: boolean; lookup: Lookup }) {
  const { store } = useStock();
  const guard = guardOf(offline);
  const [draft, setDraft] = useState<{ text: string; error: string | null } | null>(null);
  const shown = draft ?? { text: formatQuantity(stock.quantity), error: null };
  const place = lookup.locationName(stock.locationId) || "場所なし";
  const unit = lookup.unitName(item);
  const countable = lookup.isCountable(item);

  const withUndo = (handle: ReturnType<typeof store.setQuantity>) => {
    if (handle) notify(handle.label, { label: "元に戻す", onClick: handle.undo });
  };
  const commit = () => {
    if (!draft || offline) return;
    const r = parseQuantity(draft.text, "non_negative");
    if (!r.ok) return setDraft({ text: draft.text, error: QUANTITY_ERROR[r.error] });
    setDraft(null);
    if (r.value !== stock.quantity) withUndo(store.setQuantity(stock.id, r.value));
  };
  return (
    <li>
      <Card as="section" className="mt-4 first:mt-0">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-strong break-words">
            {item.name}
            <span className="font-normal">({place})</span>
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="text"
            aria-label={`${item.name}(${place})を使い切り`}
            aria-disabled={offline || undefined}
            onClick={guard(() => withUndo(store.useUp(stock.id)))}
          >
            使い切り
          </Button>
        </div>
        <GroupField label="数">
          <QtyField
            id={`edit-stock-${stock.id}`}
            label={`${item.name}の数`}
            value={shown.text}
            unit={unit}
            steppers={countable}
            readOnly={offline}
            error={shown.error}
            onChange={(text) => setDraft({ text, error: null })}
            onBlur={commit}
            onStep={(delta) => guard(() => withUndo(store.setQuantity(stock.id, stepQuantity(stock.quantity, delta, "list"))))()}
          />
        </GroupField>
        <GroupField label="場所">
          <ToggleGroup
            aria-label={`${item.name}の場所`}
            value={stock.locationId ? [stock.locationId] : []}
            onValueChange={(v) => v[0] && guard(() => store.patchStock(stock.id, { locationId: v[0] }))()}
          >
            {lookup.locations.map((l) => (
              <ToggleGroupItem key={l.id} value={l.id}>
                {l.name}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </GroupField>
        <Field label="期限" htmlFor={`edit-exp-${stock.id}`}>
          <div className="flex items-center gap-2">
            <Input
              id={`edit-exp-${stock.id}`}
              type="date"
              value={stock.expiresOn ?? ""}
              readOnly={offline}
              onChange={(e) => (offline ? notify(MSG_OFFLINE) : store.patchStock(stock.id, { expiresOn: e.target.value || null }))}
            />
            <Button
              type="button"
              variant="ghost"
              size="text"
              aria-label={`${item.name}(${place})の期限をクリア`}
              aria-disabled={offline || undefined}
              onClick={guard(() => store.patchStock(stock.id, { expiresOn: null }))}
            >
              クリア
            </Button>
          </div>
        </Field>
      </Card>
    </li>
  );
}

function LevelCard({ item, offline, lookup }: { item: Item; offline: boolean; lookup: Lookup }) {
  const { store } = useStock();
  const guard = guardOf(offline);
  const level: StockLevel = item.stockLevel ?? "full";
  return (
    <Card as="section">
      <fieldset>
        <legend className="mb-1 text-base font-strong">残量</legend>
        <ToggleGroup aria-label="残量" value={[level]} onValueChange={(v) => v[0] && guard(() => store.setLevel(item.id, v[0] as StockLevel))()}>
          {(["full", "low", "out"] as const).map((l) => (
            <ToggleGroupItem key={l} value={l} aria-label={`残量 ${LEVEL_SYMBOL[l]}`}>
              {LEVEL_SYMBOL[l]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </fieldset>
      <GroupField label="場所">
        <ToggleGroup
          aria-label={`${item.name}の場所`}
          value={item.locationId ? [item.locationId] : []}
          onValueChange={(v) => v[0] && guard(() => store.setItemLocation(item.id, v[0]))()}
        >
          {lookup.locations.map((l) => (
            <ToggleGroupItem key={l.id} value={l.id}>
              {l.name}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </GroupField>
    </Card>
  );
}
