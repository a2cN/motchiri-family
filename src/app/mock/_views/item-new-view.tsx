"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Card } from "../_lib/card";
import { Field, GroupField, MSG_OFFLINE, NativeSelect, OfflineCard, QtyField, SupplyGenreField, notify } from "../_lib/bits";
import {
  GENRES, GENRE_DEFAULT_LOCATION, ITEMS, LEVEL_SYMBOL, LOCATIONS, STOCKS, TODAY, UNITS, isCountable, parseQty, supplyGenresOf,
  type Item, type Kind, type Level, type Tracking,
} from "../_lib/data";
import { Frame } from "../_lib/frame";

// 品物の登録(stock-supply の部分集合: 種別「食材 / 日用品」は出す。補充の目安は出さない。`ab250aa` の item-new-view.tsx の形。40_design_brief.md Component Specs 1・3)。

type Form = {
  kind: Kind;
  note: string;
  name: string;
  picked: Item | null;
  tracking: Tracking;
  qty: string;
  unit: string;
  level: Level;
  genre: string;
  location: string;
  purchased: string;
  expires: string;
};
type Errors = { name?: string; nameKind?: string; genre?: string; unit?: string; qty?: string; tracking?: string };

const KIND_LABEL: Record<Kind, string> = { food: "食材", supply: "日用品" };
const defaultTracking = (kind: Kind): Tracking => (kind === "food" ? "count" : "level");
const EMPTY: Form = { kind: "food", note: "", name: "", picked: null, tracking: "count", qty: "1", unit: "", level: "full", genre: "", location: "", purchased: TODAY, expires: "" };
const TRACKING_LABEL: Record<Tracking, string> = { count: "数で管理", level: "残量で管理" };

// 既存の品物の単位・管理のしかたを、在庫があるのに変えた誤り(OD-stock-food-06 (1))
function validate(f: Form): Errors {
  const e: Errors = {};
  const name = f.name.trim();
  if (name === "") e.name = "品物名を入れてください";
  const other = ITEMS.find((i) => i.name === name && i.kind !== f.kind);
  if (other) {
    e.name = `「${name}」は${KIND_LABEL[other.kind]}にあります。候補から選んでください。`;
    return e;
  }
  const existing = ITEMS.find((i) => i.name === name);
  if (existing) {
    if (existing.tracking !== f.tracking) {
      e.tracking = `${name}は「${TRACKING_LABEL[existing.tracking]}」の品物です。「${TRACKING_LABEL[existing.tracking]}」を選んでください。`;
      return e;
    }
    if (f.tracking === "count" && existing.unit !== f.unit && STOCKS.some((s) => s.itemId === existing.id)) {
      e.unit = `${name}の在庫は「${existing.unit}」で数えています。「${existing.unit}」を選ぶか、在庫を使い切ってから登録してください。`;
      return e;
    }
  }
  if (f.kind === "food" && f.genre === "") e.genre = "ジャンルを選んでください";
  if (f.tracking === "count") {
    const q = parseQty(f.qty);
    if (!q.ok) e.qty = q.error;
    else if (q.value <= 0) e.qty = "0 より大きい数を入れてください";
    if (f.unit === "") e.unit = "単位を選んでください";
  }
  return e;
}

function pickedForm(item: Item): Form {
  return { ...EMPTY, kind: item.kind, note: item.note, name: item.name, picked: item, tracking: item.tracking, unit: item.unit, genre: item.genre, location: item.kind === "food" ? item.location : "", expires: "" };
}

function initialForm(state: string, from: string): Form {
  const byId = (id: string) => ITEMS.find((i) => i.id === id)!;
  if (from === "supply") {
    // 日用品の画面から開いた形(種別の初期値は日用品、管理のしかたは残量、残量 ○)
    const supply: Form = { ...EMPTY, kind: "supply", tracking: "level" };
    if (state === "count-full") return { ...supply, tracking: "count", unit: "本", qty: "1" };
    if (state === "kind-error") return { ...supply, name: "牛乳" };
    return supply;
  }
  if (state === "level") return { ...EMPTY, tracking: "level" };
  if (state === "suggest") return { ...EMPTY, name: "牛" };
  if (state === "error") return EMPTY;
  if (state === "unit-error") return { ...pickedForm(byId("milk")), unit: "パック", expires: "2026-10-30" };
  if (state === "tracking-error") return { ...pickedForm(byId("soy")), tracking: "count" };
  return EMPTY;
}

