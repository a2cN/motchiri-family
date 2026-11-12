"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { expiryStatus, formatDay } from "@/modules/stock/dates";
import { groupFoodStock } from "@/modules/stock/grouping";
import { regularRows, type RegularRow } from "@/modules/stock/items";
import { itemEditHref, itemNewHref } from "@/modules/stock/routes";
import { LEVEL_SYMBOL, LEVEL_VARIANT, NEXT_LEVEL } from "@/modules/stock/levels";
import { formatQuantity } from "@/modules/stock/quantity";
import type { Item, ItemStock } from "@/modules/stock/types";
import { cn } from "cn";
import { MSG_OFFLINE, OfflineCard, RetryButton, StateCard, notify } from "./bits";
import { Frame } from "./frame";
import { useLookup } from "./lookup";
import { useAfterDelay, useStock } from "./stock-provider";

// 食材の在庫の一覧(docs/design/stock/ の部分集合 + docs/design/stock-food/ の状態)。

type Mode = "location" | "genre";
const ROW = "flex min-h-16 items-center justify-between gap-3 border-t border-border first:border-t-0";
const LINK = "block min-h-16 min-w-0 flex-1 py-2 text-foreground no-underline active:bg-accent";
const TITLE = "もっちり倉庫";

function NewItemLink({ className }: { className?: string }) {
  return (
    <Link href={itemNewHref({ from: "stock" })} className={cn(buttonVariants(), className)}>
      <span aria-hidden="true">＋</span>品物の登録
    </Link>
  );
}

export function StockListView() {
  const { store, snapshot } = useStock();
  const { load, connection, data, today } = snapshot;
  const offline = connection === "offline";
  const [mode, setMode] = useState<Mode>("location");
  const lookup = useLookup(data);
  const groups = useMemo(() => groupFoodStock(data, mode), [data, mode]);
  const regulars = useMemo(() => regularRows(data), [data]);
  const showLoadingText = useAfterDelay(load === "loading", 1000);

  const guard = (fn: () => void) => () => (offline ? notify(MSG_OFFLINE) : fn());
  const withUndo = (handle: ReturnType<typeof store.step>) => {
    if (handle) notify(handle.label, { label: "元に戻す", onClick: handle.undo });
  };

  const frame = { back: "top", level: "top", active: "stock", title: TITLE } as const;
  if (load === "loading") {
    return (
      <Frame {...frame}>
        {showLoadingText && (
          <StateCard role="status" className="mt-4 md:w-[calc(50%-0.5rem)]">
            読み込んでいます…
          </StateCard>
        )}
      </Frame>
    );
  }
  if (load === "error") {
    return (
      <Frame {...frame}>
        {offline ? (
          <StateCard title="電波がありません" className="mt-4 md:w-[calc(50%-0.5rem)]" action={<RetryButton onClick={() => store.reload()} />}>
            在庫を読み込むには電波が要ります。電波のある所で、もう一度お試しください。
          </StateCard>
        ) : (
          <StateCard title="つながりませんでした" className="mt-4 md:w-[calc(50%-0.5rem)]" action={<RetryButton onClick={() => store.reload()} />}>
            通信できなかったため、在庫を読み込めませんでした。電波のよい場所で、もう一度お試しください。
          </StateCard>
        )}
      </Frame>
    );
  }

  return (
    <Frame {...frame} headerNav="stock" headerRight={<NewItemLink className="hidden md:inline-flex" />} bar={<NewItemLink className="w-full" />}>
      {offline && <OfflineCard className="mt-4" />}
      <div className="mt-4">
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
        {regulars.length > 0 && (
          <section className="card-border mb-4 break-inside-avoid rounded-lg bg-card p-4 text-card-foreground shadow-card md:p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-heading">いつもの</h2>
              <span className="text-base text-muted-foreground">{regulars.length}件</span>
            </div>
            <ul className="mt-1">
              {regulars.map((r) => (
                <RegularListRow key={r.item.id} row={r} unit={lookup.unitName(r.item)} />
              ))}
            </ul>
          </section>
        )}
        {groups.length === 0 && (
          <StateCard title="食材の在庫はありません" className="mb-4 break-inside-avoid">
            「品物の登録」から追加できます。
          </StateCard>
        )}
        {groups.map((g) => (
          <section key={g.key} className="card-border mb-4 break-inside-avoid rounded-lg bg-card p-4 text-card-foreground shadow-card md:p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-heading">{g.label}</h2>
              <span className="text-base text-muted-foreground">{g.rows.length}件</span>
            </div>
            <ul className="mt-1">
              {g.rows.map((r) =>
                r.kind === "count" ? (
                  <CountRow
                    key={r.stock.id}
                    stock={r.stock}
                    item={r.item}
                    unit={lookup.unitName(r.item)}
                    countable={lookup.isCountable(r.item)}
                    today={today}
                    onStep={(delta) => guard(() => withUndo(store.step(r.stock.id, delta)))()}
                  />
                ) : (
                  <LevelRow key={r.item.id} item={r.item} onCycle={guard(() => store.cycleLevel(r.item.id))} />
                ),
              )}
            </ul>
          </section>
        ))}
      </div>
    </Frame>
  );
}

