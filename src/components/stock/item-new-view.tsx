"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LEVEL_SYMBOL } from "@/modules/stock/levels";
import { formatQuantity, parseQuantity, stepQuantity } from "@/modules/stock/quantity";
import {
  defaultLocationForGenre, prefillFromItem, validateRegistration, type RegistrationInput,
} from "@/modules/stock/registration";
import { kindOfOrigin, parseOriginQuery, stockHref } from "@/modules/stock/routes";
import { normalizeFreeText, supplyGenres } from "@/modules/stock/supply";
import type { Item, ItemKind, StockLevel, Tracking } from "@/modules/stock/types";
import {
  Field, GroupField, MSG_OFFLINE, NativeSelect, OfflineCard, QUANTITY_ERROR, QtyField, StateCard, RetryButton, SupplyGenreField, notify,
} from "./bits";
import { Card } from "./card";
import { Frame } from "./frame";
import { useLookup } from "./lookup";
import { useAfterDelay, useStock, useStockContext } from "./stock-provider";

// 品物の登録(docs/design/stock/ + docs/design/stock-supply/: 種別「食材 / 日用品」は出す。補充の目安は出さない)。

type Form = {
  kind: ItemKind;
  /** 日用品のジャンル(自由入力)と備考 */
  supplyGenre: string;
  note: string;
  name: string;
  picked: Item | null;
  tracking: Tracking;
  qty: string;
  unitId: string;
  level: StockLevel;
  genreId: string;
  locationId: string;
  purchased: string;
  expires: string;
};
type Errors = { name?: string; genre?: string; unit?: string; qty?: string; tracking?: string };

const TRACKING_LABEL: Record<Tracking, string> = { count: "数で管理", level: "残量で管理" };
const KIND_LABEL: Record<ItemKind, string> = { food: "食材", supply: "日用品" };
/** 管理のしかたの初期値(食材 = 数、日用品 = 残量。OD-stock-uiux-15 A) */
const defaultTracking = (kind: ItemKind): Tracking => (kind === "food" ? "count" : "level");
const emptyForm = (today: string, kind: ItemKind = "food"): Form => ({
  kind, supplyGenre: "", note: "",
  name: "", picked: null, tracking: defaultTracking(kind), qty: "1", unitId: "", level: "full", genreId: "", locationId: "", purchased: today, expires: "",
});

function formFromInput(input: RegistrationInput): Form {
  return {
    kind: input.kind,
    supplyGenre: input.supplyGenre ?? "",
    note: input.note ?? "",
    name: input.name,
    picked: null,
    tracking: input.tracking,
    qty: input.quantity === null ? "1" : formatQuantity(input.quantity),
    unitId: input.unitId ?? "",
    level: input.stockLevel,
    genreId: input.genreId ?? "",
    locationId: input.locationId ?? "",
    purchased: input.purchasedOn,
    expires: input.expiresOn ?? "",
  };
}

