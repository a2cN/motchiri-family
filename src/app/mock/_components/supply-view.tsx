"use client";

import { useMockDispatch, useMockState } from "../_state/mock-state";
import { Card, EmptyCard } from "./card";
import { NewItemLink } from "./new-item-link";
import { PageTitle, ScreenShell } from "./screen-frame";
import { SupplyLevelButton } from "./supply-level-button";
import { EditLink } from "./stock-view";

// 日用品の残量(40_design_brief.md rev2「日用品の残量」)。1枚のカードに行(登録順、ST-D02)。順送りで戻せるので「元に戻す」は出さない。
export function SupplyView() {
  const { items } = useMockState();
  const dispatch = useMockDispatch();
  const supplies = items.filter((i) => i.kind === "supply");

  if (supplies.length === 0) {
    return (
      <EmptyCard title="日用品はまだありません" className="mt-4">
        「品物の登録」で、種別を日用品にして追加できます。
      </EmptyCard>
    );
  }
  return (
    <Card as="section" className="mt-4">
      <ul className="md:grid md:grid-cols-2 md:gap-x-8">
        {supplies.map((s) => (
          <li
            key={s.id}
            className="flex min-h-16 items-center justify-between gap-3 border-t border-border first:border-t-0 md:nth-2:border-t-0"
          >
            <EditLink item={s} from="supply" className="block min-h-16 min-w-0 flex-1 py-2 text-foreground no-underline active:bg-accent">
              <div className="text-lg font-strong break-words">{s.name}</div>
              {s.note && <div className="truncate text-base text-muted-foreground">{s.note}</div>}
            </EditLink>
            <SupplyLevelButton name={s.name} level={s.supplyLevel} onCycle={() => dispatch({ type: "supply/cycle", itemId: s.id })} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function SupplyScreen() {
  return (
    <ScreenShell level="top" active="supply" mastersFrom="supply" bar={<NewItemLink from="supply" className="w-full" />}>
      <div className="flex items-center justify-between gap-3">
        <PageTitle>日用品の残量</PageTitle>
        <NewItemLink from="supply" className="hidden md:inline-flex" />
      </div>
      <SupplyView />
    </ScreenShell>
  );
}
