"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { trackingDefaults, totalQuantity } from "@/modules/stock/items";
import { LEVEL_SYMBOL } from "@/modules/stock/levels";
import { formatQuantity, parseQuantity, stepQuantity } from "@/modules/stock/quantity";
import type { Item, ItemStock, StockData, StockLevel } from "@/modules/stock/types";
import { Field, GroupField, MSG_OFFLINE, NativeSelect, OfflineCard, QUANTITY_ERROR, QtyField, StateCard, loadStateBody, notify } from "./bits";
import { Card } from "./card";
import { Frame } from "./frame";
import { useLookup } from "./lookup";
import { useAfterDelay, useStock } from "./stock-provider";

// 品物の編集(docs/design/stock/ の品物の編集 + docs/design/stock-master/)。カード4つ: 品物 / 管理のしかた / いつもの / 在庫(残量)。
// 保存のボタンは無い(品物名はフォーカスが外れたとき、チップは押したとき)。管理のしかたを変えるときだけパネルの「変える」で確定する。
// 開く品物は ?id=、来た元は &from=items(30_architecture.md D-18・M-11)。

export function ItemEditView() {
  const params = useSearchParams();
  const id = params.get("id");
  const from = params.get("from") === "items" ? "items" : "stock";
  const back = from === "items" ? "/stock/items/" : "/stock/";
  const { store, snapshot } = useStock();
  const { load, connection, data } = snapshot;
  const offline = connection === "offline";
  const showLoadingText = useAfterDelay(load === "loading", 1000);
  const [leaving, setLeaving] = useState(false);
  const item = id ? data.items.find((i) => i.id === id && i.itemKind === "food") : undefined;

  const stateBody = loadStateBody({ load, offline, showLoadingText, noun: "品物と在庫", onRetry: () => store.reload(), className: "mt-4" });
  let body: React.ReactNode;
  if (stateBody !== null) {
    body = stateBody;
  } else if (leaving) {
    body = null;
  } else if (!item) {
    body = (
      <StateCard title="品物がありません" className="mt-4">
        {from === "items" ? "「‹ もどる」から、品物の一覧に戻ってください。" : "「‹ もどる」から、食材の一覧に戻ってください。"}
      </StateCard>
    );
  } else {
    body = <Editor key={item.id} item={item} data={data} offline={offline} back={back} onLeave={() => setLeaving(true)} />;
  }
  return (
    <Frame back="list" backHref={back} title="品物の編集">
      {body}
    </Frame>
  );
}

