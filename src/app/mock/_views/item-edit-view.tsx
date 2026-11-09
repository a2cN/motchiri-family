"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Card } from "../_lib/card";
import { Field, GroupField, MSG_OFFLINE, NativeSelect, OfflineCard, QtyField, StateCard, notify } from "../_lib/bits";
import { GENRE_NAMES, ITEMS, LEVEL_SYMBOL, LOCATIONS, MASTERS, REGULAR_IDS, STOCKS, byExpiry, formatQty, isCountable, parseQty, type Item, type Level, type Stock } from "../_lib/data";
import { Frame } from "../_lib/frame";
import { StockBlock } from "./stock-block";

// 品物の編集(`ab250aa` の item-edit-view.tsx の形。run 2 の部分集合: 補充の目安なし。40_design_brief.md Component Specs 1)。
// 保存のボタンは無い。管理のしかたを変えるときだけパネルの「変える」で確定する。

export function ItemEditView() {
  const params = useSearchParams();
  const id = params.get("id");
  const from = params.get("from") === "items" ? "items" : "stock";
  const state = params.get("state") ?? "";
  const item = ITEMS.find((i) => i.id === id);
  const back = from === "items" ? "/mock/items/" : "/mock/stock/";

  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    if (state === "item-gone" && item) notify(`${item.name}は、もう削除されていました`);
  }, [state, item]);

  if (!item || state === "item-gone") {
    return (
      <Frame back="list" backHref={back} title="品物の編集">
        <StateCard title="品物がありません" className="mt-4">
          {from === "items" ? "「‹ もどる」から、品物の一覧に戻ってください。" : "「‹ もどる」から、食材の一覧に戻ってください。"}
        </StateCard>
      </Frame>
    );
  }
  return <Editor key={item.id} item={item} state={state} back={back} />;
}

