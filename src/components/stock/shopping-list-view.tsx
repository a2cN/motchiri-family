"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { candidatesFor, checkedEntries } from "@/modules/shopping/list-view";
import type { ShoppingListEntry, ShoppingSource } from "@/modules/shopping/types";
import { checkInHref, shoppingMemoHref } from "@/modules/stock/routes";
import { cn } from "cn";
import { RetryButton, StateCard, loadStateBody, notify } from "./bits";
import { Card } from "./card";
import { Frame } from "./frame";
import { OFFLINE_BODY, OfflineNote, PendingLine } from "./shopping-bits";
import { useShopping } from "./shopping-provider";
import { useAfterDelay } from "./stock-provider";

// 買い物リストの画面(docs/design/stock/ の mock-shopping-list*.png と docs/design/stock-shopping/)。
// スマホ・iPad 縦: メモの入口 + リスト + 下の入力の帯。iPad 以上: リストの上に入力、右にメモ。行全体でチェック、右端の「外す」。

const SOURCE_BADGE: Record<ShoppingSource, { label: string; variant: "secondary" | "warn" | "alert" | "muted" }> = {
  regular: { label: "いつもの", variant: "secondary" },
  low: { label: "減った", variant: "warn" },
  out: { label: "切れた", variant: "alert" },
  manual: { label: "手入力", variant: "muted" },
  recipe: { label: "レシピ", variant: "muted" },
};
const TITLE = "買い物リスト";

/** 見えている方の入力欄にフォーカスを戻す(スマホは下の帯、iPad 以上はリストの上) */
function focusVisibleInput() {
  const el = ["shopping-add-bar", "shopping-add-row"].map((id) => document.getElementById(id)).find((e) => e && e.getClientRects().length > 0);
  el?.focus();
}

function Row({ entry, onToggle, onRemove }: { entry: ShoppingListEntry; onToggle: () => void; onRemove: () => void }) {
  const badge = SOURCE_BADGE[entry.source];
  return (
    <li className="flex items-center border-t border-border first:border-t-0">
      <label className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-2 md:min-h-14">
        <Checkbox checked={entry.isChecked} onCheckedChange={onToggle} />
        <span className="flex min-w-0 flex-col items-start gap-1 md:flex-row md:items-center md:gap-3">
          <span className={cn("min-w-0 text-lg font-strong break-words", entry.isChecked && "text-muted-foreground line-through")}>{entry.name}</span>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </span>
      </label>
      <Button type="button" variant="ghost" size="text" aria-label={`${entry.name}を外す`} onClick={onRemove}>
        外す
      </Button>
    </li>
  );
}

