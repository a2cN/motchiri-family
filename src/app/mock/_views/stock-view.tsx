"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "cn";
import { MSG_OFFLINE, OfflineCard, RetryButton, StateCard, notify } from "../_lib/bits";
import {
  GENRES, ITEMS, LEVEL_SYMBOL, LOCATIONS, NEXT_LEVEL, NO_LOCATION, STOCKS, byExpiry, expiryStatus, formatDay, isCountable, withUnit,
  type Item, type Level, type Stock,
} from "../_lib/data";
import { Frame } from "../_lib/frame";

// 食材の在庫の一覧(正典 docs/design/stock/ の部分集合 + 状態。40_design_brief.md)。

type Mode = "location" | "genre";
const ROW = "flex min-h-16 items-center justify-between gap-3 border-t border-border first:border-t-0";
const LINK = "block min-h-16 min-w-0 flex-1 py-2 text-foreground no-underline active:bg-accent";
const itemOf = (id: string) => ITEMS.find((i) => i.id === id)!;
const NEW_FAILED = "保存できませんでした。電波のよい場所で、もう一度お試しください。";

type Row = { kind: "count"; stock: Stock; item: Item } | { kind: "level"; item: Item };

function NewItemLink({ className }: { className?: string }) {
  return (
    <Link href="/mock/item-new/" className={cn(buttonVariants(), className)}>
      <span aria-hidden="true">＋</span>品物の登録
    </Link>
  );
}

export function StockView() {
  const state = useSearchParams().get("state") ?? "";
  const offline = state === "offline" || state === "offline-tap";
  const [mode, setMode] = useState<Mode>(state === "genre" ? "genre" : "location");
  const [stocks, setStocks] = useState<Stock[]>(() => {
    if (state === "empty") return [];
    if (state === "undo") return STOCKS.filter((s) => s.id !== "s-milk1");
    if (state === "gone") return STOCKS.filter((s) => s.id !== "s-natto");
    return STOCKS;
  });
  const [levels, setLevels] = useState<Record<string, Level>>({ mayo: "full", soy: "low" });
  const fired = useRef(false);

  const restoreMilk = () => setStocks(STOCKS);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    if (state === "undo") notify("牛乳を使い切りました", { label: "元に戻す", onClick: restoreMilk });
    if (state === "save-failed") notify(`ヨーグルトを${NEW_FAILED}`);
    if (state === "gone") notify("納豆は、もう使い切られていました");
    if (state === "offline-tap") notify(MSG_OFFLINE);
  }, [state]);

  const guard = (fn: () => void) => () => (offline ? notify(MSG_OFFLINE) : fn());

  const change = (stock: Stock, delta: number) => {
    const next = Math.round((stock.qty + delta) * 10) / 10;
    if (next > 0) {
      setStocks((all) => all.map((s) => (s.id === stock.id ? { ...s, qty: next } : s)));
      return;
    }
    const index = stocks.findIndex((s) => s.id === stock.id);
    setStocks((all) => all.filter((s) => s.id !== stock.id));
    notify(`${itemOf(stock.itemId).name}を使い切りました`, {
      label: "元に戻す",
      onClick: () =>
        setStocks((all) => {
          const copy = [...all];
          copy.splice(Math.min(index, copy.length), 0, stock);
          return copy;
        }),
    });
  };

  if (state === "loading") {
    return (
      <Frame back="top" title="もっちり倉庫">
        <StateCard role="status" className="mt-4 md:w-[calc(50%-0.5rem)]">読み込んでいます…</StateCard>
      </Frame>
    );
  }
  if (state === "error") {
    return (
      <Frame back="top" title="もっちり倉庫">
        <StateCard title="つながりませんでした" className="mt-4 md:w-[calc(50%-0.5rem)]" action={<RetryButton />}>
          通信できなかったため、在庫を読み込めませんでした。電波のよい場所で、もう一度お試しください。
        </StateCard>
      </Frame>
    );
  }
  if (state === "offline-error") {
    return (
      <Frame back="top" title="もっちり倉庫">
        <StateCard title="電波がありません" className="mt-4 md:w-[calc(50%-0.5rem)]" action={<RetryButton />}>
          在庫を読み込むには電波が要ります。電波のある所で、もう一度お試しください。
        </StateCard>
      </Frame>
    );
  }

  const rows: Row[] = state === "empty"
    ? []
    : [
        ...stocks.flatMap((stock): Row[] => [{ kind: "count", stock, item: itemOf(stock.itemId) }]),
        ...ITEMS.filter((i) => i.tracking === "level").map((item): Row => ({ kind: "level", item })),
      ];
  const keyOf = (r: Row) => (mode === "location" ? (r.kind === "count" ? r.stock.location : r.item.location) : r.item.genre);
  const keys = mode === "location" ? [...LOCATIONS, ""] : GENRES;
  const groups = keys
    .map((key) => {
      const own = rows.filter((r) => keyOf(r) === key);
      const counts = own.filter((r): r is Extract<Row, { kind: "count" }> => r.kind === "count").sort((a, b) => byExpiry(a.stock, b.stock));
      return { key, rows: [...counts, ...own.filter((r) => r.kind === "level")] };
    })
    .filter((g) => g.rows.length > 0);

  return (
    <Frame
      back="top"
      title="もっちり倉庫"
      headerRight={<NewItemLink className="hidden md:inline-flex" />}
      bar={<NewItemLink className="w-full" />}
    >
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
        {groups.length === 0 && (
          <StateCard title="食材の在庫はありません" className="mb-4 break-inside-avoid">
            「品物の登録」から追加できます。
          </StateCard>
        )}
        {groups.map((g) => (
          <section key={g.key} className="card-border mb-4 break-inside-avoid rounded-lg bg-card p-4 text-card-foreground shadow-card md:p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-heading">{g.key || NO_LOCATION}</h2>
              <span className="text-base text-muted-foreground">{g.rows.length}件</span>
            </div>
            <ul className="mt-1">
              {g.rows.map((r) =>
                r.kind === "count" ? (
                  <CountRow key={r.stock.id} stock={r.stock} item={r.item} onChange={(d) => guard(() => change(r.stock, d))()} />
                ) : (
                  <LevelRow
                    key={r.item.id}
                    item={r.item}
                    level={levels[r.item.id] ?? r.item.level}
                    onCycle={guard(() => setLevels((l) => ({ ...l, [r.item.id]: NEXT_LEVEL[l[r.item.id] ?? r.item.level] })))}
                  />
                ),
              )}
            </ul>
          </section>
        ))}
      </div>
    </Frame>
  );
}