function Editor({ item, data, offline, back, onLeave }: { item: Item; data: StockData; offline: boolean; back: string; onLeave: () => void }) {
  const router = useRouter();
  const { store } = useStock();
  const lookup = useLookup(data);
  const guard = guardOf(offline);
  // 相手が管理のしかたを変えたら、開いているパネルは黙って閉じる(OD-stock-master-02 (4))。パネルを開いたときの管理のしかたを覚えておく
  const [panelFor, setPanelFor] = useState<Item["tracking"] | null>(null);
  const panel = panelFor === item.tracking;
  const setPanel = (open: boolean) => setPanelFor(open ? item.tracking : null);

  const remove = () => {
    const handle = store.deleteItem(item.id);
    if (!handle) return;
    onLeave();
    router.push(back);
    notify(handle.label, { label: "元に戻す", onClick: handle.undo });
  };

  return (
    <>
      {offline && <OfflineCard subject="品物と在庫" className="mt-4" />}
      <div className="mt-4 md:grid md:grid-cols-2 md:items-start md:gap-x-6">
        <div className="md:col-start-1 md:row-start-1">
          <ItemCard item={item} data={data} offline={offline} lookup={lookup} />
          <Card as="section" className="mt-4">
            <h2 className="sr-only">管理のしかた</h2>
            <fieldset className="mt-4 first:mt-0">
              <legend className="mb-1 text-base font-strong">管理のしかた</legend>
              <p className="text-base">いまは {item.tracking === "count" ? "数で管理" : "残量で管理"}</p>
            </fieldset>
            {panel ? (
              <TrackingPanel item={item} data={data} lookup={lookup} onClose={() => setPanel(false)} onDone={() => setPanel(false)} />
            ) : (
              <div className="mt-4">
                <Button type="button" variant="ghost" className="-ml-4" aria-disabled={offline || undefined} onClick={guard(() => setPanel(true))}>
                  {item.tracking === "count" ? "残量で管理に変える" : "数で管理に変える"}
                </Button>
              </div>
            )}
          </Card>
          <Card as="section" className="mt-4">
            <h2 className="sr-only">いつもの</h2>
            <label className="flex min-h-14 items-center gap-3">
              <Checkbox checked={item.isRegular} aria-disabled={offline || undefined} onCheckedChange={(v) => guard(() => store.setRegular(item.id, v === true))()} />
              <span className="text-lg font-strong">いつもの</span>
            </label>
            <p className="text-base text-muted-foreground">在庫が無くても一覧に出て、買い物リストに載ります。</p>
          </Card>
        </div>
        <section className="mt-6 md:col-start-2 md:row-span-2 md:row-start-1 md:mt-0">
          {item.tracking === "count" ? (
            <>
              <h2 className="mb-3 text-lg font-heading">在庫</h2>
              <CountBlocks item={item} stocks={data.stocks.filter((s) => s.itemId === item.id)} offline={offline} lookup={lookup} />
            </>
          ) : (
            <>
              <h2 className="mb-3 text-lg font-heading">残量</h2>
              <LevelCard item={item} offline={offline} lookup={lookup} />
            </>
          )}
        </section>
        <div className="mt-6 md:col-start-1 md:row-start-2">
          <p className="text-base text-muted-foreground">在庫と買い物リストの項目も消えます。</p>
          <Button type="button" variant="ghost" size="text" className="-ml-3 text-destructive" aria-disabled={offline || undefined} onClick={guard(remove)}>
            品物を削除
          </Button>
        </div>
      </div>
    </>
  );
}

