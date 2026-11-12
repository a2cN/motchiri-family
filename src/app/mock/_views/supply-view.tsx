"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "cn";
import { Card } from "../_lib/card";
import { MSG_OFFLINE, OfflineCard, RetryButton, StateCard, notify } from "../_lib/bits";
import { LEVEL_SYMBOL, NEXT_LEVEL, STOCKS, SUPPLIES, formatQty, supplyGenresOf, type Item, type Level } from "../_lib/data";
import { Frame } from "../_lib/frame";

// 日用品の画面(正典 docs/design/stock/ の mock-supply.png と同じ中身 + 状態。`ab250aa` の supply-view.tsx から写す。40_design_brief.md)。
// h1 の下に検索の欄とジャンルのチップ、その下に1枚のカードに行(登録順、ST-D02)。残量の行は1タップ、数の行は ± と数。

const ALL = "all";
const SAVE_FAILED = "保存できませんでした。電波のよい場所で、もう一度お試しください。";
/** 大文字・小文字、全角・半角の英数字は区別しない(OD-stock-uiux-31 A) */
const norm = (s: string) => s.normalize("NFKC").toLowerCase();
const initialQty = (): Record<string, number> => Object.fromEntries(STOCKS.filter((s) => SUPPLIES.some((i) => i.id === s.itemId)).map((s) => [s.itemId, s.qty]));

function NewItemLink({ className }: { className?: string }) {
  return (
    <Link href="/mock/item-new/?from=supply" className={cn(buttonVariants(), className)}>
      <span aria-hidden="true">＋</span>品物の登録
    </Link>
  );
}

