"use client";

import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Item } from "../_data/types";
import { snapshotOf, supplyGenres, useMockDispatch, useMockState } from "../_state/mock-state";
import { Card, EmptyCard } from "./card";
import { PageTitle, ScreenShell } from "./screen-frame";
import { restockLabel } from "./restock-field";
import { EditLink } from "./stock-view";
import { showUndo } from "./undo";

// 品物の一覧(40_design_brief.md rev3「品物の一覧」、OD-stock-uiux-36 A・19 A)。
// 食材 / 日用品を切り替え、ジャンルごとのカード。行には いつもの の切り替えと「削除」だけを置く。
// 名前・ジャンル・管理のしかたの変更は、品物名から開く品物の編集で行う。

function ItemRow({ item }: { item: Item }) {
  const state = useMockState();
  const dispatch = useMockDispatch();

  const remove = () => {
    const before = snapshotOf(state);
    const related =
      state.stocks.some((s) => s.itemId === item.id) ||
      state.list.some((e) => e.itemId === item.id || (e.source === "manual" && e.name === item.name));
    dispatch({ type: "item/delete", id: item.id });
    showUndo(
      related ? `${item.name}を削除しました。在庫と買い物リストからも消えました` : `${item.name}を削除しました`,
      () => dispatch({ type: "data/restore", snapshot: before }),
    );
  };

  return (
    <li className="flex min-h-16 items-center justify-between gap-2 border-t border-border first:border-t-0">
      <EditLink item={item} from="items" className="block min-h-16 min-w-0 flex-1 py-2 text-foreground no-underline active:bg-accent">
        <div className="text-lg font-strong break-words">{item.name}</div>
        <div className="text-base text-muted-foreground">
          {item.tracking === "count" ? "数で管理" : "残量で管理"} · {restockLabel(item)}
        </div>
      </EditLink>
      <div className="flex shrink-0 items-center gap-1">
        <Toggle
          aria-label={`${item.name}をいつものにする`}
          pressed={item.isRegular}
          onPressedChange={(v) => dispatch({ type: "item/regular", id: item.id, value: v })}
          className="h-11"
        >
          <span aria-hidden="true" className="hidden group-aria-pressed/toggle:inline">
            ✓
          </span>
          いつもの
        </Toggle>
        <Button type="button" variant="ghost" size="text" aria-label={`${item.name}を削除`} onClick={remove}>
          削除
        </Button>
      </div>
    </li>
  );
}

export function ItemsView() {
  const { items, masters, nav } = useMockState();
  const dispatch = useMockDispatch();
  const kind = nav.itemsKind;
  const mine = items.filter((i) => i.kind === kind);

  // まとまり: 食材はマスタのジャンルの順、日用品は使われた語の順。ジャンルの無い日用品は末尾の「ジャンルなし」
  const keys = kind === "food" ? masters.genres.map((g) => g.name) : [...supplyGenres(items), ""];
  const groups = keys
    .map((key) => ({ key, rows: mine.filter((i) => i.genre === key) }))
    .filter((g) => g.rows.length > 0);

  return (
    <>
      <div className="mt-3 flex items-center justify-between gap-3">
        <ToggleGroup
          joined
          aria-label="品物の種別"
          value={[kind]}
          onValueChange={(v) => {
            if (v[0] === "food" || v[0] === "supply") dispatch({ type: "nav/itemsKind", kind: v[0] });
          }}
        >
          <ToggleGroupItem value="food">食材</ToggleGroupItem>
          <ToggleGroupItem value="supply">日用品</ToggleGroupItem>
        </ToggleGroup>
        <span className="text-base text-muted-foreground" aria-live="polite">
          {mine.length}件
        </span>
      </div>

      {mine.length === 0 ? (
        <EmptyCard title="品物はありません" className="mt-4">
          「品物の登録」から追加できます。
        </EmptyCard>
      ) : (
        <div className="mt-4 md:columns-2 md:gap-4">
          {groups.map((g) => (
            <Card as="section" key={g.key} className="mb-4 break-inside-avoid">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-heading">{g.key || "ジャンルなし"}</h2>
                <span className="text-base text-muted-foreground">{g.rows.length}件</span>
              </div>
              <ul className="mt-1">
                {g.rows.map((item) => (
                  <ItemRow key={item.id} item={item} />
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

export function ItemsScreen() {
  const { nav } = useMockState();
  return (
    <ScreenShell level="sub" active="items" backHref={nav.itemsFrom === "supply" ? "/mock/supply/" : "/mock/stock/"}>
      <PageTitle>品物の一覧</PageTitle>
      <ItemsView />
    </ScreenShell>
  );
}