function CountRow({
  stock, item, unit, countable, today, onStep,
}: {
  stock: ItemStock; item: Item; unit: string; countable: boolean; today: string; onStep: (delta: 1 | -1) => void;
}) {
  const status = expiryStatus(stock.expiresOn, today);
  const qty = `${formatQuantity(stock.quantity)}${unit}`;
  return (
    <li className={ROW}>
      <Link href={itemEditHref({ id: item.id, from: "stock" })} aria-label={`${item.name}を編集`} className={LINK}>
        <div className="text-lg font-strong break-words">{item.name}</div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-muted-foreground">
          <span>{stock.expiresOn ? `期限 ${formatDay(stock.expiresOn, today)}` : "期限なし"}</span>
          {status === "expired" && <Badge variant="alert">期限切れ</Badge>}
          {status === "soon" && <Badge variant="warn">期限間近</Badge>}
        </div>
      </Link>
      {countable ? (
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="secondary" size="icon" aria-label={`${item.name}を1減らす`} onClick={() => onStep(-1)}>
            <span aria-hidden="true">−</span>
          </Button>
          <span className="inline-block min-w-[4em] text-center text-lg tabular-nums">{qty}</span>
          <Button type="button" variant="secondary" size="icon" aria-label={`${item.name}を1増やす`} onClick={() => onStep(1)}>
            <span aria-hidden="true">+</span>
          </Button>
        </div>
      ) : (
        <span className="shrink-0 text-lg tabular-nums">{qty}</span>
      )}
    </li>
  );
}

function LevelRow({ item, onCycle }: { item: Item; onCycle: () => void }) {
  const level = item.stockLevel ?? "full";
  return (
    <li className={ROW}>
      <Link href={itemEditHref({ id: item.id, from: "stock" })} aria-label={`${item.name}を編集`} className={LINK}>
        <div className="text-lg font-strong break-words">{item.name}</div>
        <div className="text-base text-muted-foreground">残量で管理</div>
      </Link>
      <Button
        type="button"
        variant={LEVEL_VARIANT[level]}
        size="level"
        aria-label={`${item.name}の残量 ${LEVEL_SYMBOL[level]}。押すと ${LEVEL_SYMBOL[NEXT_LEVEL[level]]} にする`}
        onClick={onCycle}
      >
        {LEVEL_SYMBOL[level]}
      </Button>
    </li>
  );
}

// いつもの の行: 品物名、右に 在庫 / 在庫なし / 残量。± も残量のボタンも置かない(docs/design/stock/ の いつもの)
function RegularListRow({ row, unit }: { row: RegularRow; unit: string }) {
  return (
    <li className={ROW}>
      <Link href={itemEditHref({ id: row.item.id, from: "stock" })} aria-label={`${row.item.name}を編集`} className={LINK}>
        <div className="flex min-h-12 items-center text-lg font-strong break-words">{row.item.name}</div>
      </Link>
      {row.kind === "level" ? (
        <span className="shrink-0 text-lg">残量 {LEVEL_SYMBOL[row.level]}</span>
      ) : row.total > 0 ? (
        <span className="shrink-0 text-lg tabular-nums">在庫 {formatQuantity(row.total)}{unit}</span>
      ) : (
        <span className="shrink-0 text-base text-muted-foreground">在庫なし</span>
      )}
    </li>
  );
}
