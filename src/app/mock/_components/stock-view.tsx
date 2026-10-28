"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { NO_LOCATION_LABEL, isCountUnit } from "../_data/master";
import type { Item, ItemStock } from "../_data/types";
import { totalOf, useMockDispatch, useMockState } from "../_state/mock-state";
import { Card, EmptyCard } from "./card";
import { expiryStatus, formatDay, useToday } from "./dates";
import { NewItemLink } from "./new-item-link";
import { QuantityStepper } from "./quantity-stepper";
import { withUnit } from "./quantity";
import { PageTitle, ScreenShell } from "./screen-frame";
import { StockLevelButton } from "./stock-level-button";
import { showUndo } from "./undo";

// 食材の在庫(場所別の在庫の一覧。40_design_brief.md rev3「食材の在庫」)。
// まとまりの並び: いつもの → 場所(または ジャンル)。日用品の行は置かない(自分の画面。ただし いつもの の日用品は いつもの のカードに出る)。
// 在庫の無い場所・ジャンルのまとまりは出さない。行は管理のしかたで振る舞う: 数で管理は ±、残量で管理は残量のボタン(OD-stock-uiux-33・41)。

type Mode = "location" | "genre";

const ROW = "flex min-h-16 items-center justify-between gap-3 border-t border-border first:border-t-0";

function GroupCard({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <Card as="section" className="mb-4 break-inside-avoid">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-heading">{title}</h2>
        <span className="text-base text-muted-foreground">{count}件</span>
      </div>
      <ul className="mt-1">{children}</ul>
    </Card>
  );
}

/** 品物名のリンク(品物の編集へ)。読み上げる名前は「<品物名>を編集」 */
export function EditLink({
  item,
  from,
  className,
  children,
}: {
  item: Item;
  from: "stock" | "supply" | "items";
  className?: string;
  children: React.ReactNode;
}) {
  const dispatch = useMockDispatch();
  return (
    <Link
      href="/mock/item-edit/"
      aria-label={`${item.name}を編集`}
      className={className}
      onClick={() => dispatch({ type: "nav/edit", itemId: item.id, from })}
    >
      {children}
    </Link>
  );
}

const LINK = "block min-h-16 min-w-0 flex-1 py-2 text-foreground no-underline active:bg-accent";

type Row = { kind: "count"; stock: ItemStock; item: Item } | { kind: "level"; item: Item };

/** まとまりの中の並び: 期限の近い順 → 期限なしの数で管理の行 → 残量で管理の行(登録順)(ST-F07 の延長、OD-stock-uiux-41) */
function sortRows(rows: Row[]): Row[] {
  const counts = rows.filter((r): r is Extract<Row, { kind: "count" }> => r.kind === "count");
  const levels = rows.filter((r) => r.kind === "level");
  counts.sort((a, b) => (a.stock.expiresInDays ?? Number.POSITIVE_INFINITY) - (b.stock.expiresInDays ?? Number.POSITIVE_INFINITY));
  return [...counts, ...levels];
}

function CountRow({ stock, item, today }: { stock: ItemStock; item: Item; today: Date | null }) {
  const state = useMockState();
  const dispatch = useMockDispatch();
  const status = expiryStatus(stock.expiresInDays, today);

  const change = (delta: number) => {
    const next = Math.round((stock.quantity + delta) * 10) / 10;
    if (next > 0) {
      dispatch({ type: "stock/set", id: stock.id, quantity: next });
      return;
    }
    // 0 になったら(0.5 から − でも)行が消えて「元に戻す」(UX-04)。同じ位置に戻る
    const index = state.stocks.findIndex((s) => s.id === stock.id);
    dispatch({ type: "stock/remove", id: stock.id });
    showUndo(`${item.name}を使い切りました`, () => dispatch({ type: "stock/restore", stock, index }), 6);
  };

  return (
    <li className={ROW}>
      <EditLink item={item} from="stock" className={LINK}>
        <div className="text-lg font-strong break-words">{item.name}</div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-muted-foreground">
          {stock.expiresInDays === null ? (
            <span>期限なし</span>
          ) : (
            <span>期限 {today ? formatDay(today, stock.expiresInDays) : ""}</span>
          )}
          {status === "expired" && <Badge variant="alert">期限切れ</Badge>}
          {status === "soon" && <Badge variant="warn">期限間近</Badge>}
        </div>
      </EditLink>
      {isCountUnit(state.masters, item.unit) ? (
        <QuantityStepper
          name={item.name}
          display={withUnit(stock.quantity, item.unit)}
          onDecrease={() => change(-1)}
          onIncrease={() => change(1)}
        />
      ) : (
        // g・ml は文字だけ(+1/−1 なし、ST-F05。数の変更は品物の編集で)
        <span className="shrink-0 text-lg tabular-nums">{withUnit(stock.quantity, item.unit)}</span>
      )}
    </li>
  );
}

