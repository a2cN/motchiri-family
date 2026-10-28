"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { isCountUnit } from "../_data/master";
import type { Item, ItemKind, ShoppingEntry, StockLevel, Tracking } from "../_data/types";
import { supplyGenres, useMockDispatch, useMockState, type RegisterSpec } from "../_state/mock-state";
import { Card, EmptyCard } from "./card";
import { daysFromToday, toInputValue, useToday } from "./dates";
import { Field, FieldsetField, GroupField } from "./form-bits";
import { GenreFieldForKind } from "./genre-field-for-kind";
import { LevelField } from "./level-field";
import { parseQty, settleQty, stepQty } from "./quantity";
import { QtyField } from "./qty-field";
import { DEFAULT_RESTOCK, fromRestockUi } from "./restock-field";
import { PageTitle, ScreenShell } from "./screen-frame";
import { showNotice } from "./undo";

// 在庫登録(check_in)(40_design_brief.md rev3「在庫登録」、決定 7、OD-stock-uiux-18 A)。
// 種別ではなく管理のしかたで分ける。数で管理の品物(食材も日用品も)はカードで個数を直せる(食材は期限・場所も)。
// 新しい品物は種別・管理のしかた・ジャンル・単位を選ぶ。残量で管理の品物は「残量で管理する品物」の欄に並べるだけ。

type Edits = {
  qty?: string;
  qtyError?: string | null;
  expires?: string;
  location?: string;
  kind?: ItemKind;
  tracking?: Tracking;
  genre?: string;
  unit?: string;
  level?: StockLevel;
};
type Errors = { genre?: boolean; unit?: boolean };

const defaultTracking = (kind: ItemKind): Tracking => (kind === "food" ? "count" : "level");

type CardInfo = { entry: ShoppingEntry; item: Item | undefined };

