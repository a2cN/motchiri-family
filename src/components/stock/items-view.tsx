"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { groupItemsByGenre } from "@/modules/stock/items";
import { MSG_OFFLINE, OfflineCard, StateCard, loadStateBody, notify } from "./bits";
import { Card } from "./card";
import { Frame } from "./frame";
import { useAfterDelay, useStock } from "./stock-provider";

// 品物の一覧(docs/design/stock/ の「品物の一覧」の run 2 の部分集合: 食材だけ、補充の目安なし。docs/design/stock-master/)。
export function ItemsView() {
  const { store, snapshot } = useStock();
  const { load, connection, data } = snapshot;
  const offline = connection === "offline";
  const groups = useMemo(() => groupItemsByGenre(data), [data]);
  const showLoadingText = useAfterDelay(load === "loading", 1000);
  const guard = (fn: () => void) => () => (offline ? notify(MSG_OFFLINE) : fn());

  const stateBody = loadStateBody({ load, offline, showLoadingText, noun: "品物", onRetry: () => store.reload(), className: "mt-4 md:w-[calc(50%-0.5rem)]" });
  if (stateBody !== null) return <Frame back="list" title="品物の一覧">{stateBody}</Frame>;

  const remove = (itemId: string) => {
    const handle = store.deleteItem(itemId);
    if (handle) notify(handle.label, { label: "元に戻す", onClick: handle.undo });
  };

  return (
    <Frame back="list" title="品物の一覧">
      {offline && <OfflineCard subject="品物" className="mt-4" />}
      {groups.length === 0 ? (
        <StateCard title="品物はありません" className="mt-4">
          「品物の登録」から追加できます。
        </StateCard>
      ) : (
        <div className="mt-4 md:columns-2 md:gap-4">
          {groups.map((g) => (
            <Card as="section" key={g.genreId} className="mb-4 break-inside-avoid">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-heading">{g.label}</h2>
                <span className="text-base text-muted-foreground">{g.items.length}件</span>
              </div>
              <ul className="mt-1">
                {g.items.map((item) => (
                  <li key={item.id} className="flex min-h-16 items-center justify-between gap-2 border-t border-border first:border-t-0">
                    <Link
                      href={`/stock/item-edit/?id=${item.id}&from=items`}
                      aria-label={`${item.name}を編集`}
                      className="block min-h-16 min-w-0 flex-1 py-2 text-foreground no-underline active:bg-accent"
                    >
                      <div className="text-lg font-strong break-words">{item.name}</div>
                      <div className="text-base text-muted-foreground">{item.tracking === "count" ? "数で管理" : "残量で管理"}</div>
                    </Link>
                    <div className="flex shrink-0 items-center gap-1">
                      <Toggle
                        aria-label={`${item.name}をいつものにする`}
                        pressed={item.isRegular}
                        aria-disabled={offline || undefined}
                        onPressedChange={(v) => guard(() => store.setRegular(item.id, v))()}
                        className="h-11"
                      >
                        <span aria-hidden="true" className="hidden group-aria-pressed/toggle:inline">
                          ✓
                        </span>
                        いつもの
                      </Toggle>
                      <Button type="button" variant="ghost" size="text" aria-label={`${item.name}を削除`} aria-disabled={offline || undefined} onClick={guard(() => remove(item.id))}>
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
