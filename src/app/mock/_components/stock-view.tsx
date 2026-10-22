"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { NO_LOCATION_LABEL, isCountUnit } from "../_data/master";
import type { Item, Stock } from "../_data/types";
import { useMockDispatch, useMockState } from "../_state/mock-state";
import { Card, EmptyCard } from "./card";
import { expiryStatus, formatDay, useToday } from "./dates";
import { NewItemLink } from "./new-item-link";
import { QuantityStepper } from "./quantity-stepper";
import { PageTitle, ScreenShell } from "./screen-frame";
import { showUndo } from "./undo";

// 食材の在庫(場所別の在庫の一覧。40_design_brief.md rev2「食材の在庫」)。
// まとまりの並び: いつもの → 場所(または ジャンル)。日用品は置かない(自分の画面)。在庫の無い場所・ジャンルのまとまりは出さない。

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
  from: "stock" | "supply" | "masters";
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

function sortByExpiry(rows: { stock: Stock; item: Item }[]) {
  // 期限の近い順、期限なしは末尾(ST-F07)
  return rows
    .slice()
    .sort((a, b) => (a.stock.expiresInDays ?? Number.POSITIVE_INFINITY) - (b.stock.expiresInDays ?? Number.POSITIVE_INFINITY));
}

function FoodRow({ stock, item, today }: { stock: Stock; item: Item; today: Date | null }) {
  const state = useMockState();
  const dispatch = useMockDispatch();
  const status = expiryStatus(stock.expiresInDays, today);

  const change = (delta: number) => {
    if (stock.quantity + delta > 0) {
      dispatch({ type: "stock/set", id: stock.id, quantity: stock.quantity + delta });
      return;
    }
    // 0 になったら行が消えて「元に戻す」(UX-04)。同じ位置に戻る
    const index = state.stocks.findIndex((s) => s.id === stock.id);
    dispatch({ type: "stock/remove", id: stock.id });
    showUndo(`${item.name}を使い切りました`, () => dispatch({ type: "stock/restore", stock, index }), state.settings.undoSeconds);
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
      {isCountUnit(item.unit) ? (
        <QuantityStepper
          name={item.name}
          quantity={stock.quantity}
          unit={item.unit}
          onDecrease={() => change(-1)}
          onIncrease={() => change(1)}
        />
      ) : (
        // g・ml は文字だけ(+1/−1 なし、ST-F05。数の変更は品物の編集で)
        <span className="shrink-0 text-lg tabular-nums">
          {stock.quantity}
          {item.unit}
        </span>
      )}
    </li>
  );
}

function RegularRow({ item }: { item: Item }) {
  const { stocks } = useMockState();
  // 在庫は場所を問わない合計。+1/−1 は置かない(在庫が複数に分かれうるため)
  const total = stocks.filter((s) => s.itemId === item.id).reduce((sum, s) => sum + s.quantity, 0);
  const LEVEL = { full: "○", low: "△", out: "×" } as const;
  return (
    <li className={ROW}>
      <EditLink item={item} from="stock" className={LINK}>
        <div className="flex min-h-12 items-center text-lg font-strong break-words">{item.name}</div>
      </EditLink>
      {item.kind === "supply" ? (
        <span className="shrink-0 text-lg">残量 {LEVEL[item.supplyLevel]}</span>
      ) : total > 0 ? (
        <span className="shrink-0 text-lg tabular-nums">
          在庫 {total}
          {item.unit}
        </span>
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

  const rows = stocks.flatMap((stock) => {
    const item = items.find((i) => i.id === stock.itemId);
    return item ? [{ stock, item }] : [];
  });
  const keys: string[] = mode === "location" ? [...masters.locations.map((l) => l.name), ""] : masters.genres.map((g) => g.name);
  const groups = keys
    .map((key) => ({
      key,
      rows: sortByExpiry(rows.filter((r) => (mode === "location" ? r.stock.location : r.item.genre) === key)),
    }))
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
            {g.rows.map((r) => (
              <FoodRow key={r.stock.id} stock={r.stock} item={r.item} today={today} />
            ))}
          </GroupCard>
        ))}
      </div>
    </>
  );
}

export function StockScreen() {
  return (
    <ScreenShell level="top" active="stock" mastersFrom="stock" bar={<NewItemLink from="stock" className="w-full" />}>
      <div className="flex items-center justify-between gap-3">
        <PageTitle>もっちり倉庫</PageTitle>
        <NewItemLink from="stock" className="hidden md:inline-flex" />
      </div>
      <StockView />
    </ScreenShell>
  );
}