function CountCard({
  info,
  edits,
  errors,
  today,
  onEdit,
}: {
  info: CardInfo;
  edits: Edits;
  errors: Errors;
  today: Date | null;
  onEdit: (patch: Edits) => void;
}) {
  const { masters, items } = useMockState();
  const { entry, item } = info;
  const id = entry.id;
  const isNew = !item;

  // 値の決め方(新しい品物は編集の値、既存の品物は前回の値)
  const kind: ItemKind = item?.kind ?? edits.kind ?? "food";
  const tracking: Tracking = item?.tracking ?? edits.tracking ?? defaultTracking(kind);
  const genre = edits.genre ?? item?.genre ?? "";
  const unit = edits.unit ?? item?.unit ?? "";
  const genreDefault = masters.genres.find((g) => g.name === genre)?.defaultLocation ?? "";
  const location = edits.location ?? (item ? item.location || genreDefault : genreDefault);
  const suggested = item?.suggestDays != null && today ? toInputValue(today, item.suggestDays) : "";
  const expires = edits.expires ?? suggested;
  const qtyText = edits.qty ?? "1";
  const parsed = parseQty(qtyText, "nonneg");
  const food = kind === "food";

  return (
    <li>
      <Card as="section" className="h-full">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-strong break-words">
            {entry.name}
            {food && <span className="sr-only">({location || "場所なし"})</span>}
          </h3>
          {isNew ? <Badge variant="muted">新しい品物</Badge> : !food && <Badge variant="muted">日用品</Badge>}
        </div>

        {isNew && (
          <>
            <GroupField label="種別">
              <ToggleGroup
                joined
                aria-label={`${entry.name}の種別`}
                value={[kind]}
                onValueChange={(v) => {
                  // 種別を変えると、管理のしかたは種別の既定に戻る
                  if ((v[0] === "food" || v[0] === "supply") && v[0] !== kind) {
                    onEdit({ kind: v[0], tracking: defaultTracking(v[0]), genre: "", location: "", expires: "" });
                  }
                }}
              >
                <ToggleGroupItem value="food">食材</ToggleGroupItem>
                <ToggleGroupItem value="supply">日用品</ToggleGroupItem>
              </ToggleGroup>
            </GroupField>
            <FieldsetField legend="管理のしかた">
              <ToggleGroup
                aria-label={`${entry.name}の管理のしかた`}
                value={[tracking]}
                onValueChange={(v) => {
                  if ((v[0] === "count" || v[0] === "level") && v[0] !== tracking) onEdit({ tracking: v[0] });
                }}
              >
                <ToggleGroupItem value="count">数で管理</ToggleGroupItem>
                <ToggleGroupItem value="level">残量で管理</ToggleGroupItem>
              </ToggleGroup>
            </FieldsetField>
            <GenreFieldForKind
              idPrefix={`ci-${id}`}
              kind={kind}
              value={genre}
              candidates={supplyGenres(items)}
              error={errors.genre ? "ジャンルを選んでください" : null}
              onChange={(g) => {
                const d = masters.genres.find((x) => x.name === g)?.defaultLocation;
                // ジャンルを選ぶと場所に既定の場所が入る(ST-F04)
                onEdit({ genre: g, location: kind === "food" ? d || undefined : undefined });
              }}
            />
            {tracking === "count" && (
              <div data-unit-group={id}>
                <GroupField label="単位" error={errors.unit ? "単位を選んでください" : null} errorId={`ci-unit-err-${id}`}>
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
                </GroupField>
              </div>
            )}
          </>
        )}

        {tracking === "count" ? (
          <GroupField label="個数">
            <QtyField
              id={`ci-${id}-qty`}
              label={`${entry.name}の個数`}
              value={qtyText}
              unit={unit}
              showSteppers={isCountUnit(masters, unit)}
              minusDisabled={!parsed.ok || parsed.value <= 1}
              error={edits.qtyError}
              onChange={(text) => onEdit({ qty: text, qtyError: null })}
              onBlur={() => {
                const s = settleQty(qtyText, "positive");
                onEdit({ qty: s.text, qtyError: s.error });
              }}
              onStep={(delta) => {
                const next = stepQty(qtyText, delta, 1);
                if (next !== null) onEdit({ qty: next, qtyError: null });
              }}
            />
          </GroupField>
        ) : (
          <LevelField
            label={`${entry.name}の残量`}
            legend="残量"
            value={edits.level ?? "full"}
            onChange={(l) => onEdit({ level: l })}
          />
        )}

        {food && tracking === "count" && (
          <Field label="期限" htmlFor={`ci-exp-${id}`}>
            <div className="flex items-center gap-2">
              <Input id={`ci-exp-${id}`} type="date" value={expires} onChange={(e) => onEdit({ expires: e.target.value })} />
              <Button type="button" variant="ghost" size="text" aria-label={`${entry.name}の期限をクリア`} onClick={() => onEdit({ expires: "" })}>
                クリア
              </Button>
            </div>
          </Field>
        )}

        {food && (
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
        )}

        {isNew && <p className="mt-4 text-base text-muted-foreground">補充の目安は品物の編集で変えられます。</p>}
      </Card>
    </li>
  );
}