// 残量で管理の行(しょうゆ など)。品物名、その下に「残量で管理」、右に残量のボタン。期限の行は無い(OD-stock-uiux-41)
function LevelRow({ item }: { item: Item }) {
  const dispatch = useMockDispatch();
  return (
    <li className={ROW}>
      <EditLink item={item} from="stock" className={LINK}>
        <div className="text-lg font-strong break-words">{item.name}</div>
        <div className="text-base text-muted-foreground">残量で管理</div>
      </EditLink>
      <StockLevelButton name={item.name} level={item.stockLevel} onCycle={() => dispatch({ type: "level/cycle", itemId: item.id })} />
    </li>
  );
}

function RegularRow({ item }: { item: Item }) {
  const { stocks } = useMockState();
  // 在庫は場所を問わない合計。± も残量のボタンも置かない(在庫が複数に分かれうるため)
  const total = totalOf(stocks, item.id);
  const LEVEL = { full: "○", low: "△", out: "×" } as const;
  return (
    <li className={ROW}>
      <EditLink item={item} from="stock" className={LINK}>
        <div className="flex min-h-12 items-center text-lg font-strong break-words">{item.name}</div>
      </EditLink>
      {item.tracking === "level" ? (
        <span className="shrink-0 text-lg">残量 {LEVEL[item.stockLevel]}</span>
      ) : total > 0 ? (
        <span className="shrink-0 text-lg tabular-nums">在庫 {withUnit(total, item.unit)}</span>
      ) : (
        <span className="shrink-0 text-base text-muted-foreground">在庫なし</span>
      )}
    </li>
  );
}

export function StockView() {
  const { items, stocks, masters } = useMockState();
  const today = useToday();
  const [mode, setMode] = useState<Mode>("location");

  const rows: Row[] = [
    ...stocks.flatMap((stock): Row[] => {
      const item = items.find((i) => i.id === stock.itemId);
      return item && item.kind === "food" ? [{ kind: "count", stock, item }] : [];
    }),
    ...items.filter((i) => i.kind === "food" && i.tracking === "level").map((item): Row => ({ kind: "level", item })),
  ];
  const keyOf = (r: Row) => (mode === "location" ? (r.kind === "count" ? r.stock.location : r.item.location) : r.item.genre);
  const keys: string[] = mode === "location" ? [...masters.locations.map((l) => l.name), ""] : masters.genres.map((g) => g.name);
  const groups = keys
    .map((key) => ({ key, rows: sortRows(rows.filter((r) => keyOf(r) === key)) }))
    .filter((g) => g.rows.length > 0);
  const regulars = items.filter((i) => i.isRegular);

  return (
    <>
      <div className="mt-3">
        <ToggleGroup
          joined
          aria-label="まとまりの切り替え"
          value={[mode]}
          onValueChange={(v) => {
            if (v[0] === "location" || v[0] === "genre") setMode(v[0]);
          }}
        >
          <ToggleGroupItem value="location">場所別</ToggleGroupItem>
          <ToggleGroupItem value="genre">ジャンル別</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="mt-4 md:columns-2 md:gap-4">
        {/* 「いつもの」のまとまりは在庫が空でも消えない(ST-RG02)。いつもの が1件も無ければ出さない */}
        {regulars.length > 0 && (
          <GroupCard title="いつもの" count={regulars.length}>
            {regulars.map((r) => (
              <RegularRow key={r.id} item={r} />
            ))}
          </GroupCard>
        )}

        {groups.length === 0 && (
          <EmptyCard title="食材の在庫はありません" className="mb-4 break-inside-avoid">
            「品物の登録」から追加できます。
          </EmptyCard>
        )}

        {groups.map((g) => (
          <GroupCard key={g.key} title={g.key || NO_LOCATION_LABEL} count={g.rows.length}>
            {g.rows.map((r) =>
              r.kind === "count" ? <CountRow key={r.stock.id} stock={r.stock} item={r.item} today={today} /> : <LevelRow key={r.item.id} item={r.item} />,
            )}
          </GroupCard>
        ))}
      </div>
    </>
  );
}

export function StockScreen() {
  return (
    <ScreenShell level="top" active="stock" headerFrom="stock" bar={<NewItemLink from="stock" className="w-full" />}>
      <div className="flex items-center justify-between gap-3">
        <PageTitle>もっちり倉庫</PageTitle>
        <NewItemLink from="stock" className="hidden md:inline-flex" />
      </div>
      <StockView />
    </ScreenShell>
  );
}