const TOMATO: Form = { ...EMPTY, name: "トマト", genre: "野菜・果物", unit: "個", location: "冷蔵庫" };

export function ItemNewView() {
  const params = useSearchParams();
  const state = params.get("state") ?? "";
  const from = params.get("from") === "supply" ? "supply" : "stock";
  const offline = state === "offline";
  const [form, setForm] = useState<Form>(() => initialForm(state, from));
  const [errors, setErrors] = useState<Errors>(() => (["error", "unit-error", "tracking-error", "kind-error"].includes(state) ? validate(initialForm(state, from)) : {}));
  const nameRef = useRef<HTMLInputElement>(null);
  const fired = useRef(false);

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    if (state === "typing") nameRef.current?.focus();
    if (state === "error" || state === "kind-error") nameRef.current?.focus();
    if (state === "unit-error") document.querySelector<HTMLElement>("[data-unit-group] button")?.focus();
    if (state === "tracking-error") document.querySelector<HTMLElement>("[data-tracking-group] button")?.focus();
    if (state === "register-failed") {
      notify("トマトを登録できませんでした", {
        label: "入れ直す",
        onClick: () => {
          setForm(TOMATO);
          setErrors({});
          nameRef.current?.focus();
        },
      });
    }
  }, [state]);

  const query = form.name.trim();
  const showCandidates = query !== "" && !form.picked;
  const matches = showCandidates ? ITEMS.filter((i) => i.name.includes(query)).slice(0, 4) : [];

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (offline) {
      notify(MSG_OFFLINE);
      return;
    }
    const next = validate(form);
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    notify(`${form.name.trim()}を登録しました`);
    setForm({ ...EMPTY, kind: form.kind, tracking: defaultTracking(form.kind) });
  };

  const countable = isCountable(form.unit);
  const qtyNum = parseQty(form.qty);
  const step = (delta: 1 | -1) => {
    if (!qtyNum.ok) return set({ qty: "1" });
    const next = Math.round((qtyNum.value + delta) * 10) / 10;
    if (next >= 1) set({ qty: String(next) });
  };

  return (
    <Frame
      back="list"
      backHref={from === "supply" ? "/mock/supply/" : "/mock/stock/"}
      active={from === "supply" ? "supply" : "stock"}
      title="品物の登録"
      barAllSizes
      bar={
        <Button type="submit" form="item-new-form" className="w-full">
          登録する
        </Button>
      }
    >
      {offline && <OfflineCard className="mt-4" />}
      <form id="item-new-form" onSubmit={submit} noValidate className="mt-4 md:grid md:grid-cols-2 md:items-start md:gap-x-6">
        <div className="md:col-span-2">
          <ToggleGroup
            joined
            aria-label="品物の種類"
            value={[form.kind]}
            onValueChange={(v) => {
              if ((v[0] === "food" || v[0] === "supply") && v[0] !== form.kind) {
                // 種別を変えると、管理のしかたは種別の既定に戻り、ジャンル・場所・期限が空に戻る(OD-stock-uiux-50 (5))
                set({ kind: v[0], tracking: defaultTracking(v[0]), genre: "", location: "", expires: "", picked: null });
                setErrors({});
              }
            }}
          >
            <ToggleGroupItem value="food">食材</ToggleGroupItem>
            <ToggleGroupItem value="supply">日用品</ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="mt-4">
          <Field label="品物名" htmlFor="item-new-name" error={errors.name} errorId="item-new-name-err">
            <Input
              ref={nameRef}
              id="item-new-name"
              value={form.name}
              autoComplete="off"
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? "item-new-name-err" : undefined}
              onChange={(e) => {
                set({ name: e.target.value, picked: null });
                setErrors((x) => ({ ...x, name: undefined }));
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
                        onClick={() => {
                          setForm(pickedForm(c));
                          setErrors({});
                          nameRef.current?.blur();
                        }}
                      >
                        <span className="min-w-0 break-words">{c.name}</span>
                        {c.kind !== form.kind && <Badge variant="muted">{KIND_LABEL[c.kind]}</Badge>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <div className="mt-4" data-tracking-group="">
            <GroupField label="管理のしかた" error={errors.tracking} errorId="item-new-tracking-err">
              <ToggleGroup
                aria-label="管理のしかた"
                value={[form.tracking]}
                onValueChange={(v) => {
                  if ((v[0] === "count" || v[0] === "level") && v[0] !== form.tracking) {
                    set({ tracking: v[0] });
                    setErrors((x) => ({ ...x, tracking: undefined, unit: undefined }));
                  }
                }}
              >
                <ToggleGroupItem value="count">数で管理</ToggleGroupItem>
                <ToggleGroupItem value="level">残量で管理</ToggleGroupItem>
              </ToggleGroup>
            </GroupField>
          </div>

          {form.tracking === "count" ? (
            <>
              <div className="mt-4">
                <GroupField label="個数">
                  <QtyField
                    id="item-new-qty"
                    label="個数"
                    value={form.qty}
                    unit={form.unit}
                    steppers={countable}
                    error={errors.qty}
                    onChange={(qty) => {
                      set({ qty });
                      setErrors((x) => ({ ...x, qty: undefined }));
                    }}
                    onBlur={() => {
                      const r = parseQty(form.qty);
                      if (r.ok) set({ qty: String(r.value) });
                    }}
                    onStep={step}
                  />
                </GroupField>
              </div>
              <div className="mt-4" data-unit-group="">
                <GroupField label="単位" error={errors.unit} errorId="item-new-unit-err">
                  <ToggleGroup
                    aria-label="単位"
                    value={form.unit ? [form.unit] : []}
                    onValueChange={(v) => {
                      if (v[0]) {
                        set({ unit: v[0] });
                        setErrors((x) => ({ ...x, unit: undefined }));
                      }
                    }}
                  >
                    {UNITS.map((u) => (
                      <ToggleGroupItem key={u} value={u}>
                        {u}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </GroupField>
              </div>
            </>
          ) : (
            <fieldset className="mt-4">
              <legend className="mb-1 text-base font-strong">残量</legend>
              <ToggleGroup aria-label="残量" value={[form.level]} onValueChange={(v) => v[0] && set({ level: v[0] as Level })}>
                {(["full", "low", "out"] as const).map((l) => (
                  <ToggleGroupItem key={l} value={l} aria-label={`残量 ${LEVEL_SYMBOL[l]}`}>
                    {LEVEL_SYMBOL[l]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </fieldset>
          )}
        </div>

        <div className="mt-4">
          {form.kind === "food" ? (
            <Field label="ジャンル" htmlFor="item-new-genre" error={errors.genre} errorId="item-new-genre-err">
              <NativeSelect
                id="item-new-genre"
                value={form.genre}
                aria-invalid={errors.genre ? true : undefined}
                aria-describedby={errors.genre ? "item-new-genre-err" : undefined}
                onChange={(e) => {
                  const genre = e.target.value;
                  set({ genre, location: form.picked ? form.location : (GENRE_DEFAULT_LOCATION[genre] ?? "棚") });
                  setErrors((x) => ({ ...x, genre: undefined }));
                }}
              >
                <option value="">選んでください</option>
                {GENRES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          ) : (
            <SupplyGenreField id="item-new-genre" value={form.genre} onChange={(genre) => set({ genre })} candidates={supplyGenresOf(ITEMS)} />
          )}
          {form.kind === "food" && (
            <div className="mt-4">
              <GroupField label="場所">
                <ToggleGroup aria-label="場所" value={form.location ? [form.location] : []} onValueChange={(v) => v[0] && set({ location: v[0] })}>
                  {LOCATIONS.map((l) => (
                    <ToggleGroupItem key={l} value={l}>
                      {l}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </GroupField>
            </div>
          )}
          <Field label="購入日" htmlFor="item-new-purchased">
            <Input id="item-new-purchased" type="date" value={form.purchased} onChange={(e) => set({ purchased: e.target.value })} />
          </Field>
          {form.kind === "food" && form.tracking === "count" && (
            <Field label="期限" htmlFor="item-new-expires">
              <div className="flex items-center gap-2">
                <Input id="item-new-expires" type="date" value={form.expires} onChange={(e) => set({ expires: e.target.value })} />
                <Button type="button" variant="ghost" size="text" onClick={() => set({ expires: "" })}>
                  クリア
                </Button>
              </div>
            </Field>
          )}
          {form.kind === "supply" && (
            <Field label="備考" htmlFor="item-new-note">
              <Textarea id="item-new-note" value={form.note} onChange={(e) => set({ note: e.target.value })} />
            </Field>
          )}
        </div>
      </form>
    </Frame>
  );
}
