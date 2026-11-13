"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Card } from "../_lib/card";
import { MSG_OFFLINE, OfflineCard, RetryButton, StateCard, notify } from "../_lib/bits";
import { ITEMS, MASTERS, STOCKS, type MasterEntry, type MasterKind } from "../_lib/data";
import { Frame } from "../_lib/frame";

// マスタ(`ab250aa` の masters-view.tsx から写し、状態を足したもの。40_design_brief.md「/mock/masters/」)。
type Masters = Record<MasterKind, MasterEntry[]>;
type Editing = { kind: MasterKind; name: string } | null;

const TITLE: Record<MasterKind, string> = { genres: "ジャンル", locations: "場所", units: "単位" };
const NEW_LABEL: Record<MasterKind, string> = { genres: "新しいジャンル", locations: "新しい場所", units: "新しい単位" };
const DUP = "同じ名前があります";

/** 使用中か(30 Data Model「固い参照」= `ab250aa` の usedBy)。在庫の無い品物もジャンルを使用中にする */
function isUsed(kind: MasterKind, name: string, forced: string[]): boolean {
  if (forced.includes(`${kind}:${name}`)) return true;
  if (kind === "genres") return ITEMS.some((i) => i.genre === name);
  if (kind === "locations") return STOCKS.some((s) => s.location === name) || ITEMS.some((i) => i.tracking === "level" && i.location === name);
  return ITEMS.some((i) => i.tracking === "count" && i.unit === name);
}

function initial(state: string): Masters {
  const copy: Masters = { genres: MASTERS.genres.map((e) => ({ ...e })), locations: MASTERS.locations.map((e) => ({ ...e })), units: MASTERS.units.map((e) => ({ ...e })) };
  // default-cleared: 場所「パントリー」(使用中でない)を消した直後。飲み物の既定の場所が「未選択」になっている
  if (state === "default-cleared") copy.genres = copy.genres.map((g) => (g.name === "飲み物" ? { ...g, defaultLocation: "" } : g));
  return copy;
}

export function MastersView() {
  const state = useSearchParams().get("state") ?? "";
  const offline = state === "offline" || state === "offline-tap";
  const [masters, setMasters] = useState<Masters>(() => initial(state));
  const [editing, setEditing] = useState<Editing>(null);
  const forced = state === "in-use" ? ["genres:魚"] : [];
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    if (state === "default-cleared") {
      notify("パントリーを削除しました", {
        label: "元に戻す",
        onClick: () =>
          setMasters((m) => ({
            ...m,
            locations: [...m.locations, { name: "パントリー", defaultLocation: "", countable: true }],
            genres: m.genres.map((g) => (g.name === "飲み物" ? { ...g, defaultLocation: "パントリー" } : g)),
          })),
      });
    }
    if (state === "in-use") notify("魚は使用中になったため、削除できませんでした");
    if (state === "name-taken") notify("同じ名前のジャンルがあるため、「乾物」を追加できませんでした");
    if (state === "offline-tap") notify(MSG_OFFLINE);
  }, [state]);

  const guard = (fn: () => void) => () => (offline ? notify(MSG_OFFLINE) : fn());

  if (state === "error") {
    return (
      <Frame back="list" active="masters" title="マスタ">
        <StateCard title="つながりませんでした" className="mt-4 md:w-[calc(50%-0.5rem)]" action={<RetryButton />}>
          通信できなかったため、マスタを読み込めませんでした。電波のよい場所で、もう一度お試しください。
        </StateCard>
      </Frame>
    );
  }

  const remove = (kind: MasterKind, entry: MasterEntry, index: number) => {
    setMasters((m) => ({ ...m, [kind]: m[kind].filter((e) => e.name !== entry.name) }));
    notify(`${entry.name}を削除しました`, {
      label: "元に戻す",
      onClick: () => setMasters((m) => ({ ...m, [kind]: [...m[kind].slice(0, index), entry, ...m[kind].slice(index)] })),
    });
  };

  return (
    <Frame back="list" active="masters" title="マスタ">
      {offline && <OfflineCard subject="マスタ" className="mt-4" />}
      <div className="mt-4 md:columns-2 md:gap-4">
        {(["genres", "locations", "units"] as const).map((kind) => (
          <Card as="section" key={kind} className="mb-4 break-inside-avoid">
            <h2 className="text-lg font-heading">{TITLE[kind]}</h2>
            <ul className="mt-1">
              {masters[kind].map((entry, index) => (
                <MasterRow
                  key={entry.name}
                  kind={kind}
                  entry={entry}
                  used={isUsed(kind, entry.name, forced)}
                  locations={masters.locations}
                  editing={editing}
                  setEditing={setEditing}
                  guard={guard}
                  onRemove={() => remove(kind, entry, index)}
                  existing={masters[kind].map((e) => e.name)}
                />
              ))}
              <AddRow kind={kind} guard={guard} existing={masters[kind].map((e) => e.name)} onAdd={(n) => setMasters((m) => ({ ...m, [kind]: [...m[kind], { name: n, defaultLocation: "", countable: true }] }))} />
            </ul>
          </Card>
        ))}
      </div>
    </Frame>
  );
}

