"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { MasterEntry, MasterKind } from "../_data/master";
import { isMasterUsed, useMockDispatch, useMockState } from "../_state/mock-state";
import { Card } from "./card";
import { PageTitle, ScreenShell } from "./screen-frame";
import { EditLink } from "./stock-view";
import { showUndo } from "./undo";

// マスタ(ジャンル・場所・単位。40_design_brief.md rev2「マスタ」)。追加・名前の変更・使っていないものの削除。
// 同時に編集できる行は1つ。

type Editing = { kind: MasterKind; name: string } | null;

const TITLE: Record<MasterKind, string> = { genres: "ジャンル", locations: "場所", units: "単位" };
const NEW_LABEL: Record<MasterKind, string> = { genres: "新しいジャンル", locations: "新しい場所", units: "新しい単位" };

const DUP = "同じ名前があります";

function MasterRow({
  kind,
  entry,
  index,
  editing,
  setEditing,
}: {
  kind: MasterKind;
  entry: MasterEntry;
  index: number;
  editing: Editing;
  setEditing: (e: Editing) => void;
}) {
  const state = useMockState();
  const dispatch = useMockDispatch();
  const used = isMasterUsed(state, kind, entry.name);
  const isEditing = editing?.kind === kind && editing.name === entry.name;
  const [name, setName] = useState(entry.name);
  const [loc, setLoc] = useState(entry.defaultLocation);
  const [error, setError] = useState<string | null>(null);

  const remove = () => {
    dispatch({ type: "master/remove", kind, name: entry.name });
    showUndo(`${entry.name}を削除しました`, () => dispatch({ type: "master/restore", kind, entry, index }), state.settings.undoSeconds);
  };

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (trimmed !== entry.name && state.masters[kind].some((m) => m.name === trimmed)) {
      setError(DUP);
      return;
    }
    if (trimmed !== entry.name) dispatch({ type: "master/rename", kind, from: entry.name, to: trimmed });
    if (kind === "genres" && loc !== entry.defaultLocation) dispatch({ type: "master/defaultLocation", genre: trimmed, location: loc });
    setEditing(null);
  };

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
            <ToggleGroup
              aria-label={`${entry.name}の既定の場所`}
              value={loc ? [loc] : []}
              onValueChange={(v) => {
                if (v[0]) setLoc(v[0]);
              }}
            >
              {state.masters.locations.map((l) => (
                <ToggleGroupItem key={l.name} value={l.name}>
                  {l.name}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        )}
        <div className="mt-3 flex items-center gap-2">
          <Button type="button" onClick={save}>
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
        {kind === "genres" && (
          <span className="text-base text-muted-foreground">既定の場所: {entry.defaultLocation || "未選択"}</span>
        )}
      </div>
      <div className="flex shrink-0 items-center">
        <Button
          type="button"
          variant="ghost"
          size="text"
          aria-label={`${entry.name}を変更`}
          onClick={() => {
            setName(entry.name);
            setLoc(entry.defaultLocation);
            setError(null);
            setEditing({ kind, name: entry.name });
          }}
        >
          変更
        </Button>
        {!used && (
          <Button type="button" variant="ghost" size="text" aria-label={`${entry.name}を削除`} onClick={remove}>
            削除
          </Button>
        )}
      </div>
    </li>
  );
}

function AddRow({ kind }: { kind: MasterKind }) {
  const { masters } = useMockState();
  const dispatch = useMockDispatch();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const id = `master-add-${kind}`;

  return (
    <li className="border-t border-border py-3">
      <form
        className="flex items-center gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = name.trim();
          // 空白だけは何も起きない
          if (!trimmed) return;
          if (masters[kind].some((m) => m.name === trimmed)) {
            setError(DUP);
            return;
          }
          // ジャンルの既定の場所は「未選択」で足し、あとで「変更」で選ぶ(OD-stock-uiux-20)
          dispatch({ type: "master/add", kind, name: trimmed });
          setName("");
          setError(null);
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
    </li>
  );
}

export function MastersScreen() {
  const { masters, items, nav } = useMockState();
  const [editing, setEditing] = useState<Editing>(null);
  const ordered = [...items.filter((i) => i.kind === "food"), ...items.filter((i) => i.kind === "supply")];

  return (
    <ScreenShell level="sub" active="masters" backHref={nav.mastersFrom === "supply" ? "/mock/supply/" : "/mock/stock/"}>
      <PageTitle>マスタ</PageTitle>
      <div className="mt-4 md:columns-2 md:gap-4">
        {(["genres", "locations", "units"] as const).map((kind) => (
          <Card as="section" key={kind} className="mb-4 break-inside-avoid">
            <h2 className="text-lg font-heading">{TITLE[kind]}</h2>
            <ul className="mt-1">
              {masters[kind].map((entry, index) => (
                <MasterRow key={entry.name} kind={kind} entry={entry} index={index} editing={editing} setEditing={setEditing} />
              ))}
              <AddRow kind={kind} />
            </ul>
          </Card>
        ))}
        <Card as="section" className="mb-4 break-inside-avoid">
          <h2 className="text-lg font-heading">品物</h2>
          {ordered.length === 0 ? (
            <p className="text-base text-muted-foreground">品物はありません</p>
          ) : (
            <ul className="mt-1">
              {ordered.map((item) => (
                <li key={item.id} className="border-t border-border first:border-t-0">
                  <EditLink item={item} from="masters" className="flex min-h-14 items-center justify-between gap-3 text-foreground no-underline active:bg-accent">
                    <span className="min-w-0 text-base font-strong break-words">{item.name}</span>
                    <span className="shrink-0 text-base text-muted-foreground">{item.kind === "food" ? "食材" : "日用品"}</span>
                  </EditLink>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </ScreenShell>
  );
}
