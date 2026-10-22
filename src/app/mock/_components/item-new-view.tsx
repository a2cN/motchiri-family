"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Item, ItemKind, SupplyLevel } from "../_data/types";
import { findCandidates, useMockDispatch, useMockState } from "../_state/mock-state";
import { Card } from "./card";
import { addDays, daysFromToday, toInputValue, useToday } from "./dates";
import { Field, GroupField } from "./form-bits";
import { NativeSelect } from "./native-select";
import { QuantityStepper } from "./quantity-stepper";
import { PageTitle, ScreenShell } from "./screen-frame";
import { showNotice } from "./undo";

// 品物の登録(40_design_brief.md rev2「品物の登録」)。登録するとモックの食材の在庫(または日用品)に1件増える。

const LEVELS: { value: SupplyLevel; symbol: string; label: string }[] = [
  { value: "full", symbol: "○", label: "残量 ○" },
  { value: "low", symbol: "△", label: "残量 △" },
  { value: "out", symbol: "×", label: "残量 ×" },
];

type Errors = { name?: boolean; genre?: boolean; unit?: boolean };

export function ItemNewScreen() {
  const state = useMockState();
  const { masters, items, nav } = state;
  const dispatch = useMockDispatch();
  const today = useToday();

  const [kind, setKind] = useState<ItemKind>(nav.newFrom === "supply" ? "supply" : "food");
  const [name, setName] = useState("");
  const [picked, setPicked] = useState(false);
  const [quantity, setQuantity] = useState(1);
  // 初期値(OD-stock-uiux-15 の提案 A): 単位・ジャンル・場所は未選択。場所はジャンルを選ぶと入る
  const [unit, setUnit] = useState("");
  const [genre, setGenre] = useState("");
  const [location, setLocation] = useState("");
  // 購入日・期限は、空のときは「今日」「空」。ユーザーが触った値だけ持つ
  const [purchasedOn, setPurchasedOn] = useState<string | null>(null);
  const [expiresOn, setExpiresOn] = useState("");
  const [suggest, setSuggest] = useState<number | null>(null);
  const [level, setLevel] = useState<SupplyLevel>("full");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Errors>({});

  const nameRef = useRef<HTMLInputElement>(null);

  const purchased = purchasedOn ?? (today ? toInputValue(today, 0) : "");
  const query = name.trim();
  const showCandidates = query !== "" && !picked;
  const matches = showCandidates ? findCandidates(items, query, kind).slice(0, 5) : [];

  const genreDefault = (g: string) => masters.genres.find((x) => x.name === g)?.defaultLocation ?? "";

  const pick = (item: Item) => {
    setName(item.name);
    setPicked(true);
    setErrors((e) => ({ ...e, name: false }));
    if (kind === "food") {
      setGenre(item.genre);
      setUnit(item.unit);
      setLocation(item.lastLocation || genreDefault(item.genre));
      setSuggest(item.suggestDays);
      if (item.suggestDays !== null) {
        const base = today ?? new Date();
        const start = purchasedOn ? new Date(`${purchasedOn}T12:00:00`) : base;
        setExpiresOn(toInputValue(addDays(start, item.suggestDays), 0));
      } else {
        setExpiresOn("");
      }
      setErrors({});
    }
    // 候補を選んだら、品物名の入力欄からフォーカスを外してキーボードを閉じる(下の帯の「登録する」が見えるように)
    nameRef.current?.blur();
  };

  const reset = () => {
    setName("");
    setPicked(false);
    setQuantity(1);
    setUnit("");
    setGenre("");
    setLocation("");
    setPurchasedOn(null);
    setExpiresOn("");
    setSuggest(null);
    setLevel("full");
    setNote("");
    setErrors({});
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    // 必須(ST-F01): 品物名・ジャンル・個数・単位。日用品は品物名だけ(OD-stock-uiux-15)
    const next: Errors = { name: trimmed === "" };
    if (kind === "food") {
      next.genre = genre === "";
      next.unit = unit === "";
    }
    if (next.name || next.genre || next.unit) {
      setErrors(next);
      // 最初の誤りの欄へフォーカス
      if (next.name) nameRef.current?.focus();
      else if (next.genre) document.getElementById("item-new-genre")?.focus();
      else document.querySelector<HTMLElement>('[data-unit-group] button')?.focus();
      return;
    }
    if (kind === "food") {
      dispatch({
        type: "item/registerFood",
        food: {
          name: trimmed,
          genre,
          unit,
          location,
          quantity,
          expiresInDays: today && expiresOn ? daysFromToday(today, expiresOn) : null,
        },
      });
    } else {
      dispatch({ type: "item/registerSupply", name: trimmed, level, note: note.trim() });
    }
    showNotice(`${trimmed}を登録しました`);
    reset();
  };

  const nameFieldError = errors.name ? "品物名を入れてください" : null;
  const bar = (
    <Button type="submit" form="item-new-form" className="w-full">
      登録する
    </Button>
  );

  const nameField = (
    <>
      <Field label="品物名" htmlFor="item-new-name" error={nameFieldError} errorId="item-new-name-err">
        <Input
          ref={nameRef}
          id="item-new-name"
          value={name}
          autoComplete="off"
          aria-invalid={errors.name || undefined}
          aria-describedby={errors.name ? "item-new-name-err" : undefined}
          onChange={(e) => {
            setName(e.target.value);
            setPicked(false);
            if (e.target.value.trim()) setErrors((x) => ({ ...x, name: false }));
          }}
        />
      </Field>
      <p className="sr-only" aria-live="polite">
        {showCandidates && matches.length > 0 ? `候補 ${matches.length}件` : ""}
      </p>
      {showCandidates && (
        <Card as="section" className="mt-2 p-0 md:p-0" aria-label="品物名の候補">
          {matches.length === 0 ? (
            <p className="px-4 py-3 text-base text-muted-foreground">候補はありません。このまま新しい品物として登録できます。</p>
          ) : (
            <ul>
              {matches.map((c) => (
                <li key={c.id} className="border-t border-border first:border-t-0">
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
    </>
  );

  const purchasedField = (
    <Field label="購入日" htmlFor="item-new-purchased">
      <Input id="item-new-purchased" type="date" value={purchased} onChange={(e) => setPurchasedOn(e.target.value)} />
    </Field>
  );

  return (
    <ScreenShell
      level="sub"
      active={nav.newFrom}
      backHref={nav.newFrom === "supply" ? "/mock/supply/" : "/mock/stock/"}
      bar={bar}
      barOnTablet
    >
      <PageTitle>品物の登録</PageTitle>
      <div className="mt-3">
        <ToggleGroup
          joined
          aria-label="品物の種類"
          value={[kind]}
          onValueChange={(v) => {
            if (v[0] === "food" || v[0] === "supply") {
              setKind(v[0]);
              setPicked(false);
              setErrors({});
            }
          }}
        >
          <ToggleGroupItem value="food">食材</ToggleGroupItem>
          <ToggleGroupItem value="supply">日用品</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* iPad は2列のフォーム。左 = 品物名・個数・単位(日用品: 品物名・残量)、右 = ジャンル・場所・購入日・期限(日用品: 購入日・備考) */}
      <form id="item-new-form" onSubmit={submit} noValidate className="mt-4 md:grid md:grid-cols-2 md:items-start md:gap-x-6">
        {kind === "food" ? (
          <>
            <div>
              {nameField}
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
              <div className="mt-4" data-unit-group="">
                <GroupField label="単位" error={errors.unit ? "単位を選んでください" : null} errorId="item-new-unit-err">
                  <ToggleGroup
                    aria-label="単位"
                    value={unit ? [unit] : []}
                    onValueChange={(v) => {
                      if (v[0]) {
                        setUnit(v[0]);
                        setErrors((x) => ({ ...x, unit: false }));
                      }
                    }}
                  >
                    {masters.units.map((u) => (
                      <ToggleGroupItem key={u.name} value={u.name}>
                        {u.name}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </GroupField>
              </div>
            </div>
            <div className="mt-4 md:mt-0">
              <Field label="ジャンル" htmlFor="item-new-genre" error={errors.genre ? "ジャンルを選んでください" : null} errorId="item-new-genre-err">
                <NativeSelect
                  id="item-new-genre"
                  value={genre}
                  aria-invalid={errors.genre || undefined}
                  aria-describedby={errors.genre ? "item-new-genre-err" : undefined}
                  onChange={(e) => {
                    setGenre(e.target.value);
                    setErrors((x) => ({ ...x, genre: false }));
                    // ジャンルを選ぶと既定の場所が入る(ST-F04)。候補から選んだ前回の値があるときは、そのまま
                    if (!picked) setLocation(genreDefault(e.target.value));
                  }}
                >
                  <option value="">選んでください</option>
                  {masters.genres.map((g) => (
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
                    if (v[0]) setLocation(v[0]);
                  }}
                >
                  {masters.locations.map((l) => (
                    <ToggleGroupItem key={l.name} value={l.name}>
                      {l.name}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </GroupField>

              {purchasedField}

              <Field
                label="期限"
                htmlFor="item-new-expires"
                hint={suggest !== null && expiresOn !== "" && <p className="mt-1 text-base text-muted-foreground">前回から {suggest}日後を提案</p>}
              >
                <div className="flex items-center gap-2">
                  <Input id="item-new-expires" type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
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
            </div>
          </>
        ) : (
          <>
            <div>
              {nameField}
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
            </div>
            <div className="mt-4 md:mt-0">
              {purchasedField}
              <Field label="備考" htmlFor="item-new-note">
                <Textarea id="item-new-note" value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
            </div>
          </>
        )}
      </form>
    </ScreenShell>
  );
}
