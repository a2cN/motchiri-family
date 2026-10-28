"use client";

import { Search, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { isCountUnit } from "../_data/master";
import type { Item } from "../_data/types";
import { supplyGenres, totalOf, useMockDispatch, useMockState } from "../_state/mock-state";
import { Card, EmptyCard } from "./card";
import { NewItemLink } from "./new-item-link";
import { withUnit } from "./quantity";
import { QuantityStepper } from "./quantity-stepper";
import { PageTitle, ScreenShell } from "./screen-frame";
import { StockLevelButton } from "./stock-level-button";
import { EditLink } from "./stock-view";
import { showUndo } from "./undo";

// 日用品(40_design_brief.md rev3「日用品」)。h1 の下に検索の欄とジャンルのチップ、その下に1枚のカードに行(登録順、ST-D02)。
// 行は管理のしかたで振る舞う: 残量で管理は残量のボタン、数で管理は ± と数(OD-stock-uiux-33・42)。
// 順送りで戻せるので残量の変更に「元に戻す」は出さない。

const ALL = "all";

/** 大文字・小文字、全角・半角の英数字は区別しない。ひらがなとカタカナ・漢字の読みは区別する(OD-stock-uiux-31 A) */
const norm = (s: string) => s.normalize("NFKC").toLowerCase();

function SupplyRow({ item }: { item: Item }) {
  const state = useMockState();
  const dispatch = useMockDispatch();
  const quantity = totalOf(state.stocks, item.id);
  const sub = [item.genre, item.note].filter((x) => x !== "").join(" · ");

  const change = (delta: number) => {
    const next = Math.round((quantity + delta) * 10) / 10;
    if (next > 0) {
      dispatch({ type: "supply/set", itemId: item.id, quantity: next });
      return;
    }
    // 数で管理の日用品は 0 で止まる。行は残る(OD-stock-uiux-42)。「使い切りました」+「元に戻す」
    dispatch({ type: "supply/set", itemId: item.id, quantity: 0 });
    showUndo(`${item.name}を使い切りました`, () => dispatch({ type: "supply/set", itemId: item.id, quantity }));
  };

  return (
    <li className="flex min-h-16 items-center justify-between gap-3 border-t border-border first:border-t-0 md:nth-2:border-t-0">
      <EditLink item={item} from="supply" className="block min-h-16 min-w-0 flex-1 py-2 text-foreground no-underline active:bg-accent">
        <div className="text-lg font-strong break-words">{item.name}</div>
        {sub && <div className="truncate text-base text-muted-foreground">{sub}</div>}
      </EditLink>
      {item.tracking === "level" ? (
        <StockLevelButton name={item.name} level={item.stockLevel} onCycle={() => dispatch({ type: "level/cycle", itemId: item.id })} />
      ) : isCountUnit(state.masters, item.unit) ? (
        <QuantityStepper
          name={item.name}
          display={withUnit(quantity, item.unit, true)}
          decreaseDisabled={quantity <= 0}
          onDecrease={() => change(-1)}
          onIncrease={() => change(1)}
        />
      ) : (
        <span className="shrink-0 text-lg tabular-nums">{withUnit(quantity, item.unit, true)}</span>
      )}
    </li>
  );
}

export function SupplyView() {
  const { items } = useMockState();
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState(ALL);
  const supplies = items.filter((i) => i.kind === "supply");
  const genres = supplyGenres(items);
  // 選んでいた語が候補から消えた(品物を削除した、など)ときは「すべて」に戻る
  const activeChip = chip !== ALL && genres.includes(chip) ? chip : ALL;

  if (supplies.length === 0) {
    return (
      <EmptyCard title="日用品はまだありません" className="mt-4">
        「品物の登録」で、種別を日用品にして追加できます。
      </EmptyCard>
    );
  }

  const q = norm(query.trim());
  const shown = supplies.filter((s) => (q === "" || norm(s.name).includes(q)) && (activeChip === ALL || s.genre === activeChip));
  const filtering = q !== "" || activeChip !== ALL;
  const condition = [activeChip !== ALL ? `「${activeChip}」` : "", q !== "" ? `「${query.trim()}」` : ""];
  const conditionText = activeChip !== ALL && q !== "" ? `${condition[0]}で${condition[1]}` : condition.join("");
  const clear = () => {
    setQuery("");
    setChip(ALL);
  };

  return (
    <>
      <div role="search" className="mt-4">
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
          <Label htmlFor="supply-search" className="sr-only">
            品物名で探す
          </Label>
          <Input
            id="supply-search"
            type="search"
            autoComplete="off"
            placeholder="品物名で探す"
            className="pr-12 pl-10 [&::-webkit-search-cancel-button]:appearance-none"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query !== "" && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="検索をクリア"
              className="absolute top-1/2 right-0.5 -translate-y-1/2"
              onClick={() => setQuery("")}
            >
              <X aria-hidden="true" className="size-5" />
            </Button>
          )}
        </div>
        {genres.length > 0 && (
          <div className="-mx-4 mt-2 overflow-x-auto pl-4 [scrollbar-width:none] md:-mx-6 md:pl-6 [&::-webkit-scrollbar]:hidden">
            <ToggleGroup
              aria-label="ジャンルで絞り込む"
              className="w-max flex-nowrap pr-4 md:pr-6"
              value={[activeChip]}
              onValueChange={(v) => setChip(v[0] ?? ALL)}
            >
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
        {filtering ? `${shown.length}件 / ${supplies.length}件` : `${supplies.length}件`}
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
            {shown.map((s) => (
              <SupplyRow key={s.id} item={s} />
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

export function SupplyScreen() {
  return (
    <ScreenShell level="top" active="supply" headerFrom="supply" bar={<NewItemLink from="supply" className="w-full" />}>
      <div className="flex items-center justify-between gap-3">
        <PageTitle>日用品</PageTitle>
        <NewItemLink from="supply" className="hidden md:inline-flex" />
      </div>
      <SupplyView />
    </ScreenShell>
  );
}
