"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "cn";
import { Card } from "../_lib/card";
import { RetryButton, StateCard, notify } from "../_lib/bits";
import { ITEMS, LIST, MEMO, type Entry, type Source } from "../_lib/data";
import { Frame } from "../_lib/frame";
import { OfflineNote, PendingLine } from "../_lib/shopping-bits";

// 買い物リスト(正典 ab250aa の shopping-list-view.tsx の形 + 3b の状態。40_design_brief.md)。データはメモリの中だけ。

const SOURCE_BADGE: Record<Source, { label: string; variant: "secondary" | "warn" | "alert" | "muted" }> = {
  regular: { label: "いつもの", variant: "secondary" },
  low: { label: "減った", variant: "warn" },
  out: { label: "切れた", variant: "alert" },
  manual: { label: "手入力", variant: "muted" },
};
const noun = "買い物リスト";
const OFFLINE_BODY = "買い物リストとメモは、このまま使えます。変えたところは、電波が戻ると送ります。";

function focusVisibleInput() {
  const el = ["shopping-add-bar", "shopping-add-row"].map((id) => document.getElementById(id)).find((e) => e && e.getClientRects().length > 0);
  el?.focus();
}

function Row({ entry, onToggle, onRemove }: { entry: Entry; onToggle: () => void; onRemove: () => void }) {
  const badge = SOURCE_BADGE[entry.source];
  return (
    <li className="flex items-center border-t border-border first:border-t-0">
      <label className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-2 md:min-h-14">
        <Checkbox checked={entry.checked} onCheckedChange={onToggle} />
        <span className="flex min-w-0 flex-col items-start gap-1 md:flex-row md:items-center md:gap-3">
          <span className={cn("min-w-0 text-lg font-strong break-words", entry.checked && "text-muted-foreground line-through")}>{entry.name}</span>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </span>
      </label>
      <Button type="button" variant="ghost" size="text" aria-label={`${entry.name}を外す`} onClick={onRemove}>
        外す
      </Button>
    </li>
  );
}

