"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LEVEL_SYMBOL, LEVEL_VARIANT, NEXT_LEVEL } from "@/modules/stock/levels";
import { formatQuantity } from "@/modules/stock/quantity";
import { itemEditHref, itemNewHref } from "@/modules/stock/routes";
import { filterSupplyRows, supplyGenres, supplyRows, type SupplyRow } from "@/modules/stock/supply";
import { cn } from "cn";
import { MSG_OFFLINE, OfflineCard, StateCard, loadStateBody, notify } from "./bits";
import { Card } from "./card";
import { Frame } from "./frame";
import { useLookup } from "./lookup";
import { useAfterDelay, useStock } from "./stock-provider";

// 日用品の画面(docs/design/stock-supply/README.md、docs/design/stock/ の mock-supply*.png)。
// h1 の下に検索の欄とジャンルのチップ、その下に 1 枚のカードに行(登録順、ST-D02)。残量の行は 1 タップ、数の行は ± と数。

const ALL = "all";
const TITLE = "日用品";

function NewItemLink({ className }: { className?: string }) {
  return (
    <Link href={itemNewHref({ from: "supply" })} className={cn(buttonVariants(), className)}>
      <span aria-hidden="true">＋</span>品物の登録
    </Link>
  );
}

export function SupplyView() {
  const { store, snapshot } = useStock();
  const { load, connection, data } = snapshot;
  const offline = connection === "offline";
  const lookup = useLookup(data);
  const rows = useMemo(() => supplyRows(data), [data]);
  const genres = useMemo(() => supplyGenres(data), [data]);
  const showLoadingText = useAfterDelay(load === "loading", 1000);

  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [composing, setComposing] = useState(false);
  const [chip, setChip] = useState(ALL);
  const searchRef = useRef<HTMLInputElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const focusedChip = useRef<string | null>(null);

  // 選んでいたチップの語が、相手の変更で使われなくなったら黙って「すべて」に戻る(打っていた検索の語は残る)
  const activeChip = chip !== ALL && genres.includes(chip) ? chip : ALL;
  if (chip !== activeChip) setChip(activeChip);
  // フォーカスがそのチップにあったなら、「すべて」へ移す(消えた要素にはフォーカスが残らない)
  useEffect(() => {
    const focused = focusedChip.current;
    if (focused !== null && focused !== ALL && !genres.includes(focused)) {
      focusedChip.current = null;
      chipsRef.current?.querySelector<HTMLElement>(`[data-value="${ALL}"]`)?.focus();
    }
  }, [genres]);

  const guard = (fn: () => void) => () => (offline ? notify(MSG_OFFLINE) : fn());
  const withUndo = (handle: ReturnType<typeof store.stepSupply>) => {
    if (handle) notify(handle.label, { label: "元に戻す", onClick: handle.undo });
  };

  const frame = { back: "top", level: "top", active: "supply", title: TITLE } as const;
  const state = loadStateBody({
    load, offline, showLoadingText, noun: TITLE, onRetry: () => store.reload(), className: "mt-4 md:w-[calc(50%-0.5rem)]",
  });
  if (state !== null) return <Frame {...frame}>{state}</Frame>;

  const q = query.trim();
  const shown = filterSupplyRows(rows, query, activeChip === ALL ? null : activeChip);
  const filtering = q !== "" || activeChip !== ALL;
  const condition = [activeChip !== ALL ? `「${activeChip}」` : "", q !== "" ? `「${q}」` : ""];
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
    <Frame {...frame} headerNav="supply" headerRight={<NewItemLink className="hidden md:inline-flex" />} bar={<NewItemLink className="w-full" />}>
      {offline && <OfflineCard subject={TITLE} className="mt-4" />}
      {rows.length === 0 ? (
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
              <div
                ref={chipsRef}
                className="-mx-4 mt-2 overflow-x-auto pl-4 [scrollbar-width:none] md:-mx-6 md:pl-6 [&::-webkit-scrollbar]:hidden"
                onFocusCapture={(e) => {
                  focusedChip.current = (e.target as HTMLElement).dataset.value ?? null;
                }}
                onBlurCapture={() => {
                  // 要素が消えると blur が来ない端末があるので、フォーカスが外へ出たときだけ忘れる
                  focusedChip.current = null;
                }}
              >
                <ToggleGroup aria-label="ジャンルで絞る" className="w-max flex-nowrap pr-4 md:pr-6" value={[activeChip]} onValueChange={(v) => setChip(v[0] ?? ALL)}>
                  <ToggleGroupItem value={ALL} data-value={ALL}>すべて</ToggleGroupItem>
                  {genres.map((g) => (
                    <ToggleGroupItem key={g} value={g} data-value={g}>
                      {g}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            )}
          </div>
          <p className="mt-2 text-base text-muted-foreground" aria-live="polite">
            {filtering ? `${shown.length}件 / ${rows.length}件` : `${rows.length}件`}
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
                {shown.map((row) => (
                  <SupplyListRow
                    key={row.item.id}
                    row={row}
                    unit={lookup.unitName(row.item)}
                    countable={lookup.isCountable(row.item)}
                    offline={offline}
                    onCycle={guard(() => store.cycleLevel(row.item.id))}
                    onStep={(d) => guard(() => withUndo(store.stepSupply(row.item.id, d)))()}
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

function SupplyListRow({
  row, unit, countable, offline, onCycle, onStep,
}: {
  row: SupplyRow; unit: string; countable: boolean; offline: boolean; onCycle: () => void; onStep: (d: 1 | -1) => void;
}) {
  const { item } = row;
  const sub = [item.supplyGenre, item.note].filter((x): x is string => x !== null && x !== "").join(" · ");
  return (
    <li className="flex min-h-16 items-center justify-between gap-3 border-t border-border first:border-t-0 md:[&:nth-child(2)]:border-t-0">
      <Link
        href={itemEditHref({ id: item.id, from: "supply" })}
        aria-label={`${item.name}を編集`}
        className="block min-h-16 min-w-0 flex-1 py-2 text-foreground no-underline active:bg-accent"
      >
        <div className="text-lg font-strong break-words">{item.name}</div>
        {sub && <div className="truncate text-base text-muted-foreground">{sub}</div>}
      </Link>
      {row.kind === "level" ? (
        <Button
          type="button"
          variant={LEVEL_VARIANT[row.level]}
          size="level"
          aria-label={`${item.name}の残量 ${LEVEL_SYMBOL[row.level]}。押すと ${LEVEL_SYMBOL[NEXT_LEVEL[row.level]]} にする`}
          aria-disabled={offline || undefined}
          onClick={onCycle}
        >
          {LEVEL_SYMBOL[row.level]}
        </Button>
      ) : countable ? (
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label={`${item.name}を1つ減らす`}
            aria-disabled={offline || row.total <= 0 || undefined}
            onClick={() => row.total > 0 && onStep(-1)}
          >
            <span aria-hidden="true">−</span>
          </Button>
          <span className="inline-block min-w-[4em] text-center text-lg tabular-nums">
            {formatQuantity(row.total)} {unit}
          </span>
          <Button type="button" variant="secondary" size="icon" aria-label={`${item.name}を1つ増やす`} aria-disabled={offline || undefined} onClick={() => onStep(1)}>
            <span aria-hidden="true">+</span>
          </Button>
        </div>
      ) : (
        <span className="shrink-0 text-lg tabular-nums">
          {formatQuantity(row.total)} {unit}
        </span>
      )}
    </li>
  );
}
