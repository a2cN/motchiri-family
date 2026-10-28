"use client";

import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { isCountUnit } from "../_data/master";
import type { Item, ItemKind, StockLevel, Tracking } from "../_data/types";
import { findCandidates, supplyGenres, useMockDispatch, useMockState } from "../_state/mock-state";
import { Card } from "./card";
import { addDays, daysFromToday, toInputValue, useToday } from "./dates";
import { Field, FieldsetField, GroupField } from "./form-bits";
import { GenreFieldForKind } from "./genre-field-for-kind";
import { LevelField } from "./level-field";
import { parseQty, settleQty, stepQty } from "./quantity";
import { QtyField } from "./qty-field";
import { DEFAULT_RESTOCK, RestockField, fromRestockUi, toRestockUi, type RestockUi } from "./restock-field";
import { PageTitle, ScreenShell } from "./screen-frame";
import { showNotice } from "./undo";

// 品物の登録(40_design_brief.md rev3「品物の登録」、決定 4・28、OD-stock-uiux-15 A)。
// 登録するとモックの食材の在庫(数で管理)・残量(残量で管理)・日用品に反映する。
// 単位・ジャンル・場所は未選択が初期値(根拠の無い既定値を黙って入れない)。種別を変えると管理のしかたは種別の既定に戻る。

const KIND_LABEL: Record<ItemKind, string> = { food: "食材", supply: "日用品" };
const defaultTracking = (kind: ItemKind): Tracking => (kind === "food" ? "count" : "level");

type Errors = { name?: string; genre?: boolean; unit?: boolean };

