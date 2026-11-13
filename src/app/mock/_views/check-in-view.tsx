"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Card } from "../_lib/card";
import { Field, GroupField, MSG_OFFLINE, NativeSelect, QtyField, RetryButton, StateCard, SupplyGenreField, notify } from "../_lib/bits";
import { GENRES, ITEMS, LOCATIONS, UNITS, isCountable, parseQty, supplyGenresOf, type Kind } from "../_lib/data";
import { Frame } from "../_lib/frame";
import { OfflineNote } from "../_lib/shopping-bits";

// 在庫登録(正典 ab250aa の check-in-view.tsx の形 + 3b の状態。40_design_brief.md)。チェック済みの 牛乳・シャンプーの詰め替え・バナナ のカード。

type Card3 = {
  id: string;
  name: string;
  itemId: string | null; // null = 新しい品物
  kind: Kind;
  genre: string;
  unit: string;
  qty: string;
  expires: string;
  location: string;
};

const INITIAL: Card3[] = [
  { id: "c-milk", name: "牛乳", itemId: "milk", kind: "food", genre: "卵・乳製品", unit: "本", qty: "1", expires: "2026-11-02", location: "冷蔵庫" },
  { id: "c-shampoo", name: "シャンプーの詰め替え", itemId: "shampoo", kind: "supply", genre: "お風呂", unit: "本", qty: "1", expires: "", location: "" },
  { id: "c-banana", name: "バナナ", itemId: null, kind: "food", genre: "", unit: "", qty: "1", expires: "", location: "" },
];
// 途中の失敗のあと、残ったカードが「入れた値のまま」残っていることが見えるよう、値を入れておく
const PARTIAL: Card3[] = [
  { ...INITIAL[1], qty: "2" },
  { ...INITIAL[2], genre: "野菜・果物", unit: "本", qty: "3", expires: "2026-10-28", location: "野菜室" },
];