function AddForm({
  variant, name, setName, onAdd, candidates,
}: {
  variant: "bar" | "row";
  name: string;
  setName: (v: string) => void;
  onAdd: (v: string) => void;
  candidates: ReturnType<typeof candidatesFor>;
}) {
  const id = `shopping-add-${variant}`;
  return (
    <div className={variant === "row" ? "hidden border-b border-border pb-3 md:block" : "md:hidden"}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onAdd(name);
        }}
        className="flex items-center gap-3"
      >
        <Label htmlFor={id} className="sr-only">
          品物名
        </Label>
        <Input id={id} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} autoComplete="off" enterKeyHint="done" />
        {/* ボタンを押しても入力欄のフォーカスを外さない(外れると下のタブが戻って帯がずれ、押した指がボタンから外れる。続けて入力もできる) */}
        <Button type="submit" className="w-24" onMouseDown={(e) => e.preventDefault()}>
          追加
        </Button>
      </form>
      <p className="sr-only" aria-live="polite">
        {candidates.length > 0 ? `候補 ${candidates.length}件` : ""}
      </p>
      {candidates.length > 0 && (
        <div className={cn("card-border overflow-hidden rounded-lg bg-card", variant === "bar" ? "absolute inset-x-4 bottom-full mb-2" : "mt-2")} aria-label="品物名の候補" role="group">
          <ul>
            {candidates.map((m) => (
              <li key={m.id} className="border-t border-border first:border-t-0">
                <button
                  type="button"
                  className="flex min-h-12 w-full items-center px-4 text-left text-lg font-strong text-foreground outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring active:bg-accent"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onAdd(m.name)}
                >
                  {m.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ShoppingListView() {
  const { store, snapshot } = useShopping();
  const { load, connection, hasLocalCopy, entries, memo, candidates, pendingCount } = snapshot;
  const offline = connection === "offline";
  const [name, setName] = useState("");
  const showLoadingText = useAfterDelay(load === "loading", 1000);
  const stuck = useAfterDelay(pendingCount > 0 && connection === "online", 1000);

  const frame = { back: "top", level: "top", active: "shopping-list", title: TITLE, widthClass: "max-w-5xl" } as const;

  // 電波が無く、端末に写しも無い(ローカルが空。45 の決定 3 の A: 専用のカード。リスト・入力欄は出さない)
  if (offline && !hasLocalCopy) {
    return (
      <Frame {...frame}>
        <StateCard role="status" title="電波がありません" className="mt-4 md:w-[calc(50%-0.5rem)]" action={<RetryButton onClick={() => store.reload()} />}>
          この端末には、まだ買い物リストがありません。電波のある所で一度開くと、電波が無くても使えるようになります。
        </StateCard>
      </Frame>
    );
  }
  const state = loadStateBody({ load, offline: false, showLoadingText, noun: TITLE, onRetry: () => store.reload(), className: "mt-4 md:w-[calc(50%-0.5rem)]" });
  if (state !== null) return <Frame {...frame}>{state}</Frame>;

  const body = memo?.body ?? "";
  const matches = candidatesFor(name, candidates);

  const add = (value: string) => {
    const r = store.addManual(value);
    if (r.ok) {
      setName("");
      return;
    }
    if (r.reason === "duplicate") {
      // 足さずに入力欄に残す(45 の決定 4 A)
      notify(`「${r.name}」は、もうリストにあります`);
      focusVisibleInput();
    }
  };
  const remove = (entry: ShoppingListEntry) => {
    const handle = store.dismiss(entry.id);
    if (handle) notify(handle.label, { label: "元に戻す", onClick: handle.undo });
  };
  const checkedCount = checkedEntries(entries).length;

  return (
    <Frame {...frame} keepBarWhileTyping bar={<AddForm variant="bar" name={name} setName={setName} onAdd={add} candidates={matches} />}>
      {offline && (
        <OfflineNote className="mt-4" pending={pendingCount}>
          {OFFLINE_BODY}
        </OfflineNote>
      )}
      {!offline && stuck && <PendingLine className="mt-4" count={pendingCount} />}
      <div className="mt-4 md:grid md:grid-cols-[1fr_17.5rem] md:gap-4 lg:grid-cols-[1fr_20rem]">
        <div>
          <Link
            href={shoppingMemoHref()}
            className="card-border mb-4 flex min-h-16 items-center justify-between gap-3 rounded-lg bg-card p-4 text-card-foreground no-underline active:bg-accent md:hidden"
          >
            <span className="min-w-0">
              <span className="block text-lg font-heading">買い物メモ</span>
              <span className="line-clamp-2 block text-base whitespace-pre-line text-muted-foreground">{body.trim() ? body : "まだ何も書いていません"}</span>
            </span>
            <span aria-hidden="true" className="text-xl text-muted-foreground">
              ›
            </span>
          </Link>
          {entries.length === 0 && (
            <StateCard title="買い物リストは空です" className="mb-4">
              入力欄から品物を追加できます。
            </StateCard>
          )}
          <Card as="section" className={cn(entries.length === 0 && "hidden md:block")}>
            <AddForm variant="row" name={name} setName={setName} onAdd={add} candidates={matches} />
            <ul>
              {entries.map((e) => (
                <Row key={e.id} entry={e} onToggle={() => store.toggle(e.id)} onRemove={() => remove(e)} />
              ))}
            </ul>
          </Card>
          {checkedCount > 0 && (
            <div className="mt-4 md:flex md:justify-end">
              <Link href={checkInHref()} className={cn(buttonVariants({ variant: "secondary" }), "w-full md:w-60")}>
                在庫に登録({checkedCount}件)
              </Link>
            </div>
          )}
        </div>
        <Card as="section" className="hidden min-h-80 flex-col md:flex">
          <h2 className="text-lg font-heading">買い物メモ</h2>
          <Textarea aria-label="買い物メモ" className="mt-2 min-h-56 flex-1 rounded-lg" value={body} maxLength={10_000} onChange={(e) => store.setMemo(e.target.value)} />
        </Card>
      </div>
    </Frame>
  );
}