export function CheckInScreen() {
  const { list, items, masters } = useMockState();
  const dispatch = useMockDispatch();
  const router = useRouter();
  const today = useToday();
  const [edits, setEdits] = useState<Record<string, Edits>>({});
  const [errors, setErrors] = useState<Record<string, Errors>>({});

  const checked = list.filter((e) => e.checked);
  // カードにする = 数で管理の品物と新しい品物。残量で管理の品物は名前を並べるだけ(OD-stock-uiux-18 A)
  const cards: CardInfo[] = [];
  const levelEntries: ShoppingEntry[] = [];
  for (const entry of checked) {
    const linked = entry.itemId ? items.find((i) => i.id === entry.itemId) : items.find((i) => i.name === entry.name);
    if (linked?.tracking === "level") levelEntries.push(entry);
    else cards.push({ entry, item: linked });
  }

  const edit = (id: string, patch: Edits) => {
    setEdits((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) },
    }));
    setErrors((prev) => {
      const cur = prev[id];
      if (!cur) return prev;
      return { ...prev, [id]: { genre: patch.genre ? false : cur.genre, unit: patch.unit ? false : cur.unit } };
    });
  };

  const countTotal = cards.filter(({ item, entry }) => (item?.tracking ?? edits[entry.id]?.tracking ?? defaultTracking(item?.kind ?? edits[entry.id]?.kind ?? "food")) === "count").length;

  const confirm = () => {
    const nextErrors: Record<string, Errors> = {};
    const specs: RegisterSpec[] = [];
    let firstError: string | null = null;
    const nextEdits = { ...edits };
    for (const { entry, item } of cards) {
      const e = edits[entry.id] ?? {};
      const kind: ItemKind = item?.kind ?? e.kind ?? "food";
      const tracking: Tracking = item?.tracking ?? e.tracking ?? defaultTracking(kind);
      const genre = e.genre ?? item?.genre ?? "";
      const unit = e.unit ?? item?.unit ?? "";
      const err: Errors = {};
      if (!item) {
        if (kind === "food" && genre === "") err.genre = true;
        if (tracking === "count" && unit === "") err.unit = true;
      }
      let qtyValue = 1;
      let qtyBad = false;
      if (tracking === "count") {
        const r = parseQty(e.qty ?? "1", "positive");
        if (r.ok) qtyValue = r.value;
        else {
          nextEdits[entry.id] = { ...e, qtyError: r.error };
          qtyBad = true;
        }
      }
      if (err.genre || err.unit) nextErrors[entry.id] = err;
      // 最初の誤りの欄: ジャンル → 単位 → 個数(カードの上から)
      if (err.genre) firstError ??= `ci-${entry.id}-genre`;
      else if (err.unit) firstError ??= `unit:${entry.id}`;
      else if (qtyBad) firstError ??= `ci-${entry.id}-qty`;
      const genreDefault = masters.genres.find((g) => g.name === genre)?.defaultLocation ?? "";
      const location = kind === "food" ? (e.location ?? (item ? item.location || genreDefault : genreDefault)) : "";
      const suggested = item?.suggestDays != null && today ? toInputValue(today, item.suggestDays) : "";
      const expires = e.expires ?? suggested;
      const restock = fromRestockUi(DEFAULT_RESTOCK[tracking]);
      specs.push({
        name: entry.name,
        kind,
        tracking,
        genre,
        unit: tracking === "count" ? unit : "",
        location,
        quantity: qtyValue,
        level: e.level ?? "full",
        expiresInDays: kind === "food" && tracking === "count" && today && expires ? daysFromToday(today, expires) : null,
        restockAt: item ? item.restockAt : (restock ?? { kind: "none" }),
        note: "",
      });
    }
    setErrors(nextErrors);
    setEdits(nextEdits);
    if (firstError) {
      // 何も登録せず、最初の誤りの欄へフォーカス
      const target = firstError.startsWith("unit:")
        ? document.querySelector<HTMLElement>(`[data-unit-group="${firstError.slice(5)}"] button`)
        : document.getElementById(firstError);
      target?.focus();
      return;
    }
    dispatch({ type: "checkin/confirm", specs, entryIds: checked.map((e) => e.id) });
    showNotice(`${countTotal}件を在庫に登録しました`);
    router.push("/mock/shopping-list/");
  };

  const hasChecked = checked.length > 0;
  const bar = hasChecked ? (
    <Button type="button" className="w-full" onClick={confirm}>
      {countTotal > 0 ? `${countTotal}件を在庫に登録する` : "リストから消す"}
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
          <p className="mt-2 text-base text-muted-foreground">チェックした品物を在庫に入れます。</p>
          {cards.length > 0 && (
            <ul className="mt-4 grid gap-4 md:grid-cols-[repeat(auto-fill,minmax(21.25rem,1fr))]">
              {cards.map((info) => (
                <CountCard
                  key={info.entry.id}
                  info={info}
                  edits={edits[info.entry.id] ?? {}}
                  errors={errors[info.entry.id] ?? {}}
                  today={today}
                  onEdit={(patch) => edit(info.entry.id, patch)}
                />
              ))}
            </ul>
          )}
          {levelEntries.length > 0 && (
            <section className="mt-6">
              <h2 className="text-lg font-heading">残量で管理する品物</h2>
              <p className="text-base text-muted-foreground">在庫には数えません。残量はチェックしたときに ○ になっています。確定するとリストから消えます。</p>
              <Card className="mt-2">
                <ul>
                  {levelEntries.map((e) => (
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
