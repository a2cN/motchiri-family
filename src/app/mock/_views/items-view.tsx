"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { Card } from "../_lib/card";
import { MSG_OFFLINE, OfflineCard, StateCard, notify } from "../_lib/bits";
import { GENRE_NAMES, ITEMS, REGULAR_IDS, type Item } from "../_lib/data";
import { Frame } from "../_lib/frame";

// 品物の一覧(run 2 の部分集合。`ab250aa` の items-view.tsx から、「食材 / 日用品」の切り替えと「 · 目安 …」を除いたもの。40_design_brief.md 決定 1 (2)(3) A)。

export function ItemsView() {
  const state = useSearchParams().get("state") ?? "";
  const offline = state === "offline";
  const [items, setItems] = useState<Item[]>(() => {
    if (state === "empty") return [];
    if (state === "undo" || state === "undo-failed") return ITEMS.filter((i) => i.id !== "milk");
    return ITEMS;
  });
  const [regular, setRegular] = useState<string[]>(REGULAR_IDS);
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    if (state === "undo") notify("牛乳を削除しました", { label: "元に戻す", onClick: () => setItems(ITEMS) });
    if (state === "undo-failed") notify("牛乳を元に戻せませんでした");
  }, [state]);

  const guard = (fn: () => void) => () => (offline ? notify(MSG_OFFLINE) : fn());
  const remove = (item: Item) => {
    const before = items;
    setItems((all) => all.filter((i) => i.id !== item.id));
    notify(`${item.name}を削除しました`, { label: "元に戻す", onClick: () => setItems(before) });
  };

  const groups = GENRE_NAMES.map((key) => ({ key, rows: items.filter((i) => i.genre === key) })).filter((g) => g.rows.length > 0);

  return (
    <Frame back="list" title="品物の一覧">
      {offline && <OfflineCard subject="品物" className="mt-4" />}
      {items.length === 0 ? (
        <StateCard title="品物はありません" className="mt-4">
          「品物の登録」から追加できます。
        </StateCard>
      ) : (
        <div className="mt-4 md:columns-2 md:gap-4">
          {groups.map((g) => (
            <Card as="section" key={g.key} className="mb-4 break-inside-avoid">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-heading">{g.key}</h2>
                <span className="text-base text-muted-foreground">{g.rows.length}件</span>
              </div>
              <ul className="mt-1">
                {g.rows.map((item) => (
                  <li key={item.id} className="flex min-h-16 items-center justify-between gap-2 border-t border-border first:border-t-0">
                    <Link
                      href={`/mock/item-edit/?id=${item.id}&from=items`}
                      aria-label={`${item.name}を編集`}
                      className="block min-h-16 min-w-0 flex-1 py-2 text-foreground no-underline active:bg-accent"
                    >
                      <div className="text-lg font-strong break-words">{item.name}</div>
                      <div className="text-base text-muted-foreground">{item.tracking === "count" ? "数で管理" : "残量で管理"}</div>
                    </Link>
                    <div className="flex shrink-0 items-center gap-1">
                      <Toggle
                        aria-label={`${item.name}をいつものにする`}
                        pressed={regular.includes(item.id)}
                        aria-disabled={offline || undefined}
                        onPressedChange={(v) => guard(() => setRegular((r) => (v ? [...r, item.id] : r.filter((x) => x !== item.id))))()}
                        className="h-11"
                      >
                        <span aria-hidden="true" className="hidden group-aria-pressed/toggle:inline">
                          ✓
                        </span>
                        いつもの
                      </Toggle>
                      <Button type="button" variant="ghost" size="text" aria-label={`${item.name}を削除`} aria-disabled={offline || undefined} onClick={guard(() => remove(item))}>
                        削除
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </Frame>
  );
}
