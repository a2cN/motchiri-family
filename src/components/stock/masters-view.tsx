"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { isMasterInUse, sortMasters } from "@/modules/stock/masters";
import type { Genre, Location, MasterKind, StockData, Unit } from "@/modules/stock/types";
import { MSG_OFFLINE, OfflineCard, loadStateBody, notify } from "./bits";
import { Card } from "./card";
import { Frame } from "./frame";
import { useAfterDelay, useStock, failureMessage } from "./stock-provider";

// マスタ(docs/design/stock/ の「マスタ」+ docs/design/stock-master/ の状態)。ジャンル・場所・単位の追加・名前の変更・使っていない値の削除。
type Editing = { kind: MasterKind; id: string } | null;
type Master = Genre | Location | Unit;

const TITLE: Record<MasterKind, string> = { genre: "ジャンル", location: "場所", unit: "単位" };
const NEW_LABEL: Record<MasterKind, string> = { genre: "新しいジャンル", location: "新しい場所", unit: "新しい単位" };
const DUP = "同じ名前があります";
const KINDS = ["genre", "location", "unit"] as const;
const rowsOf = (kind: MasterKind, data: StockData): Master[] =>
  sortMasters<Master>(kind === "genre" ? data.genres : kind === "location" ? data.locations : data.units);

type Guard = (fn: () => void) => () => void;

export function MastersView() {
  const { store, snapshot } = useStock();
  const { load, connection, data } = snapshot;
  const offline = connection === "offline";
  const [editing, setEditing] = useState<Editing>(null);
  const showLoadingText = useAfterDelay(load === "loading", 1000);
  const guard: Guard = (fn) => () => (offline ? notify(MSG_OFFLINE) : fn());

  const stateBody = loadStateBody({
    load, offline, showLoadingText, noun: "マスタ", onRetry: () => store.reload(), className: "mt-4 md:w-[calc(50%-0.5rem)]",
  });
  if (stateBody !== null) return <Frame back="list" title="マスタ">{stateBody}</Frame>;

  const remove = (kind: MasterKind, id: string) => {
    const result = store.deleteMaster(kind, id);
    if (!result) return;
    if ("error" in result) {
      const name = rowsOf(kind, data).find((r) => r.id === id)?.name ?? "";
      return notify(failureMessage({ kind: "in_use", itemName: name }));
    }
    notify(result.label, { label: "元に戻す", onClick: result.undo });
  };

  return (
    <Frame back="list" title="マスタ">
      {offline && <OfflineCard subject="マスタ" className="mt-4" />}
      <div className="mt-4 md:columns-2 md:gap-4">
        {KINDS.map((kind) => (
          <Card as="section" key={kind} className="mb-4 break-inside-avoid">
            <h2 className="text-lg font-heading">{TITLE[kind]}</h2>
            <ul className="mt-1">
              {rowsOf(kind, data).map((entry) => (
                <MasterRow
                  key={entry.id}
                  kind={kind}
                  entry={entry}
                  used={isMasterInUse(kind, entry.id, data)}
                  locations={rowsOf("location", data) as Location[]}
                  editing={editing}
                  setEditing={setEditing}
                  guard={guard}
                  onRemove={() => remove(kind, entry.id)}
                />
              ))}
              <AddRow kind={kind} guard={guard} />
            </ul>
          </Card>
        ))}
      </div>
    </Frame>
  );
}

function MasterRow({
  kind, entry, used, locations, editing, setEditing, guard, onRemove,
}: {
  kind: MasterKind;
  entry: Master;
  used: boolean;
  locations: Location[];
  editing: Editing;
  setEditing: (e: Editing) => void;
  guard: Guard;
  onRemove: () => void;
}) {
  const { store } = useStock();
  const isEditing = editing?.kind === kind && editing.id === entry.id;
  const genre = kind === "genre" ? (entry as Genre) : null;
  const unit = kind === "unit" ? (entry as Unit) : null;
  const [name, setName] = useState(entry.name);
  const [loc, setLoc] = useState<string | null>(genre?.defaultLocationId ?? null);
  const [countable, setCountable] = useState(unit?.isCountable ?? true);
  const [error, setError] = useState<string | null>(null);
  const defaultLocationName = genre?.defaultLocationId ? (locations.find((l) => l.id === genre.defaultLocationId)?.name ?? "") : "";

  if (isEditing) {
    return (
      <li className="border-t border-border py-3 first:border-t-0">
        <Input
          aria-label={`${entry.name}の名前`}
          value={name}
          maxLength={100}
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
        {genre && (
          <div className="mt-3">
            <div className="mb-1 text-base font-strong">既定の場所</div>
            <ToggleGroup aria-label={`${entry.name}の既定の場所`} value={loc ? [loc] : []} onValueChange={(v) => v[0] && setLoc(v[0])}>
              {locations.map((l) => (
                <ToggleGroupItem key={l.id} value={l.id}>
                  {l.name}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        )}
        {unit && (
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
              if (name.trim() === "") return; // 空のままの保存は何も起きない(OD-stock-uiux-30 (4))
              const r = store.renameMaster(kind, entry.id, name);
              if (!r.ok) return r.error === "taken" ? setError(DUP) : undefined;
              if (genre && loc !== genre.defaultLocationId) store.setGenreDefaultLocation(entry.id, loc);
              if (unit && countable !== unit.isCountable) store.setUnitCountable(entry.id, countable);
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
        {genre && <span className="text-base text-muted-foreground">既定の場所: {defaultLocationName || "未選択"}</span>}
        {unit && <span className="text-base text-muted-foreground">{unit.isCountable ? "±で数える" : "打ち込む"}</span>}
      </div>
      <div className="flex shrink-0 items-center">
        <Button
          type="button"
          variant="ghost"
          size="text"
          aria-label={`${entry.name}を変更`}
          onClick={guard(() => {
            setName(entry.name);
            setLoc(genre?.defaultLocationId ?? null);
            setCountable(unit?.isCountable ?? true);
            setError(null);
            setEditing({ kind, id: entry.id });
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

function AddRow({ kind, guard }: { kind: MasterKind; guard: Guard }) {
  const { store } = useStock();
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
            if (name.trim() === "") return;
            const r = store.addMaster(kind, name);
            if (!r.ok) return r.error === "taken" ? setError(DUP) : undefined;
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
          maxLength={100}
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
      {kind === "unit" && <p className="mt-1 text-base text-muted-foreground">追加した単位は「±で数える」になります。「変更」で切り替えられます。</p>}
    </li>
  );
}
