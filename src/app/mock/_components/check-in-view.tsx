"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Item, ShoppingEntry } from "../_data/types";
import { isCountUnit } from "../_data/master";
import { useMockDispatch, useMockState, type CheckInRow } from "../_state/mock-state";
import { Card, EmptyCard } from "./card";
import { daysFromToday, toInputValue, useToday } from "./dates";
import { Field, GroupField } from "./form-bits";
import { NativeSelect } from "./native-select";
import { QuantityStepper } from "./quantity-stepper";
import { PageTitle, ScreenShell } from "./screen-frame";
import { showNotice } from "./undo";

// 在庫登録(check_in)(40_design_brief.md rev2「在庫登録」)。食材ごとのカードで個数・期限・場所を直せる。
// 新しい品物はジャンルと単位を選ぶ(OD-stock-uiux-18 の提案 A)。

type Edits = { quantity?: string; expires?: string; location?: string; genre?: string; unit?: string };
type Errors = { genre?: boolean; unit?: boolean };

type FoodCard = { entry: ShoppingEntry; item: Item | undefined };

function FoodCardView({
  card,
  edits,
  errors,
  today,
  onEdit,
}: {
  card: FoodCard;
  edits: Edits;
  errors: Errors;
  today: Date | null;
  onEdit: (patch: Edits) => void;
}) {
  const { masters } = useMockState();
  const { entry, item } = card;
  const isNew = !item;
  const genre = edits.genre ?? item?.genre ?? "";
  const unit = edits.unit ?? item?.unit ?? "";
  const genreDefault = masters.genres.find((g) => g.name === genre)?.defaultLocation ?? "";
  const location = edits.location ?? (item ? item.lastLocation || genreDefault : genreDefault);
  const suggested = item?.suggestDays != null && today ? toInputValue(today, item.suggestDays) : "";
  const expires = edits.expires ?? suggested;
  const quantity = Math.max(1, Number(edits.quantity ?? "1") || 1);
  const id = entry.id;

  return (
    <li>
      <Card as="section" className="h-full">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-strong break-words">
            {entry.name}
            <span className="sr-only">({location || "場所なし"})</span>
          </h3>
          {isNew && <Badge variant="muted">新しい品物</Badge>}
        </div>

        <GroupField label="個数">
          {isCountUnit(unit) ? (
            <QuantityStepper
              name={`${entry.name}の個数`}
              quantity={quantity}
              unit={unit}
              spaced
              decreaseDisabled={quantity <= 1}
              onDecrease={() => onEdit({ quantity: String(quantity - 1) })}
              onIncrease={() => onEdit({ quantity: String(quantity + 1) })}
            />
          ) : (
            <div className="flex items-center gap-2">
              <Input
                aria-label={`${entry.name}の個数`}
                inputMode="numeric"
                className="w-24"
                value={edits.quantity ?? "1"}
                onChange={(e) => onEdit({ quantity: e.target.value.replace(/\D/g, "") })}
              />
              <span className="text-lg">{unit}</span>
            </div>
          )}
        </GroupField>

        <Field label="期限" htmlFor={`ci-exp-${id}`}>
          <div className="flex items-center gap-2">
            <Input id={`ci-exp-${id}`} type="date" value={expires} onChange={(e) => onEdit({ expires: e.target.value })} />
            <Button type="button" variant="ghost" size="text" aria-label={`${entry.name}の期限をクリア`} onClick={() => onEdit({ expires: "" })}>
              クリア
            </Button>
          </div>
        </Field>

        <GroupField label="場所">
          <ToggleGroup
            aria-label={`${entry.name}の場所`}
            value={location ? [location] : []}
            onValueChange={(v) => {
              if (v[0]) onEdit({ location: v[0] });
            }}
          >
            {masters.locations.map((l) => (
              <ToggleGroupItem key={l.name} value={l.name}>
                {l.name}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </GroupField>

        {isNew && (
          <>
            <Field
              label="ジャンル"
              htmlFor={`ci-genre-${id}`}
              error={errors.genre ? "ジャンルを選んでください" : null}
              errorId={`ci-genre-err-${id}`}
            >
              <NativeSelect
                id={`ci-genre-${id}`}
                value={genre}
                aria-invalid={errors.genre || undefined}
                aria-describedby={errors.genre ? `ci-genre-err-${id}` : undefined}
                onChange={(e) => {
                  const g = masters.genres.find((x) => x.name === e.target.value);
                  // ジャンルを選ぶと場所に既定の場所が入る(ST-F04)
                  onEdit({ genre: e.target.value, location: g?.defaultLocation || undefined });
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

            <GroupField label="単位" error={errors.unit ? "単位を選んでください" : null} errorId={`ci-unit-err-${id}`}>
              <div data-unit-group={id}>
                <ToggleGroup
                  aria-label={`${entry.name}の単位`}
                  value={unit ? [unit] : []}
                  onValueChange={(v) => {
                    if (v[0]) onEdit({ unit: v[0] });
                  }}
                >
                  {masters.units.map((u) => (
                    <ToggleGroupItem key={u.name} value={u.name}>
                      {u.name}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            </GroupField>
          </>
        )}
      </Card>
    </li>
  );
}

export function CheckInScreen() {
  const { list, items, masters, settings } = useMockState();
  const dispatch = useMockDispatch();
  const router = useRouter();
  const today = useToday();
  const [edits, setEdits] = useState<Record<string, Edits>>({});
  const [errors, setErrors] = useState<Record<string, Errors>>({});

  const checked = list
    .filter((e) => e.checked)
    .sort((a, b) => (settings.checkedOrder === "bottom" ? a.checkedSeq - b.checkedSeq : 0));
  const supplyEntries: ShoppingEntry[] = [];
  const foods: FoodCard[] = [];
  for (const entry of checked) {
    const linked = entry.itemId ? items.find((i) => i.id === entry.itemId) : undefined;
    if (linked?.kind === "supply") {
      supplyEntries.push(entry);
      continue;
    }
    foods.push({ entry, item: linked ?? items.find((i) => i.kind === "food" && i.name === entry.name) });
  }

  const edit = (id: string, patch: Edits) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) } }));
    setErrors((prev) => {
      const cur = prev[id];
      if (!cur) return prev;
      return { ...prev, [id]: { genre: patch.genre ? false : cur.genre, unit: patch.unit ? false : cur.unit } };
    });
  };

  const confirm = () => {
    const nextErrors: Record<string, Errors> = {};
    const rows: CheckInRow[] = [];
    let firstError: string | null = null;
    for (const { entry, item } of foods) {
      const e = edits[entry.id] ?? {};
      const genre = e.genre ?? item?.genre ?? "";
      const unit = e.unit ?? item?.unit ?? "";
      if (!item) {
        const err: Errors = { genre: genre === "", unit: unit === "" };
        if (err.genre || err.unit) {
          nextErrors[entry.id] = err;
          firstError ??= err.genre ? `ci-genre-${entry.id}` : `unit:${entry.id}`;
          continue;
        }
      }
      const genreDefault = masters.genres.find((g) => g.name === genre)?.defaultLocation ?? "";
      const location = e.location ?? (item ? item.lastLocation || genreDefault : genreDefault);
      const suggested = item?.suggestDays != null && today ? toInputValue(today, item.suggestDays) : "";
      const expires = e.expires ?? suggested;
      rows.push({
        entryId: entry.id,
        name: entry.name,
        genre,
        unit,
        location,
        quantity: Math.max(1, Number(e.quantity ?? "1") || 1),
        expiresInDays: today && expires ? daysFromToday(today, expires) : null,
      });
    }
    setErrors(nextErrors);
    if (firstError) {
      // 何も登録せず、最初の誤りの欄へフォーカス
      const target = firstError.startsWith("unit:")
        ? document.querySelector<HTMLElement>(`[data-unit-group="${firstError.slice(5)}"] button`)
        : document.getElementById(firstError);
      target?.focus();
      return;
    }
    dispatch({ type: "checkin/confirm", rows, entryIds: checked.map((e) => e.id) });
    showNotice(`${rows.length}件を在庫に登録しました`);
    router.push("/mock/shopping-list/");
  };

  const hasChecked = checked.length > 0;
  const bar = hasChecked ? (
    <Button type="button" className="w-full" onClick={confirm}>
      {foods.length > 0 ? `${foods.length}件を在庫に登録する` : "リストから消す"}
    </Button>
  ) : undefined;

  return (
    <ScreenShell level="sub" active="shopping-list" backHref="/mock/shopping-list/" bar={bar} barOnTablet>
      <PageTitle>在庫に登録</PageTitle>
      {!hasChecked ? (
        <EmptyCard title="チェックした品物がありません" className="mt-4">
          買い物リストでチェックを付けると、ここに並びます。
        </EmptyCard>
      ) : (
        <>
          <p className="mt-2 text-base text-muted-foreground">チェックした食材を在庫に入れます。</p>
          {foods.length > 0 && (
            <ul className="mt-4 grid gap-4 md:grid-cols-[repeat(auto-fill,minmax(21.25rem,1fr))]">
              {foods.map((card) => (
                <FoodCardView
                  key={card.entry.id}
                  card={card}
                  edits={edits[card.entry.id] ?? {}}
                  errors={errors[card.entry.id] ?? {}}
                  today={today}
                  onEdit={(patch) => edit(card.entry.id, patch)}
                />
              ))}
            </ul>
          )}
          {supplyEntries.length > 0 && (
            <section className="mt-6">
              <h2 className="text-lg font-heading">日用品</h2>
              <p className="text-base text-muted-foreground">在庫には数えません。確定するとリストから消えます。</p>
              <Card className="mt-2">
                <ul>
                  {supplyEntries.map((e) => (
                    <li key={e.id} className="flex min-h-12 items-center border-t border-border text-lg font-strong first:border-t-0">
                      {e.name}
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          )}
        </>
      )}
    </ScreenShell>
  );
}