function AddForm({ variant, name, setName, onAdd }: { variant: "bar" | "row"; name: string; setName: (v: string) => void; onAdd: (v: string) => void }) {
  const id = `shopping-add-${variant}`;
  const q = name.trim();
  const matches = q ? ITEMS.filter((i) => i.name.includes(q)).slice(0, 4) : [];
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
        <Input id={id} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" enterKeyHint="done" />
        <Button type="submit" className="w-24">
          追加
        </Button>
      </form>
      <p className="sr-only" aria-live="polite">
        {matches.length > 0 ? `候補 ${matches.length}件` : ""}
      </p>
      {matches.length > 0 && (
        <div className={cn("card-border overflow-hidden rounded-lg bg-card", variant === "bar" ? "absolute inset-x-4 bottom-full mb-2" : "mt-2")} aria-label="品物名の候補" role="group">
          <ul>
            {matches.map((m) => (
              <li key={m.id} className="border-t border-border first:border-t-0">
                <button
                  type="button"
                  className="flex min-h-12 w-full items-center px-4 text-left text-lg font-strong text-foreground outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring active:bg-accent"
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
  const state = useSearchParams().get("state") ?? "";
  const offline = state === "offline";
  const pending = state === "pending";
  const [entries, setEntries] = useState<Entry[]>(() => {
    if (state === "offline") {
      return [...LIST.map((e) => (e.id === "l2" ? { ...e, checked: true } : e)), { id: "l12", name: "豆乳", source: "manual" as const, checked: false, itemId: null }];
    }
    return LIST;
  });
  const [memo, setMemo] = useState(MEMO);
  const [name, setName] = useState(state === "duplicate" ? "卵" : state === "typing" ? "しょ" : "");
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    if (state === "duplicate") {
      notify("「卵」は、もうリストにあります");
      focusVisibleInput();
    }
    if (state === "typing") focusVisibleInput();
    if (state === "save-failed") notify("豆腐を保存できませんでした");
  }, [state]);

  if (state === "offline-empty" || state === "error") {
    return (
      <Frame back="top" tabs active="shopping-list" title={noun} widthClass="max-w-5xl">
        {state === "error" ? (
          <StateCard title="つながりませんでした" className="mt-4 md:w-[calc(50%-0.5rem)]" action={<RetryButton />}>
            通信できなかったため、買い物リストを読み込めませんでした。電波のよい場所で、もう一度お試しください。
          </StateCard>
        ) : (
          <StateCard role="status" title="電波がありません" className="mt-4 md:w-[calc(50%-0.5rem)]" action={<RetryButton />}>
            この端末には、まだ買い物リストがありません。電波のある所で一度開くと、電波が無くても使えるようになります。
          </StateCard>
        )}
      </Frame>
    );
  }

  const add = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (entries.some((e) => e.name === trimmed)) {
      notify(`「${trimmed}」は、もうリストにあります`);
      focusVisibleInput();
      return;
    }
    setEntries((all) => [...all, { id: `n-${Date.now()}`, name: trimmed, source: "manual", checked: false, itemId: null }]);
    setName("");
  };
  const remove = (entry: Entry) => {
    const index = entries.findIndex((e) => e.id === entry.id);
    setEntries((all) => all.filter((e) => e.id !== entry.id));
    notify(`${entry.name}を外しました`, {
      label: "元に戻す",
      onClick: () =>
        setEntries((all) => {
          const copy = [...all];
          copy.splice(Math.min(index, copy.length), 0, entry);
          return copy;
        }),
    });
  };
  const checkedCount = entries.filter((e) => e.checked).length;

  return (
    <Frame
      back="top"
      tabs
      active="shopping-list"
      title={noun}
      widthClass="max-w-5xl"
      keepBarWhileTyping
      bar={<AddForm variant="bar" name={name} setName={setName} onAdd={add} />}
    >
      {offline && (
        <OfflineNote className="mt-4" pending={2}>
          {OFFLINE_BODY}
        </OfflineNote>
      )}
      {pending && <PendingLine className="mt-4" count={1} />}
      <div className="mt-4 md:grid md:grid-cols-[1fr_17.5rem] md:gap-4 lg:grid-cols-[1fr_20rem]">
        <div>
          <Link
            href="/mock/shopping-memo/"
            className="card-border mb-4 flex min-h-16 items-center justify-between gap-3 rounded-lg bg-card p-4 text-card-foreground no-underline active:bg-accent md:hidden"
          >
            <span className="min-w-0">
              <span className="block text-lg font-heading">買い物メモ</span>
              <span className="line-clamp-2 block text-base whitespace-pre-line text-muted-foreground">{memo.trim() ? memo : "まだ何も書いていません"}</span>
            </span>
            <span aria-hidden="true" className="text-xl text-muted-foreground">
              ›
            </span>
          </Link>
          <Card as="section">
            <AddForm variant="row" name={name} setName={setName} onAdd={add} />
            <ul>
              {entries.map((e) => (
                <Row key={e.id} entry={e} onToggle={() => setEntries((all) => all.map((x) => (x.id === e.id ? { ...x, checked: !x.checked } : x)))} onRemove={() => remove(e)} />
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
        <Card as="section" className="hidden min-h-80 flex-col md:flex">
          <h2 className="text-lg font-heading">買い物メモ</h2>
          <Textarea aria-label="買い物メモ" className="mt-2 min-h-56 flex-1 rounded-lg" value={memo} onChange={(e) => setMemo(e.target.value)} />
        </Card>
      </div>
    </Frame>
  );
}

export function ShoppingMemoView() {
  const state = useSearchParams().get("state") ?? "";
  const offline = state === "offline";
  const [memo, setMemo] = useState(offline ? `${MEMO}\n牛乳は低脂肪` : MEMO);
  return (
    <Frame back="list" backHref="/mock/shopping-list/" active="shopping-list" title="買い物メモ" widthClass="max-w-[40rem]">
      {offline && (
        <OfflineNote className="mt-4" pending={1}>
          {OFFLINE_BODY}
        </OfflineNote>
      )}
      <Label htmlFor="shopping-memo" className="sr-only">
        買い物メモ
      </Label>
      <Textarea id="shopping-memo" className="mt-4 min-h-[50dvh] rounded-lg" value={memo} onChange={(e) => setMemo(e.target.value)} />
    </Frame>
  );
}
