"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { isCountUnit } from "../_data/master";
import type { Item, Stock } from "../_data/types";
import { useMockDispatch, useMockState } from "../_state/mock-state";
import { Card, EmptyCard } from "./card";
import { daysFromToday, toInputValue, useToday } from "./dates";
import { Field, GroupField } from "./form-bits";
import { NativeSelect } from "./native-select";
import { PageTitle, ScreenShell } from "./screen-frame";
import { showUndo } from "./undo";

// 品物の編集(40_design_brief.md rev2「品物の編集」)。保存のボタンは無い。チェック・チップ・± はその場で、
// 品物名・数の入力欄・備考はフォーカスが外れたときに反映する(OD-stock-uiux-19 の提案 A)。

function ItemCard({ item }: { item: Item }) {
  const { masters } = useMockState();
  const dispatch = useMockDispatch();
  const [draft, setDraft] = useState(item.name);
  const [nameError, setNameError] = useState(false);
  const [note, setNote] = useState(item.note);

  return (
    <Card as="section">
      <h2 className="sr-only">品物</h2>
      <Field label="品物名" htmlFor="edit-name" error={nameError ? "品物名を入れてください" : null} errorId="edit-name-err">
        <Input
          id="edit-name"
          value={draft}
          autoComplete="off"
          aria-invalid={nameError || undefined}
          aria-describedby={nameError ? "edit-name-err" : undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            if (e.target.value.trim()) setNameError(false);
          }}
          onBlur={() => {
            const trimmed = draft.trim();
            if (!trimmed) {
              // 空の名前は反映しない(前の名前のまま。入力欄は誤りを出したまま)
              setNameError(true);
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

      {item.kind === "food" ? (
        <>
          <Field label="ジャンル" htmlFor="edit-genre">
            <NativeSelect
              id="edit-genre"
              value={item.genre}
              onChange={(e) => dispatch({ type: "item/patch", id: item.id, patch: { genre: e.target.value } })}
            >
              {masters.genres.map((g) => (
                <option key={g.name} value={g.name}>
                  {g.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
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
        </>
      ) : (
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

function StockBlock({ stock, item, today }: { stock: Stock; item: Item; today: Date | null }) {
  const state = useMockState();
  const dispatch = useMockDispatch();
  const [draft, setDraft] = useState<string | null>(null);
  const count = isCountUnit(item.unit);

  const finish = () => {
    // 0 にすると(−でも入力でも)ブロックが消えて「使い切りました」+「元に戻す」(ST-F05・ST-F06・UX-04)
    const index = state.stocks.findIndex((s) => s.id === stock.id);
    dispatch({ type: "stock/remove", id: stock.id });
    showUndo(`${item.name}を使い切りました`, () => dispatch({ type: "stock/restore", stock, index }), state.settings.undoSeconds);
  };
  const setQuantity = (n: number) => (n <= 0 ? finish() : dispatch({ type: "stock/set", id: stock.id, quantity: n }));

  const commit = () => {
    if (draft === null) return;
    const n = Number(draft);
    setDraft(null);
    if (draft.trim() === "" || Number.isNaN(n) || n === stock.quantity) return;
    setQuantity(n);
  };

  const expires = stock.expiresInDays !== null && today ? toInputValue(today, stock.expiresInDays) : "";
  const id = stock.id;

  return (
    <li>
      <Card as="section" className="mt-4 first:mt-0">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-strong break-words">
            {item.name}
            <span className="font-normal">({stock.location || "場所なし"})</span>
          </h3>
          <Button type="button" variant="ghost" size="text" aria-label={`${item.name}(${stock.location || "場所なし"})を使い切り`} onClick={finish}>
            使い切り
          </Button>
        </div>

        <GroupField label="数">
          <div className="flex items-center gap-2">
            {count && (
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label={`${item.name}を1減らす`}
                onClick={() => setQuantity(stock.quantity - 1)}
              >
                <span aria-hidden="true">−</span>
              </Button>
            )}
            <Input
              aria-label={`${item.name}の数`}
              inputMode="numeric"
              className="w-20 text-center tabular-nums"
              value={draft ?? String(stock.quantity)}
              onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
              onBlur={commit}
            />
            {count && (
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label={`${item.name}を1増やす`}
                onClick={() => setQuantity(stock.quantity + 1)}
              >
                <span aria-hidden="true">+</span>
              </Button>
            )}
            <span className="text-lg">{item.unit}</span>
          </div>
        </GroupField>

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
              aria-label={`${item.name}(${stock.location || "場所なし"})の期限をクリア`}
              onClick={() => dispatch({ type: "stock/patch", id, patch: { expiresInDays: null } })}
            >
              クリア
            </Button>
          </div>
        </Field>
      </Card>
    </li>
  );
}

export function ItemEditScreen() {
  const { items, stocks, nav } = useMockState();
  const today = useToday();
  const item = items.find((i) => i.id === nav.editItemId);
  const back = { stock: "/mock/stock/", supply: "/mock/supply/", masters: "/mock/masters/" }[nav.editFrom];
  const mine = item
    ? stocks
        .filter((s) => s.itemId === item.id)
        .slice()
        .sort((a, b) => (a.expiresInDays ?? Number.POSITIVE_INFINITY) - (b.expiresInDays ?? Number.POSITIVE_INFINITY))
    : [];

  return (
    <ScreenShell level="sub" active={nav.editFrom} backHref={back}>
      <PageTitle>品物の編集</PageTitle>
      {!item ? (
        <EmptyCard title="品物がありません" className="mt-4">
          「品物の登録」から追加できます。
        </EmptyCard>
      ) : (
        // 品物の名前を変えても draft が追いつくよう、品物ごとに作り直す
        <div className="mt-4 md:grid md:grid-cols-2 md:items-start md:gap-x-6">
          <div key={item.id}>
            <ItemCard item={item} />
            <RegularCard item={item} />
          </div>
          {item.kind === "food" && (
            <section className="mt-6 md:mt-0">
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
            </section>
          )}
        </div>
      )}
    </ScreenShell>
  );
}
