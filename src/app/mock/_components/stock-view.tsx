"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { GENRES, LOCATIONS, isCountUnit } from "../_data/master";
import { regulars } from "../_data/fixtures";
import type { FoodStock, SupplyItem } from "../_data/types";
import { useMockDispatch, useMockState } from "../_state/mock-state";
import { Card } from "./card";
import { expiryStatus, formatDay, useToday } from "./dates";
import { QuantityStepper } from "./quantity-stepper";
import { SupplyLevelButton } from "./supply-level-button";
import { showUndo } from "./undo";

// 場所別の在庫の一覧(40_design_brief.md「場所別の在庫の一覧」)。
// まとまりの並び: いつもの → 場所(または ジャンル) → 日用品。在庫の無い場所・ジャンルのまとまりは出さない。

type Mode = "location" | "genre";

const ROW = "flex min-h-16 items-center justify-between gap-3 border-t border-border py-2 first:border-t-0";

function GroupCard({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <Card as="section">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-heading">{title}</h2>
        <span className="text-base text-muted-foreground">{count}件</span>
      </div>
      <ul className="mt-1">{children}</ul>
    </Card>
  );
}

function sortByExpiry(foods: FoodStock[]): FoodStock[] {
  // 期限の近い順、期限なしは末尾(ST-F07)
  return foods
    .slice()
    .sort((a, b) => (a.expiresInDays ?? Number.POSITIVE_INFINITY) - (b.expiresInDays ?? Number.POSITIVE_INFINITY));
}

function FoodRow({ food, today }: { food: FoodStock; today: Date | null }) {
  const state = useMockState();
  const dispatch = useMockDispatch();
  const status = expiryStatus(food.expiresInDays);

  const change = (delta: number) => {
    if (food.quantity + delta > 0) {
      dispatch({ type: "food/adjust", id: food.id, delta });
      return;
    }
    // 0 になったら行が消えて「元に戻す」(UX-04)。同じ位置に戻る
    const index = state.foods.findIndex((f) => f.id === food.id);
    dispatch({ type: "food/remove", id: food.id });
    showUndo(`${food.name}を使い切りました`, () => dispatch({ type: "food/restore", food, index }));
  };

  return (
    <li className={ROW}>
      <div className="min-w-0 flex-1">
        <div className="text-lg font-strong break-words">{food.name}</div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-muted-foreground">
          {food.expiresInDays === null ? (
            <span>期限なし</span>
          ) : (
            <span>期限 {today ? formatDay(today, food.expiresInDays) : ""}</span>
          )}
          {status === "expired" && <Badge variant="alert">期限切れ</Badge>}
          {status === "soon" && <Badge variant="warn">期限間近</Badge>}
        </div>
      </div>
      {isCountUnit(food.unit) ? (
        <QuantityStepper
          name={food.name}
          quantity={food.quantity}
          unit={food.unit}
          onDecrease={() => change(-1)}
          onIncrease={() => change(1)}
        />
      ) : (
        // g・ml は文字だけ(+1/−1 なし、ST-F05)
        <span className="shrink-0 text-lg tabular-nums">
          {food.quantity}
          {food.unit}
        </span>
      )}
    </li>
  );
}

function RegularRow({ name, unit, foods }: { name: string; unit: string; foods: FoodStock[] }) {
  // 在庫は場所を問わない合計。+1/−1 は置かない(在庫が複数に分かれうるため)
  const total = foods.filter((f) => f.name === name).reduce((sum, f) => sum + f.quantity, 0);
  return (
    <li className={ROW}>
      <div className="min-w-0 flex-1 text-lg font-strong break-words">{name}</div>
      {total > 0 ? (
        <span className="shrink-0 text-lg tabular-nums">
          在庫 {total}
          {unit}
        </span>
      ) : (
        <span className="shrink-0 text-base text-muted-foreground">在庫なし</span>
      )}
    </li>
  );
}

function SupplyRow({ supply }: { supply: SupplyItem }) {
  const dispatch = useMockDispatch();
  return (
    <li className={ROW}>
      <div className="min-w-0 flex-1 text-lg font-strong break-words">{supply.name}</div>
      {/* 順送りで戻せるので「元に戻す」は出さない */}
      <SupplyLevelButton name={supply.name} level={supply.supplyLevel} onCycle={() => dispatch({ type: "supply/cycle", id: supply.id })} />
    </li>
  );
}

export function StockView() {
  const { foods, supplies } = useMockState();
  const today = useToday();
  const [mode, setMode] = useState<Mode>("location");

  const keys: readonly string[] = mode === "location" ? LOCATIONS : GENRES.map((g) => g.name);
  const groups = keys
    .map((key) => ({
      key,
      foods: sortByExpiry(foods.filter((f) => (mode === "location" ? f.location : f.genre) === key)),
    }))
    .filter((g) => g.foods.length > 0);

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

      <div className="mt-4 grid items-start gap-4 md:grid-cols-[repeat(auto-fill,minmax(21.25rem,1fr))]">
        {/* 「いつもの」のまとまりは空でも消えない(ST-RG02) */}
        <GroupCard title="いつもの" count={regulars.length}>
          {regulars.map((r) => (
            <RegularRow key={r.id} name={r.name} unit={r.unit} foods={foods} />
          ))}
        </GroupCard>

        {groups.map((g) => (
          <GroupCard key={g.key} title={g.key} count={g.foods.length}>
            {g.foods.map((f) => (
              <FoodRow key={f.id} food={f} today={today} />
            ))}
          </GroupCard>
        ))}

        <GroupCard title="日用品" count={supplies.length}>
          {supplies.map((s) => (
            <SupplyRow key={s.id} supply={s} />
          ))}
        </GroupCard>
      </div>
    </>
  );
}
