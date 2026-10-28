"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { isCountUnit } from "../_data/master";
import type { Item, ItemStock, StockLevel } from "../_data/types";
import { snapshotOf, supplyGenres, totalOf, useMockDispatch, useMockState } from "../_state/mock-state";
import { Card, EmptyCard } from "./card";
import { daysFromToday, toInputValue, useToday } from "./dates";
import { Field, FieldsetField, GroupField } from "./form-bits";
import { GenreFieldForKind } from "./genre-field-for-kind";
import { LevelField } from "./level-field";
import { formatQty, parseQty, settleQty, stepQty } from "./quantity";
import { QtyField } from "./qty-field";
import { DEFAULT_RESTOCK, RestockField, fromRestockUi, toRestockUi, type RestockUi } from "./restock-field";
import { PageTitle, ScreenShell } from "./screen-frame";
import { showUndo } from "./undo";

// 品物の編集(40_design_brief.md rev3「品物の編集」、決定 8・19・20、OD-stock-uiux-19・43・44 の推奨)。
// 保存のボタンは無い。チェック・チップ・± はその場で、品物名・数の入力欄・備考はフォーカスが外れたときに反映する。
// 管理のしかたを変えるときだけ、パネルの「変える」で確定する(在庫が消えるため)。

function ItemCard({ item }: { item: Item }) {
  const { masters, items } = useMockState();
  const dispatch = useMockDispatch();
  const [draft, setDraft] = useState(item.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const [note, setNote] = useState(item.note);
  const [genre, setGenre] = useState(item.genre);

  return (
    <Card as="section">
      <h2 className="sr-only">品物</h2>
      <Field label="品物名" htmlFor="edit-name" error={nameError} errorId="edit-name-err">
        <Input
          id="edit-name"
          value={draft}
          autoComplete="off"
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? "edit-name-err" : undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            setNameError(null);
          }}
          onBlur={() => {
            const trimmed = draft.trim();
            // 空の名前・同じ名前は反映しない(前の名前のまま。入力欄は誤りを出したまま。OD-stock-uiux-49)
            if (!trimmed) {
              setNameError("品物名を入れてください");
              return;
            }
            if (items.some((i) => i.id !== item.id && i.name === trimmed)) {
              setNameError("同じ名前の品物があります");
              return;
            }
            if (trimmed !== item.name) dispatch({ type: "item/patch", id: item.id, patch: { name: trimmed } });
          }}
        />
      </Field>

      <div className="mt-4">
        <div className="text-base font-strong">種別</div>
        <p className="text-base">{item.kind === "food" ? "食材" : "日用品"}</p>
      </div>

      <GenreFieldForKind
        idPrefix="edit"
        kind={item.kind}
        value={item.kind === "food" ? item.genre : genre}
        candidates={supplyGenres(items)}
        onChange={(g) => {
          if (item.kind === "food") dispatch({ type: "item/patch", id: item.id, patch: { genre: g } });
          else setGenre(g);
        }}
        onCommit={(g) => dispatch({ type: "item/patch", id: item.id, patch: { genre: g } })}
      />

      {item.tracking === "count" && (
        <GroupField label="単位">
          <ToggleGroup
            aria-label="単位"
            value={item.unit ? [item.unit] : []}
            onValueChange={(v) => {
              if (v[0]) dispatch({ type: "item/patch", id: item.id, patch: { unit: v[0] } });
            }}
          >
            {masters.units.map((u) => (
              <ToggleGroupItem key={u.name} value={u.name}>
                {u.name}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </GroupField>
      )}

      {item.kind === "supply" && (
        <Field label="備考" htmlFor="edit-note">
          <Textarea
            id="edit-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => dispatch({ type: "item/patch", id: item.id, patch: { note: note.trim() } })}
          />
        </Field>
      )}
    </Card>
  );
}

// 管理のしかたを変えるパネル(決定 19、OD-stock-uiux-43 A)。画面の中に開く(ダイアログにしない)。
function TrackingPanel({ item, onClose }: { item: Item; onClose: () => void }) {
  const state = useMockState();
  const { masters, stocks } = state;
  const dispatch = useMockDispatch();
  const bodyRef = useRef<HTMLDivElement>(null);
  const toLevel = item.tracking === "count";
  const mine = stocks.filter((s) => s.itemId === item.id);
  const total = totalOf(stocks, item.id);

  // 初期値: 数 → 残量は 合計 0 → ×、0 < 合計 ≤ 目安の数 → △、ほか ○。残量 → 数は ○・△ → 1、× → 0
  const initialLevel: StockLevel =
    total === 0 ? "out" : item.restockAt.kind === "count" && total <= item.restockAt.n ? "low" : "full";
  const [level, setLevel] = useState<StockLevel>(initialLevel);
  const [unit, setUnit] = useState(item.unit);
  const [unitError, setUnitError] = useState(false);
  const [qty, setQty] = useState({ text: item.stockLevel === "out" ? "0" : "1", error: null as string | null });
  const [restock, setRestock] = useState<RestockUi>(toLevel ? DEFAULT_RESTOCK.level : DEFAULT_RESTOCK.count);

  // 開いたらパネルの本文へフォーカスを移す(何が消えるかを先に聞けるように)
  useEffect(() => {
    bodyRef.current?.focus();
  }, []);

  const apply = () => {
    const restockAt = fromRestockUi(restock);
    let qtyValue = 0;
    let bad = false;
    if (!toLevel) {
      if (unit === "") {
        setUnitError(true);
        bad = true;
      }
      const r = parseQty(qty.text, "nonneg");
      if (r.ok) qtyValue = r.value;
      else {
        setQty({ text: qty.text, error: r.error });
        bad = true;
      }
    }
    if (restockAt === null) {
      setRestock({ ...restock, error: settleQty(restock.n, "positive").error });
      bad = true;
    }
    if (bad || restockAt === null) return;
    const before = snapshotOf(state);
    dispatch({ type: "item/changeTracking", id: item.id, to: toLevel ? "level" : "count", level, unit, quantity: qtyValue, restockAt });
    onClose();
    showUndo(`${item.name}を${toLevel ? "残量" : "数"}で管理に変えました`, () => dispatch({ type: "data/restore", snapshot: before }));
  };

  return (
    <div className="mt-4 rounded-lg bg-muted p-4">
      <div ref={bodyRef} tabIndex={-1} className="text-base outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        {toLevel
          ? `在庫 ${mine.length}件(合計 ${formatQty(total)} ${item.unit})は消えて、残量になります。`
          : `今の残量(${{ full: "○", low: "△", out: "×" }[item.stockLevel]})の代わりに、数を入れます。`}
      </div>
      {toLevel ? (
        <LevelField value={level} onChange={setLevel} />
      ) : (
        <>
          <div data-unit-group="">
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
                {masters.units.map((u) => (
                  <ToggleGroupItem key={u.name} value={u.name}>
                    {u.name}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </GroupField>
          </div>
          <GroupField label="個数">
            <QtyField
              id="edit-panel-qty"
              label="個数"
              value={qty.text}
              unit={unit}
              showSteppers={isCountUnit(masters, unit)}
              minusDisabled={false}
              error={qty.error}
              onChange={(text) => setQty({ text, error: null })}
              onBlur={() => setQty(settleQty(qty.text, "nonneg"))}
              onStep={(delta) => {
                const next = stepQty(qty.text, delta, 0);
                if (next !== null) setQty({ text: next, error: null });
              }}
            />
          </GroupField>
        </>
      )}
      <RestockField idPrefix="edit-panel-restock" tracking={toLevel ? "level" : "count"} unit={unit} value={restock} onChange={setRestock} />
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

function ManageCard({ item }: { item: Item }) {
  const dispatch = useMockDispatch();
  const [restock, setRestock] = useState<RestockUi>(toRestockUi(item.restockAt));
  const [panel, setPanel] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <Card as="section" className="mt-4">
      <h2 className="sr-only">管理のしかた</h2>
      <FieldsetField legend="管理のしかた">
        <p className="text-base">いまは {item.tracking === "count" ? "数で管理" : "残量で管理"}</p>
      </FieldsetField>
      <RestockField
        idPrefix="edit-restock"
        tracking={item.tracking}
        unit={item.unit}
        value={restock}
        onChange={(next) => {
          setRestock(next);
          // 読める値だけその場で反映する(「数で決める」の数が誤りの間は前の値のまま)
          const value = fromRestockUi(next);
          if (value !== null) dispatch({ type: "item/patch", id: item.id, patch: { restockAt: value } });
        }}
      />
      {panel ? (
        <TrackingPanel
          item={item}
          onClose={() => {
            setPanel(false);
            // 「やめる」で元のボタンへフォーカスを戻す
            setTimeout(() => triggerRef.current?.focus(), 0);
          }}
        />
      ) : (
        <div className="mt-4">
          <Button ref={triggerRef} type="button" variant="ghost" className="-ml-4" onClick={() => setPanel(true)}>
            {item.tracking === "count" ? "残量で管理に変える" : "数で管理に変える"}
          </Button>
        </div>
      )}
    </Card>
  );
}

function RegularCard({ item }: { item: Item }) {
  const dispatch = useMockDispatch();
  return (
    <Card as="section" className="mt-4">
      <h2 className="sr-only">いつもの</h2>
      {/* 行全体が label のチェック(押せる範囲は行の大きさ) */}
      <label className="flex min-h-14 items-center gap-3">
        <Checkbox checked={item.isRegular} onCheckedChange={(v) => dispatch({ type: "item/regular", id: item.id, value: v })} />
        <span className="text-lg font-strong">いつもの</span>
      </label>
      <p className="text-base text-muted-foreground">在庫が無くても一覧に出て、買い物リストに載ります。</p>
    </Card>
  );
}

// 数で管理の在庫のブロック。食材は在庫ごと(場所・期限・使い切り)、日用品は品物に1つで数だけ(OD-stock-uiux-42)
function StockBlock({ stock, item, today }: { stock: ItemStock; item: Item; today: Date | null }) {
  const state = useMockState();
  const dispatch = useMockDispatch();
  const [draft, setDraft] = useState<{ text: string; error: string | null } | null>(null);
  const count = isCountUnit(state.masters, item.unit);
  const food = item.kind === "food";
  const shown = draft ?? { text: formatQty(stock.quantity), error: null };

  const finish = () => {
    // 0 にすると(−でも入力でも)食材はブロックが消えて「使い切りました」+「元に戻す」(ST-F05・ST-F06・UX-04)。日用品は 0 のまま残る
    if (food) {
      const index = state.stocks.findIndex((s) => s.id === stock.id);
      dispatch({ type: "stock/remove", id: stock.id });
      showUndo(`${item.name}を使い切りました`, () => dispatch({ type: "stock/restore", stock, index }));
    } else {
      dispatch({ type: "supply/set", itemId: item.id, quantity: 0 });
      showUndo(`${item.name}を使い切りました`, () => dispatch({ type: "supply/set", itemId: item.id, quantity: stock.quantity }));
    }
  };
  const setQuantity = (n: number) => {
    if (n <= 0) finish();
    else dispatch(food ? { type: "stock/set", id: stock.id, quantity: n } : { type: "supply/set", itemId: item.id, quantity: n });
  };

  const commit = () => {
    if (draft === null) return;
    const r = parseQty(draft.text, "nonneg");
    if (!r.ok) {
      setDraft({ text: draft.text, error: r.error });
      return;
    }
    setDraft(null);
    if (r.value !== stock.quantity) setQuantity(r.value);
  };

  const expires = stock.expiresInDays !== null && today ? toInputValue(today, stock.expiresInDays) : "";
  const id = stock.id;
  const place = stock.location || "場所なし";

  return (
    <li>
      <Card as="section" className="mt-4 first:mt-0">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-strong break-words">
            {item.name}
            {food && <span className="font-normal">({place})</span>}
          </h3>
          {food && (
            <Button type="button" variant="ghost" size="text" aria-label={`${item.name}(${place})を使い切り`} onClick={finish}>
              使い切り
            </Button>
          )}
        </div>

        <GroupField label="数">
          <QtyField
            id={`edit-stock-${id}`}
            label={`${item.name}の数`}
            value={shown.text}
            unit={item.unit}
            showSteppers={count}
            minusDisabled={!food && stock.quantity <= 0}
            error={shown.error}
            onChange={(text) => setDraft({ text, error: null })}
            onBlur={commit}
            onStep={(delta) => {
              // 1 未満(0.5 など)から − を押すと 0 になる(使い切り)。+ は 1 ずつ
              const next = delta === 1 ? stepQty(formatQty(stock.quantity), 1, 0) : formatQty(Math.max(0, Math.round((stock.quantity - 1) * 10) / 10));
              setDraft(null);
              if (next !== null) setQuantity(Number(next));
            }}
          />
        </GroupField>

        {food && (
          <>
            <GroupField label="場所">
              <ToggleGroup
                aria-label={`${item.name}の場所`}
                value={stock.location ? [stock.location] : []}
                onValueChange={(v) => {
                  if (v[0]) dispatch({ type: "stock/patch", id, patch: { location: v[0] } });
                }}
              >
                {state.masters.locations.map((l) => (
                  <ToggleGroupItem key={l.name} value={l.name}>
                    {l.name}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </GroupField>

            <Field label="期限" htmlFor={`edit-exp-${id}`}>
              <div className="flex items-center gap-2">
                <Input
                  id={`edit-exp-${id}`}
                  type="date"
                  value={expires}
                  onChange={(e) =>
                    dispatch({
                      type: "stock/patch",
                      id,
                      patch: { expiresInDays: today && e.target.value ? daysFromToday(today, e.target.value) : null },
                    })
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="text"
                  aria-label={`${item.name}(${place})の期限をクリア`}
                  onClick={() => dispatch({ type: "stock/patch", id, patch: { expiresInDays: null } })}
                >
                  クリア
                </Button>
              </div>
            </Field>
          </>
        )}
      </Card>
    </li>
  );
}

export function ItemEditScreen() {
  const state = useMockState();
  const { items, stocks, nav } = state;
  const dispatch = useMockDispatch();
  const router = useRouter();
  const today = useToday();
  const item = items.find((i) => i.id === nav.editItemId);
  const back = { stock: "/mock/stock/", supply: "/mock/supply/", items: "/mock/items/" }[nav.editFrom];
  const mine = item
    ? stocks
        .filter((s) => s.itemId === item.id)
        .slice()
        .sort((a, b) => (a.expiresInDays ?? Number.POSITIVE_INFINITY) - (b.expiresInDays ?? Number.POSITIVE_INFINITY))
    : [];

  const remove = () => {
    if (!item) return;
    const before = snapshotOf(state);
    const related =
      mine.length > 0 || state.list.some((e) => e.itemId === item.id || (e.source === "manual" && e.name === item.name));
    dispatch({ type: "item/delete", id: item.id });
    // 来た元の画面へ戻り、「削除しました」+「元に戻す」(OD-stock-uiux-44 A)
    router.push(back);
    showUndo(
      related ? `${item.name}を削除しました。在庫と買い物リストからも消えました` : `${item.name}を削除しました`,
      () => dispatch({ type: "data/restore", snapshot: before }),
    );
  };

  return (
    <ScreenShell level="sub" active={nav.editFrom} backHref={back}>
      <PageTitle>品物の編集</PageTitle>
      {!item ? (
        <EmptyCard title="品物がありません" className="mt-4">
          「品物の登録」から追加できます。
        </EmptyCard>
      ) : (
        // 品物ごとに作り直す(名前などの draft が追いつくように)。iPad は2列: 左 = 品物・管理のしかた・いつもの・品物を削除、右 = 在庫 / 残量
        <div key={item.id} className="mt-4 md:grid md:grid-cols-2 md:items-start md:gap-x-6">
          <div className="md:col-start-1 md:row-start-1">
            <ItemCard item={item} />
            <ManageCard key={item.tracking} item={item} />
            <RegularCard item={item} />
          </div>
          <section className="mt-6 md:col-start-2 md:row-span-2 md:row-start-1 md:mt-0">
            {item.tracking === "count" ? (
              <>
                <h2 className="mb-3 text-lg font-heading">在庫</h2>
                {mine.length === 0 ? (
                  <p className="text-base text-muted-foreground">在庫はありません</p>
                ) : (
                  <ul>
                    {mine.map((s) => (
                      <StockBlock key={s.id} stock={s} item={item} today={today} />
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <>
                <h2 className="mb-3 text-lg font-heading">残量</h2>
                <Card as="section">
                  <LevelField value={item.stockLevel} onChange={(l) => dispatch({ type: "level/set", itemId: item.id, level: l })} />
                  {item.kind === "food" && (
                    <GroupField label="場所">
                      <ToggleGroup
                        aria-label={`${item.name}の場所`}
                        value={item.location ? [item.location] : []}
                        onValueChange={(v) => {
                          if (v[0]) dispatch({ type: "item/patch", id: item.id, patch: { location: v[0] } });
                        }}
                      >
                        {state.masters.locations.map((l) => (
                          <ToggleGroupItem key={l.name} value={l.name}>
                            {l.name}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    </GroupField>
                  )}
                </Card>
              </>
            )}
          </section>
          <div className="mt-6 md:col-start-1 md:row-start-2">
            <p className="text-base text-muted-foreground">在庫と買い物リストの項目も消えます。</p>
            <Button type="button" variant="ghost" size="text" className="-ml-3 text-destructive" onClick={remove}>
              品物を削除
            </Button>
          </div>
        </div>
      )}
    </ScreenShell>
  );
}
