"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { candidates } from "../_data/fixtures";
import { GENRES, LOCATIONS, UNITS, type Location, type Unit } from "../_data/master";
import type { SupplyLevel } from "../_data/types";
import { BottomBar } from "./screen-frame";
import { Card } from "./card";
import { addDays, toInputValue, useToday } from "./dates";
import { NativeSelect } from "./native-select";
import { QuantityStepper } from "./quantity-stepper";
import { showNotice } from "./undo";

// 品物の登録(40_design_brief.md「品物の登録」)。状態はこの画面の中だけ(登録しても在庫には増えない)。

type Kind = "food" | "supply";

function Field({ label, htmlFor, children, hint }: { label: string; htmlFor?: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="mt-4 first:mt-0">
      <Label htmlFor={htmlFor} className="mb-1">
        {label}
      </Label>
      {children}
      {hint}
    </div>
  );
}

// 単独のグループにラベルを付ける(チップの並び)
function GroupField({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <div className="mt-4" role="group" aria-labelledby={id}>
      <div id={id} className="mb-1 text-base font-strong">
        {label}
      </div>
      {children}
    </div>
  );
}

const LEVELS: { value: SupplyLevel; symbol: string; label: string }[] = [
  { value: "full", symbol: "○", label: "残量 ○" },
  { value: "low", symbol: "△", label: "残量 △" },
  { value: "out", symbol: "×", label: "残量 ×" },
];