function MasterRow({
  kind, entry, used, locations, editing, setEditing, guard, onRemove, existing,
}: {
  kind: MasterKind;
  entry: MasterEntry;
  used: boolean;
  locations: MasterEntry[];
  editing: Editing;
  setEditing: (e: Editing) => void;
  guard: (fn: () => void) => () => void;
  onRemove: () => void;
  existing: string[];
}) {
  const isEditing = editing?.kind === kind && editing.name === entry.name;
  const [name, setName] = useState(entry.name);
  const [loc, setLoc] = useState(entry.defaultLocation);
  const [countable, setCountable] = useState(entry.countable);
  const [error, setError] = useState<string | null>(null);

  if (isEditing) {
    return (
      <li className="border-t border-border py-3 first:border-t-0">
        <Input
          aria-label={`${entry.name}の名前`}
          value={name}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `master-err-${kind}` : undefined}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
        {error && (
          <p id={`master-err-${kind}`} className="mt-1 text-base text-destructive">
            {error}
          </p>
        )}
        {kind === "genres" && (
          <div className="mt-3">
            <div className="mb-1 text-base font-strong">既定の場所</div>
            <ToggleGroup aria-label={`${entry.name}の既定の場所`} value={loc ? [loc] : []} onValueChange={(v) => v[0] && setLoc(v[0])}>
              {locations.map((l) => (
                <ToggleGroupItem key={l.name} value={l.name}>
                  {l.name}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        )}
        {kind === "units" && (
          <div className="mt-3">
            <Toggle pressed={countable} onPressedChange={setCountable} aria-label={`${entry.name}を±で数える`}>
              <span aria-hidden="true" className="hidden group-aria-pressed/toggle:inline">
                ✓
              </span>
              ±で数える
            </Toggle>
          </div>
        )}
        <div className="mt-3 flex items-center gap-2">
          <Button
            type="button"
            onClick={guard(() => {
              const trimmed = name.trim();
              if (!trimmed) return;
              if (trimmed !== entry.name && existing.includes(trimmed)) return setError(DUP);
              setEditing(null);
            })}
          >
            保存
          </Button>
          <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
            やめる
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex min-h-14 items-center justify-between gap-2 border-t border-border first:border-t-0">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 py-2">
        <span className="text-base font-strong break-words">{entry.name}</span>
        {used && <Badge variant="muted">使用中</Badge>}
        {kind === "genres" && <span className="text-base text-muted-foreground">既定の場所: {entry.defaultLocation || "未選択"}</span>}
        {kind === "units" && <span className="text-base text-muted-foreground">{entry.countable ? "±で数える" : "打ち込む"}</span>}
      </div>
      <div className="flex shrink-0 items-center">
        <Button
          type="button"
          variant="ghost"
          size="text"
          aria-label={`${entry.name}を変更`}
          onClick={guard(() => {
            setName(entry.name);
            setLoc(entry.defaultLocation);
            setCountable(entry.countable);
            setError(null);
            setEditing({ kind, name: entry.name });
          })}
        >
          変更
        </Button>
        {!used && (
          <Button type="button" variant="ghost" size="text" aria-label={`${entry.name}を削除`} onClick={guard(onRemove)}>
            削除
          </Button>
        )}
      </div>
    </li>
  );
}

function AddRow({ kind, guard, existing, onAdd }: { kind: MasterKind; guard: (fn: () => void) => () => void; existing: string[]; onAdd: (name: string) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const id = `master-add-${kind}`;
  return (
    <li className="border-t border-border py-3">
      <form
        className="flex items-center gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          guard(() => {
            const trimmed = name.trim();
            if (!trimmed) return;
            if (existing.includes(trimmed)) return setError(DUP);
            onAdd(trimmed);
            setName("");
          })();
        }}
      >
        <Label htmlFor={id} className="sr-only">
          {NEW_LABEL[kind]}
        </Label>
        <Input
          id={id}
          value={name}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
        <Button type="submit" className="w-24">
          追加
        </Button>
      </form>
      {error && (
        <p id={`${id}-err`} className="mt-1 text-base text-destructive">
          {error}
        </p>
      )}
      {kind === "units" && <p className="mt-1 text-base text-muted-foreground">追加した単位は「±で数える」になります。「変更」で切り替えられます。</p>}
    </li>
  );
}