export function ItemNewScreen() {
  const state = useMockState();
  const { masters, items, nav } = state;
  const dispatch = useMockDispatch();
  const today = useToday();

  const initialKind: ItemKind = nav.newFrom === "supply" ? "supply" : "food";
  const [kind, setKind] = useState<ItemKind>(initialKind);
  const [tracking, setTracking] = useState<Tracking>(defaultTracking(initialKind));
  const [name, setName] = useState("");
  const [picked, setPicked] = useState(false);
  const [qty, setQty] = useState({ text: "1", error: null as string | null });
  const [unit, setUnit] = useState("");
  const [genre, setGenre] = useState("");
  const [location, setLocation] = useState("");
  // 購入日は、触るまで「今日」。期限は空
  const [purchasedOn, setPurchasedOn] = useState<string | null>(null);
  const [expiresOn, setExpiresOn] = useState("");
  const [suggest, setSuggest] = useState<number | null>(null);
  const [level, setLevel] = useState<StockLevel>("full");
  const [restock, setRestock] = useState<RestockUi>(DEFAULT_RESTOCK[defaultTracking(initialKind)]);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Errors>({});

  const nameRef = useRef<HTMLInputElement>(null);

  const purchased = purchasedOn ?? (today ? toInputValue(today, 0) : "");
  const query = name.trim();
  const showCandidates = query !== "" && !picked;
  // 候補は両方の種別を出す。いま選んでいる種別と違う候補には印(OD-stock-uiux-49 A)
  const matches = showCandidates ? findCandidates(items, query).slice(0, 4) : [];
  const genreDefault = (g: string) => masters.genres.find((x) => x.name === g)?.defaultLocation ?? "";

  const pick = (item: Item) => {
    setName(item.name);
    setPicked(true);
    setKind(item.kind);
    setTracking(item.tracking);
    setGenre(item.genre);
    setUnit(item.unit);
    setQty({ text: "1", error: null });
    setLevel("full");
    setRestock(toRestockUi(item.restockAt));
    setNote(item.note);
    setLocation(item.kind === "food" ? item.location || genreDefault(item.genre) : "");
    setSuggest(item.suggestDays);
    if (item.kind === "food" && item.tracking === "count" && item.suggestDays !== null) {
      const start = purchasedOn ? new Date(`${purchasedOn}T12:00:00`) : (today ?? new Date());
      setExpiresOn(toInputValue(addDays(start, item.suggestDays), 0));
    } else {
      setExpiresOn("");
    }
    setErrors({});
    // 候補を選んだら、品物名の入力欄からフォーカスを外してキーボードを閉じる(下の帯の「登録する」が見えるように)
    nameRef.current?.blur();
  };

  const reset = () => {
    setName("");
    setPicked(false);
    setTracking(defaultTracking(kind));
    setQty({ text: "1", error: null });
    setUnit("");
    setGenre("");
    setLocation("");
    setPurchasedOn(null);
    setExpiresOn("");
    setSuggest(null);
    setLevel("full");
    setRestock(DEFAULT_RESTOCK[defaultTracking(kind)]);
    setNote("");
    setErrors({});
  };

  const changeKind = (next: ItemKind) => {
    setKind(next);
    setTracking(defaultTracking(next));
    setRestock(DEFAULT_RESTOCK[defaultTracking(next)]);
    setGenre("");
    setLocation("");
    setExpiresOn("");
    setSuggest(null);
    setPicked(false);
    setErrors({});
    setQty((q) => ({ ...q, error: null }));
  };

  const changeTracking = (next: Tracking) => {
    setTracking(next);
    setRestock(DEFAULT_RESTOCK[next]);
    setErrors((e) => ({ ...e, unit: false }));
    setQty((q) => ({ ...q, error: null }));
  };

  const parsed = parseQty(qty.text, "nonneg");
  const minusDisabled = !parsed.ok || parsed.value <= 1;
  const showSteppers = isCountUnit(masters, unit);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    // 必須(ST-F01・OD-stock-uiux-15 A): 品物名、食材のジャンル、数で管理の個数(0 より大きい)と単位。日用品のジャンルと場所は必須にしない
    const next: Errors = {};
    if (trimmed === "") next.name = "品物名を入れてください";
    else {
      const other = items.find((i) => i.name === trimmed && i.kind !== kind);
      if (other) next.name = `「${trimmed}」は${KIND_LABEL[other.kind]}にあります。候補から選んでください。`;
    }
    if (kind === "food" && genre === "") next.genre = true;
    let qtyError: string | null = null;
    if (tracking === "count") {
      const r = parseQty(qty.text, "positive");
      if (!r.ok) qtyError = r.error;
      if (unit === "") next.unit = true;
    }
    const restockValue = fromRestockUi(restock);
    if (restockValue === null) setRestock({ ...restock, error: settleQty(restock.n, "positive").error });
    setQty((q) => ({ ...q, error: qtyError }));
    setErrors(next);
    if (next.name || next.genre || qtyError || next.unit || restockValue === null) {
      // 最初の誤りの欄へフォーカス
      if (next.name) nameRef.current?.focus();
      else if (next.genre) document.getElementById("item-new-genre")?.focus();
      else if (qtyError) document.getElementById("item-new-qty")?.focus();
      else if (next.unit) document.querySelector<HTMLElement>("[data-unit-group] button")?.focus();
      else document.getElementById("item-new-restock-n")?.focus();
      return;
    }
    const quantity = parseQty(qty.text, "positive");
    dispatch({
      type: "item/register",
      spec: {
        name: trimmed,
        kind,
        tracking,
        genre: kind === "supply" ? genre.trim() : genre,
        unit: tracking === "count" ? unit : "",
        location: kind === "food" ? location : "",
        quantity: quantity.ok ? quantity.value : 1,
        level,
        expiresInDays: kind === "food" && tracking === "count" && today && expiresOn ? daysFromToday(today, expiresOn) : null,
        restockAt: restockValue ?? { kind: "none" },
        note: note.trim(),
      },
    });
    showNotice(`${trimmed}を登録しました`);
    reset();
  };

  const bar = (
    <Button type="submit" form="item-new-form" className="w-full">
      登録する
    </Button>
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

      {/* iPad は2列のフォーム(上に種別を幅いっぱい)。1列のときの順は 種別 → 品物名 → 管理のしかた → 数 → ジャンル → 場所 → 購入日 → 期限 → 補充の目安 → 備考 */}
      <form id="item-new-form" onSubmit={submit} noValidate className="mt-3 md:grid md:grid-cols-2 md:items-start md:gap-x-6">
        <div className="md:col-span-2">
          <ToggleGroup
            joined
            aria-label="品物の種類"
            value={[kind]}
            onValueChange={(v) => {
              if ((v[0] === "food" || v[0] === "supply") && v[0] !== kind) changeKind(v[0]);
            }}
          >
            <ToggleGroupItem value="food">食材</ToggleGroupItem>
            <ToggleGroupItem value="supply">日用品</ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="mt-4 md:col-start-1 md:row-start-2">
          <Field label="品物名" htmlFor="item-new-name" error={errors.name ?? null} errorId="item-new-name-err">
            <Input
              ref={nameRef}
              id="item-new-name"
              value={name}
              autoComplete="off"
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? "item-new-name-err" : undefined}
              onChange={(e) => {
                setName(e.target.value);
                setPicked(false);
                if (e.target.value.trim()) setErrors((x) => ({ ...x, name: undefined }));
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
                        className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-lg font-strong text-foreground outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring active:bg-accent"
                        onClick={() => pick(c)}
                      >
                        <span className="min-w-0 break-words">{c.name}</span>
                        {c.kind !== kind && <Badge variant="muted">{KIND_LABEL[c.kind]}</Badge>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>

        <div className="mt-4 md:col-start-1 md:row-start-3">
          <FieldsetField legend="管理のしかた">
            <ToggleGroup
              aria-label="管理のしかた"
              value={[tracking]}
              onValueChange={(v) => {
                if ((v[0] === "count" || v[0] === "level") && v[0] !== tracking) changeTracking(v[0]);
              }}
            >
              <ToggleGroupItem value="count">数で管理</ToggleGroupItem>
              <ToggleGroupItem value="level">残量で管理</ToggleGroupItem>
            </ToggleGroup>
          </FieldsetField>
        </div>

        <div className="mt-4 md:col-start-1 md:row-start-4">
          {tracking === "count" ? (
            <>
              <GroupField label="個数">
                <QtyField
                  id="item-new-qty"
                  label="個数"
                  value={qty.text}
                  unit={unit}
                  showSteppers={showSteppers}
                  minusDisabled={minusDisabled}
                  error={qty.error}
                  onChange={(text) => setQty({ text, error: null })}
                  onBlur={() => setQty(settleQty(qty.text, "positive"))}
                  onStep={(delta) => {
                    const next = stepQty(qty.text, delta, 1);
                    if (next !== null) setQty({ text: next, error: null });
                  }}
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
            </>
          ) : (
            <LevelField value={level} onChange={setLevel} />
          )}
        </div>

        <div className="mt-4 md:col-start-2 md:row-start-2">
          <GenreFieldForKind
            idPrefix="item-new"
            kind={kind}
            value={genre}
            onChange={(g) => {
              setGenre(g);
              setErrors((x) => ({ ...x, genre: false }));
              // ジャンルを選ぶと既定の場所が入る(ST-F04)。候補から選んだ前回の値があるときは、そのまま
              if (kind === "food" && !picked) setLocation(genreDefault(g));
            }}
            error={errors.genre ? "ジャンルを選んでください" : null}
            candidates={supplyGenres(items)}
          />
        </div>

        {kind === "food" && (
          <div className="mt-4 md:col-start-2 md:row-start-3">
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
          </div>
        )}

        <div className="mt-4 md:col-start-2 md:row-start-4">
          <Field label="購入日" htmlFor="item-new-purchased">
            <Input id="item-new-purchased" type="date" value={purchased} onChange={(e) => setPurchasedOn(e.target.value)} />
          </Field>
        </div>

        {kind === "food" && tracking === "count" && (
          <div className="mt-4 md:col-start-2 md:row-start-5">
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
        )}

        <div className="mt-4 md:col-start-1 md:row-start-5">
          <RestockField idPrefix="item-new-restock" tracking={tracking} unit={unit} value={restock} onChange={setRestock} />
        </div>

        {kind === "supply" && (
          <div className="mt-4 md:col-start-2 md:row-start-5">
            <Field label="備考" htmlFor="item-new-note">
              <Textarea id="item-new-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
        )}
      </form>
    </ScreenShell>
  );
}