export function ItemNewView() {
  const today = useToday();
  const [kind, setKind] = useState<Kind>("food");
  const [name, setName] = useState("");
  const [picked, setPicked] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState<Unit>("個");
  const [genre, setGenre] = useState("");
  // 場所の初期選択は未指定のまま(OD-stock-uiux-09)
  const [location, setLocation] = useState<Location | "">("");
  // 購入日・期限は、空のときは「今日」「空」。ユーザーが触った値だけ持つ
  const [purchasedOn, setPurchasedOn] = useState<string | null>(null);
  const [expiresOn, setExpiresOn] = useState("");
  const [suggest, setSuggest] = useState<number | null>(null);
  const [level, setLevel] = useState<SupplyLevel>("full");
  const [note, setNote] = useState("");
  const [error, setError] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const nameId = useId();

  const purchased = purchasedOn ?? (today ? toInputValue(today, 0) : "");
  const query = name.trim();
  const matches = kind === "food" && query && !picked ? candidates.filter((c) => c.name.includes(query)).slice(0, 5) : [];
  const showCandidates = kind === "food" && query !== "" && !picked;

  const pick = (c: (typeof candidates)[number]) => {
    setName(c.name);
    setPicked(true);
    setGenre(c.genre);
    setUnit(c.unit);
    setLocation(c.location);
    setSuggest(c.suggestDays);
    const base = today ?? new Date();
    const start = purchasedOn ? new Date(`${purchasedOn}T12:00:00`) : base;
    setExpiresOn(toInputValue(addDays(start, c.suggestDays), 0));
    setError(false);
  };

  const reset = () => {
    setName("");
    setPicked(false);
    setQuantity(1);
    setUnit("個");
    setGenre("");
    setLocation("");
    setPurchasedOn(null);
    setExpiresOn("");
    setSuggest(null);
    setLevel("full");
    setNote("");
    setError(false);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    // モックで空にできるのは品物名だけ(40 の States & Edge Cases)
    if (!name.trim()) {
      setError(true);
      nameRef.current?.focus();
      return;
    }
    showNotice(`${name.trim()}を登録しました`);
    reset();
  };

  const pickGenre = (value: string) => {
    setGenre(value);
    // ジャンルを選ぶと既定の場所が入る(ST-F04)。前回の値(候補から選んだ)があればそちら
    const g = GENRES.find((x) => x.name === value);
    if (g && !picked) setLocation(g.defaultLocation);
  };

  return (
    <>
      <div className="mt-3">
        <ToggleGroup
          joined
          aria-label="品物の種類"
          value={[kind]}
          onValueChange={(v) => {
            if (v[0] === "food" || v[0] === "supply") setKind(v[0]);
          }}
        >
          <ToggleGroupItem value="food">食材</ToggleGroupItem>
          <ToggleGroupItem value="supply">日用品</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <form id="item-new-form" onSubmit={submit} noValidate className="mt-4">
        <Field label="品物名" htmlFor={nameId}>
          <Input
            ref={nameRef}
            id={nameId}
            value={name}
            autoComplete="off"
            aria-invalid={error || undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(e) => {
              setName(e.target.value);
              setPicked(false);
              if (e.target.value.trim()) setError(false);
            }}
          />
          {error && (
            <p id={errorId} className="mt-1 text-base text-destructive">
              品物名を入れてください
            </p>
          )}
        </Field>

        {showCandidates && (
          <Card as="section" className="mt-2 p-0 md:p-0" aria-label="品物名の候補">
            {matches.length === 0 ? (
              <p className="px-4 py-3 text-base text-muted-foreground">候補はありません。このまま新しい品物として登録できます。</p>
            ) : (
              <ul>
                {matches.map((c) => (
                  <li key={c.name} className="border-t border-border first:border-t-0">
                    <button
                      type="button"
                      className="flex min-h-12 w-full items-center px-4 text-left text-lg font-strong text-foreground outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring active:bg-accent"
                      onClick={() => pick(c)}
                    >
                      {c.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {kind === "food" ? (
          <>
            <GroupField label="個数">
              <QuantityStepper
                name="個数"
                quantity={quantity}
                unit=""
                decreaseDisabled={quantity <= 1}
                onDecrease={() => setQuantity((q) => Math.max(1, q - 1))}
                onIncrease={() => setQuantity((q) => q + 1)}
              />
            </GroupField>

            <GroupField label="単位">
              <ToggleGroup
                aria-label="単位"
                value={[unit]}
                onValueChange={(v) => {
                  if (v[0]) setUnit(v[0] as Unit);
                }}
              >
                {UNITS.map((u) => (
                  <ToggleGroupItem key={u} value={u}>
                    {u}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </GroupField>

            <Field label="ジャンル" htmlFor="item-genre">
              <NativeSelect id="item-genre" value={genre} onChange={(e) => pickGenre(e.target.value)}>
                <option value="">選んでください</option>
                {GENRES.map((g) => (
                  <option key={g.name} value={g.name}>
                    {g.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <GroupField label="場所">
              <ToggleGroup
                aria-label="場所"
                value={location ? [location] : []}
                onValueChange={(v) => {
                  if (v[0]) setLocation(v[0] as Location);
                }}
              >
                {LOCATIONS.map((l) => (
                  <ToggleGroupItem key={l} value={l}>
                    {l}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </GroupField>

            <Field label="購入日" htmlFor="item-purchased">
              <Input id="item-purchased" type="date" value={purchased} onChange={(e) => setPurchasedOn(e.target.value)} />
            </Field>

            <Field
              label="期限"
              htmlFor="item-expires"
              hint={suggest !== null && <p className="mt-1 text-base text-muted-foreground">前回から {suggest}日後を提案</p>}
            >
              <div className="flex items-center gap-2">
                <Input id="item-expires" type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
                <Button
                  type="button"
                  variant="ghost"
                  size="text"
                  onClick={() => {
                    setExpiresOn("");
                    setSuggest(null);
                  }}
                >
                  クリア
                </Button>
              </div>
            </Field>
          </>
        ) : (
          <>
            <Field label="購入日" htmlFor="item-purchased">
              <Input id="item-purchased" type="date" value={purchased} onChange={(e) => setPurchasedOn(e.target.value)} />
            </Field>

            <GroupField label="残量">
              <ToggleGroup
                aria-label="残量"
                value={[level]}
                onValueChange={(v) => {
                  if (v[0]) setLevel(v[0] as SupplyLevel);
                }}
              >
                {LEVELS.map((l) => (
                  <ToggleGroupItem key={l.value} value={l.value} aria-label={l.label}>
                    {l.symbol}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </GroupField>

            <Field label="備考" htmlFor="item-note">
              <Textarea id="item-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </>
        )}

        {/* 768px 以上は入力欄の最後に置く(帯は出さない) */}
        <div className="mt-6 hidden md:block">
          <Button type="submit">登録する</Button>
        </div>
      </form>

      {/* スマホ(768px 未満)は画面の下の操作の帯に、幅いっぱいで */}
      <BottomBar mobileOnly widthClass="max-w-[40rem]">
        <Button type="submit" form="item-new-form" className="w-full">
          登録する
        </Button>
      </BottomBar>
    </>
  );
}