export function SupplyView() {
  const state = useSearchParams().get("state") ?? "";
  const offline = state === "offline";
  const [items] = useState<Item[]>(() => (state === "item-gone" ? SUPPLIES.filter((i) => i.id !== "laundry") : SUPPLIES));
  const [levels, setLevels] = useState<Record<string, Level>>(() => Object.fromEntries(SUPPLIES.map((i) => [i.id, i.level])));
  const [qty, setQty] = useState<Record<string, number>>(() => ({ ...initialQty(), ...(state === "used-up" ? { shampoo: 0 } : {}) }));
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [composing, setComposing] = useState(false);
  const [chip, setChip] = useState(ALL);
  const searchRef = useRef<HTMLInputElement>(null);
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    if (state === "used-up") notify("シャンプーの詰め替えを使い切りました", { label: "元に戻す", onClick: () => setQty((q) => ({ ...q, shampoo: 1 })) });
    if (state === "offline") notify(MSG_OFFLINE);
    if (state === "save-failed") notify(`食器用洗剤を${SAVE_FAILED}`);
    if (state === "item-gone") notify("洗濯用洗剤は、もう削除されていました");
  }, [state]);

  const guard = (fn: () => void) => () => (offline ? notify(MSG_OFFLINE) : fn());

  const change = (item: Item, delta: number) => {
    const now = qty[item.id] ?? 0;
    const next = Math.round((now + delta) * 10) / 10;
    if (next > 0) {
      setQty((q) => ({ ...q, [item.id]: next }));
      return;
    }
    // 数で管理の日用品は 0 で止まる。行は残る(OD-stock-uiux-42)。「使い切りました」+「元に戻す」
    setQty((q) => ({ ...q, [item.id]: 0 }));
    notify(`${item.name}を使い切りました`, { label: "元に戻す", onClick: () => setQty((q) => ({ ...q, [item.id]: now })) });
  };

  const frame = { back: "top", tabs: true, active: "supply", title: "日用品" } as const;
  if (state === "error") {
    return (
      <Frame {...frame}>
        <StateCard title="つながりませんでした" className="mt-4 md:w-[calc(50%-0.5rem)]" action={<RetryButton />}>
          通信できなかったため、日用品を読み込めませんでした。電波のよい場所で、もう一度お試しください。
        </StateCard>
      </Frame>
    );
  }

  const genres = supplyGenresOf(items);
  const activeChip = chip !== ALL && genres.includes(chip) ? chip : ALL;
  const q = norm(query.trim());
  const shown = items.filter((s) => (q === "" || norm(s.name).includes(q)) && (activeChip === ALL || s.genre === activeChip));
  const filtering = q !== "" || activeChip !== ALL;
  const condition = [activeChip !== ALL ? `「${activeChip}」` : "", q !== "" ? `「${query.trim()}」` : ""];
  const conditionText = activeChip !== ALL && q !== "" ? `${condition[0]}で${condition[1]}` : condition.join("");
  const clear = () => {
    setText("");
    setQuery("");
    setChip(ALL);
    searchRef.current?.focus();
  };
  // 変換中は絞らない。確定してから絞る(IME。OD-stock-food-10 A の延長)
  const onText = (value: string, isComposing: boolean) => {
    setText(value);
    if (!isComposing) setQuery(value);
  };

  return (
    <Frame {...frame} navFrom="supply" headerRight={<NewItemLink className="hidden md:inline-flex" />} bar={<NewItemLink className="w-full" />}>
      {offline && <OfflineCard subject="日用品" className="mt-4" />}
      {items.length === 0 ? (
        <StateCard title="日用品はまだありません" className="mt-4">
          「品物の登録」で、種別を日用品にして追加できます。
        </StateCard>
      ) : (
        <>
          <div role="search" className="mt-4">
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
              <Label htmlFor="supply-search" className="sr-only">
                品物名で探す
              </Label>
              <Input
                ref={searchRef}
                id="supply-search"
                type="search"
                autoComplete="off"
                placeholder="品物名で探す"
                className="pr-12 pl-10 [&::-webkit-search-cancel-button]:appearance-none"
                value={text}
                onChange={(e) => onText(e.target.value, composing)}
                onCompositionStart={() => setComposing(true)}
                onCompositionEnd={(e) => {
                  setComposing(false);
                  onText(e.currentTarget.value, false);
                }}
              />
              {text !== "" && (
                <Button type="button" variant="ghost" size="icon" aria-label="検索をクリア" className="absolute top-1/2 right-0.5 -translate-y-1/2" onClick={() => onText("", false)}>
                  <X aria-hidden="true" className="size-5" />
                </Button>
              )}
            </div>
            {genres.length > 0 && (
              <div className="-mx-4 mt-2 overflow-x-auto pl-4 [scrollbar-width:none] md:-mx-6 md:pl-6 [&::-webkit-scrollbar]:hidden">
                <ToggleGroup aria-label="ジャンルで絞る" className="w-max flex-nowrap pr-4 md:pr-6" value={[activeChip]} onValueChange={(v) => setChip(v[0] ?? ALL)}>
                  <ToggleGroupItem value={ALL}>すべて</ToggleGroupItem>
                  {genres.map((g) => (
                    <ToggleGroupItem key={g} value={g}>
                      {g}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            )}
          </div>
          <p className="mt-2 text-base text-muted-foreground" aria-live="polite">
            {filtering ? `${shown.length}件 / ${items.length}件` : `${items.length}件`}
          </p>
          {shown.length === 0 ? (
            <Card as="section" className="mt-2">
              <p className="text-base">{conditionText}に合う日用品はありません</p>
              <Button type="button" variant="ghost" size="text" className="mt-1 -ml-3" onClick={clear}>
                条件をクリア
              </Button>
            </Card>
          ) : (
            <Card as="section" className="mt-2">
              <ul className="md:grid md:grid-cols-2 md:gap-x-8">
                {shown.map((item) => (
                  <SupplyRow
                    key={item.id}
                    item={item}
                    level={levels[item.id] ?? item.level}
                    quantity={qty[item.id] ?? 0}
                    offline={offline}
                    onCycle={guard(() => setLevels((l) => ({ ...l, [item.id]: NEXT_LEVEL[l[item.id] ?? item.level] })))}
                    onChange={(d) => guard(() => change(item, d))()}
                  />
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </Frame>
  );
}

function SupplyRow({ item, level, quantity, offline, onCycle, onChange }: { item: Item; level: Level; quantity: number; offline: boolean; onCycle: () => void; onChange: (d: number) => void }) {
  const sub = [item.genre, item.note].filter((x) => x !== "").join(" · ");
  const variant = { full: "ok", low: "warn", out: "alert" } as const;
  return (
    <li className="flex min-h-16 items-center justify-between gap-3 border-t border-border first:border-t-0 md:[&:nth-child(2)]:border-t-0">
      <Link href={`/mock/item-edit/?id=${item.id}&from=supply`} aria-label={`${item.name}を編集`} className="block min-h-16 min-w-0 flex-1 py-2 text-foreground no-underline active:bg-accent">
        <div className="text-lg font-strong break-words">{item.name}</div>
        {sub && <div className="truncate text-base text-muted-foreground">{sub}</div>}
      </Link>
      {item.tracking === "level" ? (
        <Button
          type="button"
          variant={variant[level]}
          size="level"
          aria-label={`${item.name}の残量 ${LEVEL_SYMBOL[level]}。押すと ${LEVEL_SYMBOL[NEXT_LEVEL[level]]} にする`}
          aria-disabled={offline || undefined}
          onClick={onCycle}
        >
          {LEVEL_SYMBOL[level]}
        </Button>
      ) : (
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="secondary" size="icon" aria-label={`${item.name}を1つ減らす`} aria-disabled={offline || quantity <= 0 || undefined} onClick={() => quantity > 0 && onChange(-1)}>
            <span aria-hidden="true">−</span>
          </Button>
          <span className="inline-block min-w-[4em] text-center text-lg tabular-nums">
            {formatQty(quantity)} {item.unit}
          </span>
          <Button type="button" variant="secondary" size="icon" aria-label={`${item.name}を1つ増やす`} aria-disabled={offline || undefined} onClick={() => onChange(1)}>
            <span aria-hidden="true">+</span>
          </Button>
        </div>
      )}
    </li>
  );
}