function ItemCard({ item, data, offline, lookup }: { item: Item; data: StockData; offline: boolean; lookup: Lookup }) {
  const { store } = useStock();
  const guard = guardOf(offline);
  const [draft, setDraft] = useState(item.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const focused = useRef(false);
  // 相手が名前を変えたときは、打っていなければ追従する
  useEffect(() => {
    if (!focused.current) setDraft(item.name);
  }, [item.name]);
  void data;
  return (
    <Card as="section">
      <h2 className="sr-only">品物</h2>
      <Field label="品物名" htmlFor="edit-name" error={nameError} errorId="edit-name-err">
        <Input
          id="edit-name"
          value={draft}
          maxLength={100}
          autoComplete="off"
          readOnly={offline}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? "edit-name-err" : undefined}
          onFocus={() => {
            focused.current = true;
          }}
          onChange={(e) => {
            setDraft(e.target.value);
            setNameError(null);
          }}
          onBlur={() => {
            focused.current = false;
            if (offline) return;
            const r = store.renameItem(item.id, draft);
            if (!r.ok) setNameError(r.error === "empty" ? "品物名を入れてください" : r.error === "taken" ? "同じ名前の品物があります" : null);
            else setDraft(draft.trim());
          }}
        />
      </Field>
      <div className="mt-4">
        <div className="text-base font-strong">種別</div>
        <p className="text-base">食材</p>
      </div>
      <Field label="ジャンル" htmlFor="edit-genre">
        <NativeSelect id="edit-genre" value={item.genreId ?? ""} aria-disabled={offline || undefined} onChange={(e) => guard(() => store.setItemGenre(item.id, e.target.value))()}>
          {lookup.genres.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {item.tracking === "count" && (
        <GroupField label="単位">
          <ToggleGroup aria-label="単位" value={item.unitId ? [item.unitId] : []} onValueChange={(v) => v[0] && guard(() => store.setItemUnit(item.id, v[0]))()}>
            {lookup.units.map((u) => (
              <ToggleGroupItem key={u.id} value={u.id}>
                {u.name}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </GroupField>
      )}
    </Card>
  );
}

// 管理のしかたを変えるパネル(補充の目安は出さない。OD-stock-master-01 (3) A)
function TrackingPanel({
  item, data, lookup, onClose, onDone,
}: {
  item: Item; data: StockData; lookup: Lookup; onClose: () => void; onDone: () => void;
}) {
  const { store } = useStock();
  const toLevel = item.tracking === "count";
  const defaults = trackingDefaults(item, data);
  const stocks = data.stocks.filter((s) => s.itemId === item.id);
  const [level, setLevel] = useState<StockLevel>(defaults.level);
  const [unitId, setUnitId] = useState<string | null>(defaults.unitId);
  const [unitError, setUnitError] = useState(false);
  const [qty, setQty] = useState<{ text: string; error: string | null }>({ text: defaults.quantityText, error: null });
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => bodyRef.current?.focus(), []);
  const unit = unitId ? lookup.units.find((u) => u.id === unitId) : undefined;

  const apply = () => {
    let input: Parameters<typeof store.changeTracking>[1];
    if (toLevel) {
      input = { to: "level", level };
    } else {
      let bad = false;
      if (!unitId) {
        setUnitError(true);
        bad = true;
      }
      const r = parseQuantity(qty.text, "non_negative");
      if (!r.ok) {
        setQty({ text: qty.text, error: QUANTITY_ERROR[r.error] });
        bad = true;
      }
      if (bad || !r.ok || !unitId) return;
      input = { to: "count", unitId, quantity: r.value };
    }
    const handle = store.changeTracking(item.id, input);
    if (handle) notify(handle.label, { label: "元に戻す", onClick: handle.undo });
    onDone();
  };

  return (
    <div className="mt-4 rounded-lg bg-muted p-4">
      <div ref={bodyRef} tabIndex={-1} className="text-base outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        {toLevel
          ? `在庫 ${stocks.length}件(合計 ${formatQuantity(totalQuantity(item.id, data))} ${lookup.unitName(item)})は消えて、残量になります。`
          : `今の残量(${LEVEL_SYMBOL[item.stockLevel ?? "full"]})の代わりに、数を入れます。`}
      </div>
      {toLevel ? (
        <fieldset className="mt-4 first:mt-0">
          <legend className="mb-1 text-base font-strong">残量</legend>
          <ToggleGroup aria-label="変えたあとの残量" value={[level]} onValueChange={(v) => v[0] && setLevel(v[0] as StockLevel)}>
            {(["full", "low", "out"] as const).map((l) => (
              <ToggleGroupItem key={l} value={l} aria-label={`残量 ${LEVEL_SYMBOL[l]}`}>
                {LEVEL_SYMBOL[l]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </fieldset>
      ) : (
        <>
          <GroupField label="単位" error={unitError ? "単位を選んでください" : null} errorId="edit-panel-unit-err">
            <ToggleGroup
              aria-label="パネルの単位"
              value={unitId ? [unitId] : []}
              onValueChange={(v) => {
                if (v[0]) {
                  setUnitId(v[0]);
                  setUnitError(false);
                }
              }}
            >
              {lookup.units.map((u) => (
                <ToggleGroupItem key={u.id} value={u.id}>
                  {u.name}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </GroupField>
          <GroupField label="個数">
            <QtyField
              id="edit-panel-qty"
              label="個数"
              value={qty.text}
              unit={unit?.name ?? ""}
              steppers={unit?.isCountable ?? true}
              error={qty.error}
              onChange={(text) => setQty({ text, error: null })}
              onBlur={() => undefined}
              onStep={(d) => {
                const r = parseQuantity(qty.text, "non_negative");
                if (r.ok) setQty({ text: formatQuantity(Math.max(0, Math.round((r.value + d) * 10) / 10)), error: null });
              }}
            />
          </GroupField>
        </>
      )}
      <div className="mt-4 flex items-center gap-2">
        <Button type="button" onClick={apply}>
          変える
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          やめる
        </Button>
      </div>
    </div>
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