function CountRow({ stock, item, onChange }: { stock: Stock; item: Item; onChange: (delta: number) => void }) {
  const status = expiryStatus(stock.expires);
  return (
    <li className={ROW}>
      <Link href={`/mock/item-edit/?id=${item.id}`} aria-label={`${item.name}を編集`} className={LINK}>
        <div className="text-lg font-strong break-words">{item.name}</div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-muted-foreground">
          <span>{stock.expires ? `期限 ${formatDay(stock.expires)}` : "期限なし"}</span>
          {status === "expired" && <Badge variant="alert">期限切れ</Badge>}
          {status === "soon" && <Badge variant="warn">期限間近</Badge>}
        </div>
      </Link>
      {isCountable(item.unit) ? (
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="secondary" size="icon" aria-label={`${item.name}を1減らす`} onClick={() => onChange(-1)}>
            <span aria-hidden="true">−</span>
          </Button>
          <span className="inline-block min-w-[4em] text-center text-lg tabular-nums">{withUnit(stock.qty, item.unit)}</span>
          <Button type="button" variant="secondary" size="icon" aria-label={`${item.name}を1増やす`} onClick={() => onChange(1)}>
            <span aria-hidden="true">+</span>
          </Button>
        </div>
      ) : (
        <span className="shrink-0 text-lg tabular-nums">{withUnit(stock.qty, item.unit)}</span>
      )}
    </li>
  );
}

function LevelRow({ item, level, onCycle }: { item: Item; level: Level; onCycle: () => void }) {
  const variant = { full: "ok", low: "warn", out: "alert" } as const;
  return (
    <li className={ROW}>
      <Link href={`/mock/item-edit/?id=${item.id}`} aria-label={`${item.name}を編集`} className={LINK}>
        <div className="text-lg font-strong break-words">{item.name}</div>
        <div className="text-base text-muted-foreground">残量で管理</div>
      </Link>
      <Button
        type="button"
        variant={variant[level]}
        size="level"
        aria-label={`${item.name}の残量 ${LEVEL_SYMBOL[level]}。押すと ${LEVEL_SYMBOL[NEXT_LEVEL[level]]} にする`}
        onClick={onCycle}
      >
        {LEVEL_SYMBOL[level]}
      </Button>
    </li>
  );
}