export function ItemNewView() {
  const { from } = parseOriginQuery(useSearchParams());
  const { store, snapshot } = useStock();
  const { refill, consumeRefill, requestRefill } = useStockContext();
  const { load, connection, data, today } = snapshot;
  const offline = connection === "offline";
  const lookup = useLookup(data);
  const showLoadingText = useAfterDelay(load === "loading", 1000);

  const [form, setForm] = useState<Form>(() => emptyForm(today, kindOfOrigin(from)));
  // 候補の絞り込みに使う値。変換中(IME)は更新せず、確定してから更新する(OD-stock-food-10 A)
  const [query, setQuery] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const composing = useRef(false);

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  // 登録の失敗の「入れ直す」: 失敗した入力の入った状態にして、品物名にフォーカス
  useEffect(() => {
    if (!refill) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 外部の依頼(通知のボタン)を欄に写す。1回だけ
    setForm(formFromInput(refill.input));
    setQuery(refill.input.name.trim());
    setErrors({});
    consumeRefill();
    nameRef.current?.focus();
  }, [refill, consumeRefill]);

  const matches = useMemo(() => {
    const q = query.trim();
    if (q === "" || form.picked) return [];
    return data.items.filter((i) => i.name.includes(q)).slice(0, 4);
  }, [query, form.picked, data.items]);
  const showCandidates = query.trim() !== "" && !form.picked;

  const pick = (item: Item) => {
    const p = prefillFromItem(item, data, form.purchased);
    setForm({
      ...emptyForm(today, item.itemKind),
      supplyGenre: p.supplyGenre ?? "",
      note: p.note ?? "",
      name: item.name,
      picked: item,
      tracking: p.tracking,
      unitId: p.unitId ?? "",
      genreId: p.genreId ?? "",
      locationId: p.locationId ?? "",
      level: p.stockLevel,
      purchased: form.purchased,
      expires: p.expiresOn ?? "",
    });
    setQuery(item.name);
    setErrors({});
    nameRef.current?.blur();
  };

  const toInput = (): RegistrationInput => {
    const q = parseQuantity(form.qty, "positive");
    const supply = form.kind === "supply";
    return {
      kind: form.kind,
      supplyGenre: supply ? normalizeFreeText(form.supplyGenre) : null,
      note: supply ? normalizeFreeText(form.note) : null,
      name: form.name.trim(),
      tracking: form.tracking,
      genreId: supply ? null : form.genreId || null,
      unitId: form.tracking === "count" ? form.unitId || null : null,
      quantity: form.tracking === "count" && q.ok ? q.value : null,
      stockLevel: form.level,
      locationId: supply ? null : form.locationId || null,
      purchasedOn: form.purchased,
      expiresOn: !supply && form.tracking === "count" ? form.expires || null : null,
    };
  };

  const validate = (): Errors => {
    const e: Errors = {};
    const input = toInput();
    if (input.name === "") e.name = "品物名を入れてください";
    else {
      const mismatch = validateRegistration(input, data);
      if (mismatch?.error === "kind_mismatch") {
        e.name = `「${mismatch.itemName}」は${KIND_LABEL[mismatch.currentKind]}にあります。候補から選んでください。`;
        return e;
      }
      if (mismatch?.error === "tracking_mismatch") {
        const label = TRACKING_LABEL[mismatch.currentTracking];
        e.tracking = `${mismatch.itemName}は「${label}」の品物です。「${label}」を選んでください。`;
        return e;
      }
      if (mismatch?.error === "unit_mismatch") {
        const unit = data.units.find((u) => u.id === mismatch.currentUnitId)?.name ?? "";
        e.unit = `${mismatch.itemName}の在庫は「${unit}」で数えています。「${unit}」を選ぶか、在庫を使い切ってから登録してください。`;
        return e;
      }
    }
    if (form.kind === "food" && form.genreId === "") e.genre = "ジャンルを選んでください";
    if (form.tracking === "count") {
      const q = parseQuantity(form.qty, "positive");
      if (!q.ok) e.qty = QUANTITY_ERROR[q.error];
      if (form.unitId === "") e.unit = "単位を選んでください";
    }
    return e;
  };

  const focusFirstError = (e: Errors) => {
    const target = e.name
      ? "#item-new-name"
      : e.tracking
        ? "[data-tracking-group] button"
        : e.genre
          ? "#item-new-genre"
          : e.qty
            ? "#item-new-qty"
            : "[data-unit-group] button";
    document.querySelector<HTMLElement>(target)?.focus();
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (offline) {
      notify(MSG_OFFLINE);
      return;
    }
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) {
      focusFirstError(next);
      return;
    }
    const input = toInput();
    notify(`${input.name}を登録しました`);
    setForm(emptyForm(today, form.kind));
    setQuery("");
    // 保存を待たずに欄を戻す。失敗したら入力を返して「入れ直す」(6秒)
    void store.register(input).then((r) => {
      if (r.ok) return;
      notify(`${input.name}を登録できませんでした`, {
        label: "入れ直す",
        onClick: () => requestRefill(input),
      });
    });
  };

  const supplyCandidates = useMemo(() => supplyGenres(data), [data]);
  const countable = form.unitId === "" || (data.units.find((u) => u.id === form.unitId)?.isCountable ?? true);
  const unitName = data.units.find((u) => u.id === form.unitId)?.name ?? "";
  const step = (delta: 1 | -1) => {
    const q = parseQuantity(form.qty, "positive");
    if (!q.ok) return set({ qty: "1" });
    set({ qty: formatQuantity(stepQuantity(q.value, delta, "form")) });
  };

  const frame = { back: "list", backHref: stockHref(from), active: from, title: "品物の登録" } as const;
  if (load !== "ready") {
    return (
      <Frame {...frame}>
        {load === "loading" ? (
          showLoadingText && (
            <StateCard role="status" className="mt-4 md:w-[calc(50%-0.5rem)]">
              読み込んでいます…
            </StateCard>
          )
        ) : offline ? (
          <StateCard title="電波がありません" className="mt-4 md:w-[calc(50%-0.5rem)]" action={<RetryButton onClick={() => store.reload()} />}>
            在庫を読み込むには電波が要ります。電波のある所で、もう一度お試しください。
          </StateCard>
        ) : (
          <StateCard title="つながりませんでした" className="mt-4 md:w-[calc(50%-0.5rem)]" action={<RetryButton onClick={() => store.reload()} />}>
            通信できなかったため、在庫を読み込めませんでした。電波のよい場所で、もう一度お試しください。
          </StateCard>
        )}
      </Frame>
    );
  }

  return (
    <Frame
      {...frame}
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
                set({
                  kind: v[0], tracking: defaultTracking(v[0]), genreId: "", locationId: "", expires: "", supplyGenre: "", note: "", picked: null,
                });
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
              onKeyDown={(e) => {
                // 変換の確定の return も、return での送信もしない(候補を選ぶ前に登録されるのを防ぐ)
                if (e.key === "Enter") e.preventDefault();
              }}
              onCompositionStart={() => {
                composing.current = true;
              }}
              onCompositionEnd={(e) => {
                composing.current = false;
                setQuery(e.currentTarget.value);
              }}
              onChange={(e) => {
                set({ name: e.target.value, picked: null });
                setErrors((x) => ({ ...x, name: undefined }));
                if (!composing.current && !(e.nativeEvent as InputEvent).isComposing) setQuery(e.target.value);
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
                        {c.itemKind !== form.kind && <Badge variant="muted">{KIND_LABEL[c.itemKind]}</Badge>}
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
                    unit={unitName}
                    steppers={countable}
                    error={errors.qty}
                    onChange={(qty) => {
                      set({ qty });
                      setErrors((x) => ({ ...x, qty: undefined }));
                    }}
                    onBlur={() => {
                      const r = parseQuantity(form.qty, "positive");
                      if (r.ok) set({ qty: formatQuantity(r.value) });
                    }}
                    onStep={step}
                  />
                </GroupField>
              </div>
              <div className="mt-4" data-unit-group="">
                <GroupField label="単位" error={errors.unit} errorId="item-new-unit-err">
                  <ToggleGroup
                    aria-label="単位"
                    value={form.unitId ? [form.unitId] : []}
                    onValueChange={(v) => {
                      if (v[0]) {
                        set({ unitId: v[0] });
                        setErrors((x) => ({ ...x, unit: undefined }));
                      }
                    }}
                  >
                    {lookup.units.map((u) => (
                      <ToggleGroupItem key={u.id} value={u.id}>
                        {u.name}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </GroupField>
              </div>
            </>
          ) : (
            <fieldset className="mt-4">
              <legend className="mb-1 text-base font-strong">残量</legend>
              <ToggleGroup aria-label="残量" value={[form.level]} onValueChange={(v) => v[0] && set({ level: v[0] as StockLevel })}>
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
                value={form.genreId}
                aria-invalid={errors.genre ? true : undefined}
                aria-describedby={errors.genre ? "item-new-genre-err" : undefined}
                onChange={(e) => {
                  const genreId = e.target.value;
                  set({
                    genreId,
                    // 候補を選んだあとは、場所を変えない。そうでなければジャンルの既定の場所
                    locationId: form.picked ? form.locationId : (genreId ? (defaultLocationForGenre(genreId, data) ?? "") : ""),
                  });
                  setErrors((x) => ({ ...x, genre: undefined }));
                }}
              >
                <option value="">選んでください</option>
                {lookup.genres.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          ) : (
            <SupplyGenreField id="item-new-genre" value={form.supplyGenre} onChange={(supplyGenre) => set({ supplyGenre })} candidates={supplyCandidates} />
          )}
          {form.kind === "food" && (
            <div className="mt-4">
              <GroupField label="場所">
                <ToggleGroup aria-label="場所" value={form.locationId ? [form.locationId] : []} onValueChange={(v) => v[0] && set({ locationId: v[0] })}>
                  {lookup.locations.map((l) => (
                    <ToggleGroupItem key={l.id} value={l.id}>
                      {l.name}
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