function Editor({ item: base, state, back }: { item: Item; state: string; back: string }) {
  const router = useRouter();
  const offline = state === "offline";
  const guard = (fn: () => void) => () => (offline ? notify(MSG_OFFLINE) : fn());

  const [item, setItem] = useState<Item>(() => {
    if (state === "unit") return { ...base, unit: "個" };
    if (state === "tracking-undo") return { ...base, tracking: "level", unit: "", level: "full" };
    return base;
  });
  const [stocks, setStocks] = useState<Stock[]>(() => (state === "tracking-undo" ? [] : STOCKS.filter((s) => s.itemId === base.id).sort(byExpiry)));
  const [regular, setRegular] = useState(REGULAR_IDS.includes(base.id));
  const [panel, setPanel] = useState(state === "tracking");
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    if (state === "tracking-undo") {
      notify(`${base.name}を残量で管理に変えました`, {
        label: "元に戻す",
        onClick: () => {
          setItem(base);
          setStocks(STOCKS.filter((s) => s.itemId === base.id).sort(byExpiry));
        },
      });
    }
  }, [state, base]);

  const remove = () => {
    router.push(back);
    notify(`${item.name}を削除しました`, { label: "元に戻す", onClick: () => undefined });
  };

  const applyTracking = (next: Item, nextStocks: Stock[]) => {
    const before = { item, stocks };
    setItem(next);
    setStocks(nextStocks);
    setPanel(false);
    notify(`${item.name}を${next.tracking === "level" ? "残量" : "数"}で管理に変えました`, {
      label: "元に戻す",
      onClick: () => {
        setItem(before.item);
        setStocks(before.stocks);
      },
    });
  };

  return (
    <Frame back="list" backHref={back} title="品物の編集">
      {offline && <OfflineCard subject="品物と在庫" className="mt-4" />}
      <div className="mt-4 md:grid md:grid-cols-2 md:items-start md:gap-x-6">
        <div className="md:col-start-1 md:row-start-1">
          <ItemCard item={item} state={state} offline={offline} guard={guard} onPatch={(p) => setItem((i) => ({ ...i, ...p }))} />
          <Card as="section" className="mt-4">
            <h2 className="sr-only">管理のしかた</h2>
            <fieldset className="mt-4 first:mt-0">
              <legend className="mb-1 text-base font-strong">管理のしかた</legend>
              <p className="text-base">いまは {item.tracking === "count" ? "数で管理" : "残量で管理"}</p>
            </fieldset>
            {panel ? (
              <TrackingPanel item={item} stocks={stocks} onClose={() => setPanel(false)} onApply={applyTracking} />
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
              <Checkbox checked={regular} aria-disabled={offline || undefined} onCheckedChange={(v) => guard(() => setRegular(v === true))()} />
              <span className="text-lg font-strong">いつもの</span>
            </label>
            <p className="text-base text-muted-foreground">在庫が無くても一覧に出て、買い物リストに載ります。</p>
          </Card>
        </div>
        <section className="mt-6 md:col-start-2 md:row-span-2 md:row-start-1 md:mt-0">
          {item.tracking === "count" ? (
            <>
              <h2 className="mb-3 text-lg font-heading">在庫</h2>
              {stocks.length === 0 ? (
                <p className="text-base text-muted-foreground">在庫はありません</p>
              ) : (
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
              )}
            </>
          ) : (
            <>
              <h2 className="mb-3 text-lg font-heading">残量</h2>
              <Card as="section">
                <LevelField value={item.level} disabled={offline} onChange={(l) => guard(() => setItem((i) => ({ ...i, level: l })))()} />
                <GroupField label="場所">
                  <ToggleGroup aria-label={`${item.name}の場所`} value={item.location ? [item.location] : []} onValueChange={(v) => v[0] && guard(() => setItem((i) => ({ ...i, location: v[0] })))()}>
                    {LOCATIONS.map((l) => (
                      <ToggleGroupItem key={l} value={l}>
                        {l}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </GroupField>
              </Card>
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
    </Frame>
  );
}

function LevelField({ value, onChange, disabled }: { value: Level; onChange: (v: Level) => void; disabled?: boolean }) {
  return (
    <fieldset className="mt-4 first:mt-0">
      <legend className="mb-1 text-base font-strong">残量</legend>
      <ToggleGroup aria-label="残量" value={[value]} onValueChange={(v) => v[0] && onChange(v[0] as Level)} aria-disabled={disabled || undefined}>
        {(["full", "low", "out"] as const).map((l) => (
          <ToggleGroupItem key={l} value={l} aria-label={`残量 ${LEVEL_SYMBOL[l]}`}>
            {LEVEL_SYMBOL[l]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </fieldset>
  );
}

function ItemCard({
  item, state, offline, guard, onPatch,
}: {
  item: Item;
  state: string;
  offline: boolean;
  guard: (fn: () => void) => () => void;
  onPatch: (p: Partial<Item>) => void;
}) {
  const [draft, setDraft] = useState(state === "name-error" ? "卵" : item.name);
  const [nameError, setNameError] = useState<string | null>(state === "name-error" ? "同じ名前の品物があります" : null);
  return (
    <Card as="section">
      <h2 className="sr-only">品物</h2>
      <Field label="品物名" htmlFor="edit-name" error={nameError} errorId="edit-name-err">
        <Input
          id="edit-name"
          value={draft}
          autoComplete="off"
          readOnly={offline}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? "edit-name-err" : undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            setNameError(null);
          }}
          onBlur={() => {
            if (offline) return;
            const trimmed = draft.trim();
            if (!trimmed) return setNameError("品物名を入れてください");
            if (ITEMS.some((i) => i.id !== item.id && i.name === trimmed)) return setNameError("同じ名前の品物があります");
            if (trimmed !== item.name) onPatch({ name: trimmed });
          }}
        />
      </Field>
      <div className="mt-4">
        <div className="text-base font-strong">種別</div>
        <p className="text-base">食材</p>
      </div>
      <Field label="ジャンル" htmlFor="edit-genre">
        <NativeSelect id="edit-genre" value={item.genre} aria-disabled={offline || undefined} onChange={(e) => guard(() => onPatch({ genre: e.target.value }))()}>
          {GENRE_NAMES.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {item.tracking === "count" && (
        <GroupField label="単位">
          <ToggleGroup aria-label="単位" value={item.unit ? [item.unit] : []} onValueChange={(v) => v[0] && guard(() => onPatch({ unit: v[0] }))()}>
            {MASTERS.units.map((u) => (
              <ToggleGroupItem key={u.name} value={u.name}>
                {u.name}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </GroupField>
      )}
    </Card>
  );
}

// 管理のしかたを変えるパネル(`ab250aa` の TrackingPanel から補充の目安を除いたもの)
function TrackingPanel({ item, stocks, onClose, onApply }: { item: Item; stocks: Stock[]; onClose: () => void; onApply: (item: Item, stocks: Stock[]) => void }) {
  const toLevel = item.tracking === "count";
  const total = stocks.reduce((a, s) => a + s.qty, 0);
  const [level, setLevel] = useState<Level>(total === 0 ? "out" : "full");
  const [unit, setUnit] = useState(item.unit);
  const [unitError, setUnitError] = useState(false);
  const [qty, setQty] = useState({ text: item.level === "out" ? "0" : "1", error: null as string | null });
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => bodyRef.current?.focus(), []);

  const apply = () => {
    if (toLevel) return onApply({ ...item, tracking: "level", unit: "", level }, []);
    let bad = false;
    if (unit === "") {
      setUnitError(true);
      bad = true;
    }
    const r = parseQty(qty.text);
    if (!r.ok) {
      setQty({ text: qty.text, error: r.error });
      bad = true;
    }
    if (bad || !r.ok) return;
    onApply({ ...item, tracking: "count", unit }, r.value > 0 ? [{ id: `s-new-${item.id}`, itemId: item.id, qty: r.value, location: item.location, expires: null }] : []);
  };

  return (
    <div className="mt-4 rounded-lg bg-muted p-4">
      <div ref={bodyRef} tabIndex={-1} className="text-base outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        {toLevel ? `在庫 ${stocks.length}件(合計 ${formatQty(total)} ${item.unit})は消えて、残量になります。` : `今の残量(${LEVEL_SYMBOL[item.level]})の代わりに、数を入れます。`}
      </div>
      {toLevel ? (
        <LevelField value={level} onChange={setLevel} />
      ) : (
        <>
          <GroupField label="単位" error={unitError ? "単位を選んでください" : null} errorId="edit-panel-unit-err">
            <ToggleGroup
              aria-label="パネルの単位"
              value={unit ? [unit] : []}
              onValueChange={(v) => {
                if (v[0]) {
                  setUnit(v[0]);
                  setUnitError(false);
                }
              }}
            >
              {MASTERS.units.map((u) => (
                <ToggleGroupItem key={u.name} value={u.name}>
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
              unit={unit}
              steppers={isCountable(unit)}
              error={qty.error}
              onChange={(text) => setQty({ text, error: null })}
              onBlur={() => undefined}
              onStep={(d) => {
                const r = parseQty(qty.text);
                if (r.ok) setQty({ text: formatQty(Math.max(0, r.value + d)), error: null });
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
