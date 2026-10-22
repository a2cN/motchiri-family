"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "cn";
import type { ShoppingEntry, ShoppingSource } from "../_data/types";
import { findCandidates, useMockDispatch, useMockState } from "../_state/mock-state";
import { Card, EmptyCard } from "./card";
import { PageTitle, ScreenShell } from "./screen-frame";
import { showUndo } from "./undo";

// 買い物リスト(40_design_brief.md rev2「買い物リスト」)。

const SOURCE_BADGE: Record<ShoppingSource, { label: string; variant: "secondary" | "warn" | "alert" | "muted" }> = {
  regular: { label: "いつもの", variant: "secondary" },
  supply_low: { label: "残量△", variant: "warn" },
  supply_out: { label: "残量×", variant: "alert" },
  manual: { label: "手入力", variant: "muted" },
};

function Row({ entry }: { entry: ShoppingEntry }) {
  const { list, settings } = useMockState();
  const dispatch = useMockDispatch();
  const badge = SOURCE_BADGE[entry.source];

  const remove = () => {
    const index = list.findIndex((e) => e.id === entry.id);
    dispatch({ type: "list/remove", id: entry.id });
    showUndo(`${entry.name}を外しました`, () => dispatch({ type: "list/restore", entry, index }), settings.undoSeconds);
  };

  return (
    <li className="flex items-center border-t border-border first:border-t-0">
      {/* 「外す」以外の行全体が label。押すとチェックの付け外し(1タップ、UX-01)。スマホは発生元の印を品物名の下の行に置く */}
      <label className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-2 md:min-h-14">
        <Checkbox checked={entry.checked} onCheckedChange={() => dispatch({ type: "list/toggle", id: entry.id })} />
        <span className="flex min-w-0 flex-col items-start gap-1 md:flex-row md:items-center md:gap-3">
          <span className={cn("min-w-0 text-lg font-strong break-words", entry.checked && "text-muted-foreground line-through")}>
            {entry.name}
          </span>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </span>
      </label>
      {/* 手入力の項目にも「外す」を置く(OD-stock-uiux-16 の提案 A) */}
      <Button type="button" variant="ghost" size="text" aria-label={`${entry.name}を外す`} onClick={remove}>
        外す
      </Button>
    </li>
  );
}