function CountCard({ card, onEdit }: { card: Card3; onEdit: (p: Partial<Card3>) => void }) {
  const isNew = card.itemId === null;
  const food = card.kind === "food";
  const id = card.id;
  return (
    <li>
      <Card as="section" className="h-full">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-strong break-words" tabIndex={-1} data-card-name={id}>
            {card.name}
          </h3>
          {isNew ? <Badge variant="muted">新しい品物</Badge> : !food && <Badge variant="muted">日用品</Badge>}
        </div>
        {isNew && (
          <>
            <GroupField label="種別">
              <ToggleGroup joined aria-label={`${card.name}の種別`} value={[card.kind]} onValueChange={(v) => (v[0] === "food" || v[0] === "supply") && onEdit({ kind: v[0], genre: "", location: "", expires: "" })}>
                <ToggleGroupItem value="food">食材</ToggleGroupItem>
                <ToggleGroupItem value="supply">日用品</ToggleGroupItem>
              </ToggleGroup>
            </GroupField>
            <GroupField label="管理のしかた">
              <ToggleGroup aria-label={`${card.name}の管理のしかた`} value={["count"]} onValueChange={() => undefined}>
                <ToggleGroupItem value="count">数で管理</ToggleGroupItem>
                <ToggleGroupItem value="level">残量で管理</ToggleGroupItem>
              </ToggleGroup>
            </GroupField>
            {food ? (
              <Field label="ジャンル" htmlFor={`ci-${id}-genre`}>
                <NativeSelect id={`ci-${id}-genre`} value={card.genre} onChange={(e) => onEdit({ genre: e.target.value })}>
                  <option value="">選んでください</option>
                  {GENRES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            ) : (
              <SupplyGenreField id={`ci-${id}-genre`} value={card.genre} onChange={(genre) => onEdit({ genre })} candidates={supplyGenresOf(ITEMS)} />
            )}
            <GroupField label="単位">
              <ToggleGroup aria-label={`${card.name}の単位`} value={card.unit ? [card.unit] : []} onValueChange={(v) => v[0] && onEdit({ unit: v[0] })}>
                {UNITS.map((u) => (
                  <ToggleGroupItem key={u} value={u}>
                    {u}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </GroupField>
          </>
        )}
        <GroupField label="個数">
          <QtyField
            id={`ci-${id}-qty`}
            label={`${card.name}の個数`}
            value={card.qty}
            unit={card.unit}
            steppers={isCountable(card.unit)}
            onChange={(qty) => onEdit({ qty })}
            onBlur={() => undefined}
            onStep={(d) => {
              const r = parseQty(card.qty);
              const base = r.ok ? r.value : 0;
              const next = Math.round((base + d) * 10) / 10;
              if (next >= 1) onEdit({ qty: String(next) });
            }}
          />
        </GroupField>
        {food && (
          <Field label="期限" htmlFor={`ci-exp-${id}`}>
            <div className="flex items-center gap-2">
              <Input id={`ci-exp-${id}`} type="date" value={card.expires} onChange={(e) => onEdit({ expires: e.target.value })} />
              <Button type="button" variant="ghost" size="text" aria-label={`${card.name}の期限をクリア`} onClick={() => onEdit({ expires: "" })}>
                クリア
              </Button>
            </div>
          </Field>
        )}
        {food && (
          <GroupField label="場所">
            <ToggleGroup aria-label={`${card.name}の場所`} value={card.location ? [card.location] : []} onValueChange={(v) => v[0] && onEdit({ location: v[0] })}>
              {LOCATIONS.map((l) => (
                <ToggleGroupItem key={l} value={l}>
                  {l}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </GroupField>
        )}
        {isNew && <p className="mt-4 text-base text-muted-foreground">補充の目安は品物の編集で変えられます。</p>}
      </Card>
    </li>
  );
}

export function CheckInView() {
  const state = useSearchParams().get("state") ?? "";
  const offline = state === "offline";
  const [cards, setCards] = useState<Card3[]>(state === "partial-failed" ? PARTIAL : INITIAL);
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    if (state === "offline") notify(MSG_OFFLINE); // 「登録する」を押した直後の通知
    if (state === "partial-failed") {
      notify("1件を登録しました。シャンプーの詰め替えから先は登録できませんでした。もう一度お試しください。");
      document.querySelector<HTMLElement>('[data-card-name="c-shampoo"]')?.focus();
    }
  }, [state]);

  const back = "/mock/shopping-list/";
  if (state === "offline-nodata") {
    return (
      <Frame back="list" backHref={back} active="shopping-list" title="在庫に登録">
        <StateCard role="status" title="電波がありません" className="mt-4 md:w-[calc(50%-0.5rem)]" action={<RetryButton />}>
          在庫登録を開くには電波が要ります。電波のある所で、もう一度お試しください。
        </StateCard>
      </Frame>
    );
  }

  return (
    <Frame
      back="list"
      backHref={back}
      active="shopping-list"
      title="在庫に登録"
      barAllSizes
      bar={
        <Button type="button" className="w-full" onClick={() => (offline ? notify(MSG_OFFLINE) : notify("在庫に登録しました(モックでは保存しません)"))}>
          {cards.length}件を在庫に登録する
        </Button>
      }
    >
      {offline && <OfflineNote className="mt-4">在庫登録には電波が要ります。入力はできます。登録は電波のある所で押してください。</OfflineNote>}
      <p className="mt-2 text-base text-muted-foreground">チェックした品物を在庫に入れます。</p>
      <ul className="mt-4 grid gap-4 md:grid-cols-[repeat(auto-fill,minmax(21.25rem,1fr))]">
        {cards.map((c) => (
          <CountCard key={c.id} card={c} onEdit={(p) => setCards((all) => all.map((x) => (x.id === c.id ? { ...x, ...p } : x)))} />
        ))}
      </ul>
    </Frame>
  );
}
