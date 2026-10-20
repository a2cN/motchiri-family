"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ShoppingEntry, ShoppingSource } from "../_data/types";
import { useMockDispatch, useMockState } from "../_state/mock-state";
import { BottomBar } from "./screen-frame";
import { Card, EmptyCard } from "./card";
import { showUndo } from "./undo";

// 買い物リスト(40_design_brief.md「買い物リスト」)。

const SOURCE_BADGE: Record<ShoppingSource, { label: string; variant: "secondary" | "warn" | "alert" | "muted" }> = {
  regular: { label: "いつもの", variant: "secondary" },
  supply_low: { label: "残量△", variant: "warn" },
  supply_out: { label: "残量×", variant: "alert" },
  manual: { label: "手入力", variant: "muted" },
};

function Row({ entry }: { entry: ShoppingEntry }) {
  const { list } = useMockState();
  const dispatch = useMockDispatch();
  const badge = SOURCE_BADGE[entry.source];

  const remove = () => {
    const index = list.findIndex((e) => e.id === entry.id);
    dispatch({ type: "list/remove", id: entry.id });
    showUndo(`${entry.name}を外しました`, () => dispatch({ type: "list/restore", entry, index }));
  };

  return (
    <li className="flex min-h-14 items-center border-t border-border first:border-t-0">
      {/* 「外す」以外の行全体が label。押すとチェックの付け外し(1タップ、UX-01) */}
      <label className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2">
        <Checkbox checked={entry.checked} onCheckedChange={() => dispatch({ type: "list/toggle", id: entry.id })} />
        <span className={entry.checked ? "min-w-0 text-lg font-strong break-words text-muted-foreground line-through" : "min-w-0 text-lg font-strong break-words"}>
          {entry.name}
        </span>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </label>
      {/* 自動で載った項目だけ「外す」を置く。手入力の項目には置かない(ST-L02) */}
      {entry.source !== "manual" && (
        <Button type="button" variant="ghost" size="text" aria-label={`${entry.name}を外す`} onClick={remove}>
          外す
        </Button>
      )}
    </li>
  );
}

export function ShoppingListView() {
  const { list } = useMockState();
  const dispatch = useMockDispatch();
  const [name, setName] = useState("");

  const add = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    // 空白だけの名前は足さない。誤りの文言も出さない
    if (!trimmed) return;
    dispatch({ type: "list/add", name: trimmed });
    setName("");
  };

  return (
    <>
      <div className="mt-4">
        {list.length === 0 ? (
          <EmptyCard title="買い物リストは空です">下の入力欄から追加できます。</EmptyCard>
        ) : (
          <Card as="section">
            <ul>
              {list.map((e) => (
                <Row key={e.id} entry={e} />
              ))}
            </ul>
          </Card>
        )}
      </div>

      {/* 1巡目は押しても何もしない(check_in の画面は2巡目) */}
      <Button type="button" variant="secondary" className="mt-4 w-full">
        在庫に登録
      </Button>

      <BottomBar>
        <form onSubmit={add} className="flex items-center gap-3">
          <Label htmlFor="shopping-add" className="sr-only">
            品物名
          </Label>
          <Input id="shopping-add" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          <Button type="submit">追加</Button>
        </form>
      </BottomBar>
    </>
  );
}