// 入力欄 + 追加。スマホは下の帯の中、iPad はリストのカードの一番上の行。候補は入力欄に重ならない位置に出す
function AddForm({
  variant,
  name,
  setName,
}: {
  variant: "bar" | "row";
  name: string;
  setName: (v: string) => void;
}) {
  const { items } = useMockState();
  const dispatch = useMockDispatch();
  const id = `shopping-add-${variant}`;
  const matches = findCandidates(items, name).slice(0, 4);

  const add = (value: string) => {
    const trimmed = value.trim();
    // 空白だけの名前は足さない。誤りの文言も出さない
    if (!trimmed) return;
    dispatch({ type: "list/add", name: trimmed });
    setName("");
  };

  const suggestions =
    matches.length > 0 ? (
      <div
        className={cn(
          "card-border overflow-hidden rounded-lg bg-card",
          variant === "bar" ? "absolute inset-x-4 bottom-full mb-2" : "mt-2",
        )}
        aria-label="品物名の候補"
        role="group"
      >
        <ul>
          {matches.map((m) => (
            <li key={m.id} className="border-t border-border first:border-t-0">
              <button
                type="button"
                className="flex min-h-12 w-full items-center px-4 text-left text-lg font-strong text-foreground outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring active:bg-accent"
                onClick={() => add(m.name)}
              >
                {m.name}
              </button>
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <div className={variant === "row" ? "hidden border-b border-border pb-3 md:block" : "md:hidden"}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          add(name);
        }}
        className="flex items-center gap-3"
      >
        <Label htmlFor={id} className="sr-only">
          品物名
        </Label>
        <Input id={id} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        <Button type="submit" className="w-24">
          追加
        </Button>
      </form>
      <p className="sr-only" aria-live="polite">
        {matches.length > 0 ? `候補 ${matches.length}件` : ""}
      </p>
      {suggestions}
    </div>
  );
}

function MemoEntrance() {
  const { memo } = useMockState();
  return (
    <Link
      href="/mock/shopping-memo/"
      className="card-border mb-4 flex min-h-16 items-center justify-between gap-3 rounded-lg bg-card p-4 text-card-foreground no-underline active:bg-accent md:hidden"
    >
      <span className="min-w-0">
        <span className="block text-lg font-heading">買い物メモ</span>
        <span className="line-clamp-2 block text-base whitespace-pre-line text-muted-foreground">
          {memo.trim() ? memo : "まだ何も書いていません"}
        </span>
      </span>
      <span aria-hidden="true" className="text-xl text-muted-foreground">
        ›
      </span>
    </Link>
  );
}

function MemoCard() {
  const { memo } = useMockState();
  const dispatch = useMockDispatch();
  return (
    <Card as="section" className="hidden min-h-80 flex-col md:flex">
      <h2 className="text-lg font-heading">買い物メモ</h2>
      <Textarea
        aria-label="買い物メモ"
        className="mt-2 min-h-56 flex-1 rounded-lg"
        value={memo}
        onChange={(e) => dispatch({ type: "memo/set", value: e.target.value })}
      />
    </Card>
  );
}

export function ShoppingListScreen() {
  const { list, settings } = useMockState();
  const [name, setName] = useState("");

  const ordered =
    settings.checkedOrder === "bottom"
      ? [...list.filter((e) => !e.checked), ...list.filter((e) => e.checked).sort((a, b) => a.checkedSeq - b.checkedSeq)]
      : list;
  const checkedCount = list.filter((e) => e.checked).length;

  return (
    <ScreenShell level="top" active="shopping-list" bar={<AddForm variant="bar" name={name} setName={setName} />}>
      <PageTitle>買い物リスト</PageTitle>
      <div className="mt-4 md:grid md:grid-cols-[1fr_17.5rem] md:gap-4 lg:grid-cols-[1fr_20rem]">
        <div>
          <MemoEntrance />
          {list.length === 0 && (
            <EmptyCard title="買い物リストは空です" className="mb-4">
              入力欄から品物を追加できます。
            </EmptyCard>
          )}
          <Card as="section" className={cn(list.length === 0 && "hidden md:block")}>
            <AddForm variant="row" name={name} setName={setName} />
            <ul>
              {ordered.map((e) => (
                <Row key={e.id} entry={e} />
              ))}
            </ul>
          </Card>
          {checkedCount > 0 && (
            <div className="mt-4 md:flex md:justify-end">
              <Link href="/mock/check-in/" className={cn(buttonVariants({ variant: "secondary" }), "w-full md:w-60")}>
                在庫に登録({checkedCount}件)
              </Link>
            </div>
          )}
        </div>
        <MemoCard />
      </div>
    </ScreenShell>
  );
}

export function ShoppingMemoScreen() {
  const { memo } = useMockState();
  const dispatch = useMockDispatch();
  return (
    <ScreenShell level="sub" active="shopping-list" backHref="/mock/shopping-list/" widthClass="max-w-[40rem]">
      <PageTitle>買い物メモ</PageTitle>
      <Label htmlFor="shopping-memo" className="sr-only">
        買い物メモ
      </Label>
      {/* 保存のボタンは置かない。打った内容はその場で状態に入る(本番での保存の時期は倉庫のタスク、UX-03) */}
      <Textarea
        id="shopping-memo"
        className="mt-4 min-h-[50dvh] rounded-lg"
        value={memo}
        onChange={(e) => dispatch({ type: "memo/set", value: e.target.value })}
      />
    </ScreenShell>
  );
}
