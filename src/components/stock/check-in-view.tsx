"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  initialEdits, planCheckIn, toRegistrationInput, type CardEdits, type CardErrors,
} from "@/modules/shopping/check-in";
import type { CheckInCard, CheckInSubmission } from "@/modules/shopping/types";
import { LEVEL_SYMBOL } from "@/modules/stock/levels";
import { formatQuantity, parseQuantity, stepQuantity } from "@/modules/stock/quantity";
import { defaultLocationForGenre } from "@/modules/stock/registration";
import { shoppingListHref } from "@/modules/stock/routes";
import { supplyGenres } from "@/modules/stock/supply";
import type { ItemKind, StockData, StockLevel, Tracking } from "@/modules/stock/types";
import { Field, GroupField, MSG_OFFLINE, NativeSelect, QUANTITY_ERROR, QtyField, RetryButton, StateCard, SupplyGenreField, loadStateBody, notify } from "./bits";
import { Card } from "./card";
import { Frame } from "./frame";
import { useLookup } from "./lookup";
import { OfflineNote } from "./shopping-bits";
import { useShopping } from "./shopping-provider";
import { useAfterDelay, useStock } from "./stock-provider";

// 在庫登録(docs/design/stock/ の mock-check-in*.png と docs/design/stock-shopping/)。種別ではなく管理のしかたで分ける。
// 数で管理の品物(食材も日用品も)はカードで個数を直せる(食材は期限・場所も)。新しい品物は種別・管理のしかた・ジャンル・単位を選ぶ。
// 残量で管理の品物は「残量で管理する品物」の欄に名前を並べるだけ(残量はチェックしたときに ○ になっている)。
// 確定: 行列を送り切る → カードごとに登録 → 成功したカードの行はそのつど消す(途中の失敗は止めて、残りのカードを入れた値のまま残す)。

type Edits = Partial<CardEdits> & { qtyError?: string | null };
const defaultTracking = (kind: ItemKind): Tracking => (kind === "food" ? "count" : "level");

function CountCard({
  card, edits, errors, data, onEdit,
}: {
  card: CheckInCard;
  edits: CardEdits & { qtyError?: string | null };
  errors: CardErrors;
  data: StockData;
  onEdit: (patch: Edits) => void;
}) {
  const lookup = useLookup(data);
  const { entry } = card;
  const id = entry.id;
  const item = card.kind === "count" ? data.items.find((i) => i.id === card.itemId) : undefined;
  const isNew = !item;
  const kind = item ? item.itemKind : edits.kind;
  const tracking = item ? item.tracking : edits.tracking;
  const food = kind === "food";
  const unit = (item ? item.unitId : edits.unitId) ?? null;
  const unitRow = unit ? lookup.units.find((u) => u.id === unit) : undefined;
  const parsed = parseQuantity(edits.qty, "positive");
  const placeName = lookup.locationName(edits.locationId);

  return (
    <li>
      <Card as="section" className="h-full">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-strong break-words" tabIndex={-1} data-card-name={id}>
            {entry.name}
            {food && <span className="sr-only">({placeName || "場所なし"})</span>}
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
                    onEdit({ kind: v[0], tracking: defaultTracking(v[0]), genreId: null, supplyGenre: "", locationId: null, expiresOn: "" });
                  }
                }}
              >
                <ToggleGroupItem value="food">食材</ToggleGroupItem>
                <ToggleGroupItem value="supply">日用品</ToggleGroupItem>
              </ToggleGroup>
            </GroupField>
            <GroupField label="管理のしかた">
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
            </GroupField>
            {food ? (
              <Field label="ジャンル" htmlFor={`ci-${id}-genre`} error={errors.genre ? "ジャンルを選んでください" : null} errorId={`ci-${id}-genre-err`}>
                <NativeSelect
                  id={`ci-${id}-genre`}
                  value={edits.genreId ?? ""}
                  aria-invalid={errors.genre ? true : undefined}
                  onChange={(e) => {
                    const genreId = e.target.value || null;
                    // ジャンルを選ぶと場所に既定の場所が入る(ST-F04)
                    onEdit({ genreId, locationId: genreId ? defaultLocationForGenre(genreId, data) : edits.locationId });
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
              <SupplyGenreField id={`ci-${id}-genre`} value={edits.supplyGenre} onChange={(supplyGenre) => onEdit({ supplyGenre })} candidates={supplyGenres(data)} />
            )}
            {tracking === "count" && (
              <div data-unit-group={id}>
                <GroupField label="単位" error={errors.unit ? "単位を選んでください" : null} errorId={`ci-unit-err-${id}`}>
                  <ToggleGroup aria-label={`${entry.name}の単位`} value={unit ? [unit] : []} onValueChange={(v) => v[0] && onEdit({ unitId: v[0] })}>
                    {lookup.units.map((u) => (
                      <ToggleGroupItem key={u.id} value={u.id}>
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
              value={edits.qty}
              unit={unitRow?.name ?? ""}
              steppers={unitRow?.isCountable ?? true}
              minusDisabled={!parsed.ok || parsed.value <= 1}
              error={edits.qtyError ?? null}
              onChange={(qty) => onEdit({ qty, qtyError: null })}
              onBlur={() => {
                const r = parseQuantity(edits.qty, "positive");
                onEdit(r.ok ? { qty: formatQuantity(r.value), qtyError: null } : { qtyError: QUANTITY_ERROR[r.error] });
              }}
              onStep={(delta) => {
                const r = parseQuantity(edits.qty, "positive");
                onEdit({ qty: formatQuantity(stepQuantity(r.ok ? r.value : 1, delta, "form")), qtyError: null });
              }}
            />
          </GroupField>
        ) : (
          <fieldset className="mt-4 first:mt-0">
            <legend className="mb-1 text-base font-strong">残量</legend>
            <ToggleGroup aria-label={`${entry.name}の残量`} value={[edits.stockLevel]} onValueChange={(v) => v[0] && onEdit({ stockLevel: v[0] as StockLevel })}>
              {(["full", "low", "out"] as const).map((l) => (
                <ToggleGroupItem key={l} value={l} aria-label={`残量 ${LEVEL_SYMBOL[l]}`}>
                  {LEVEL_SYMBOL[l]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </fieldset>
        )}

        {food && tracking === "count" && (
          <Field label="期限" htmlFor={`ci-exp-${id}`}>
            <div className="flex items-center gap-2">
              <Input id={`ci-exp-${id}`} type="date" value={edits.expiresOn} onChange={(e) => onEdit({ expiresOn: e.target.value })} />
              <Button type="button" variant="ghost" size="text" aria-label={`${entry.name}の期限をクリア`} onClick={() => onEdit({ expiresOn: "" })}>
                クリア
              </Button>
            </div>
          </Field>
        )}

        {food && (
          <GroupField label="場所">
            <ToggleGroup aria-label={`${entry.name}の場所`} value={edits.locationId ? [edits.locationId] : []} onValueChange={(v) => v[0] && onEdit({ locationId: v[0] })}>
              {lookup.locations.map((l) => (
                <ToggleGroupItem key={l.id} value={l.id}>
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

export function CheckInView() {
  const router = useRouter();
  const { store: shop, snapshot: shopSnap } = useShopping();
  const { store: stock, snapshot: stockSnap } = useStock();
  const { data, today } = stockSnap;
  const offline = stockSnap.connection === "offline" || shopSnap.connection === "offline";
  const loaded = stockSnap.load === "ready" && shopSnap.load === "ready";
  const showLoadingText = useAfterDelay(!loaded && !(stockSnap.load === "error" || shopSnap.load === "error"), 1000);
  const [edits, setEdits] = useState<Record<string, Edits>>({});
  const [errors, setErrors] = useState<Record<string, CardErrors>>({});
  const busy = useRef(false);

  const back = shoppingListHref();
  const frame = { back: "list", backHref: back, active: "shopping-list", title: "在庫に登録" } as const;

  if (!loaded) {
    const failed = stockSnap.load === "error" || shopSnap.load === "error";
    if (failed && offline) {
      return (
        <Frame {...frame}>
          <StateCard role="status" title="電波がありません" className="mt-4 md:w-[calc(50%-0.5rem)]" action={<RetryButton onClick={() => { stock.reload(); shop.reload(); }} />}>
            在庫登録を開くには電波が要ります。電波のある所で、もう一度お試しください。
          </StateCard>
        </Frame>
      );
    }
    const body = loadStateBody({
      load: failed ? "error" : "loading", offline: false, showLoadingText, noun: "在庫と買い物リスト",
      onRetry: () => { stock.reload(); shop.reload(); }, className: "mt-4 md:w-[calc(50%-0.5rem)]",
    });
    return <Frame {...frame}>{body}</Frame>;
  }

  const plan = planCheckIn(shopSnap.entries, data);
  const editsOf = (card: CheckInCard): CardEdits & { qtyError?: string | null } => ({ ...initialEdits(card, data, today), ...edits[card.entry.id] });
  const hasChecked = plan.cards.length + plan.levelEntries.length > 0;
  // 在庫に数を足すカードの数(新しい残量の品物は数えない)
  const countTotal = plan.cards.filter((c) => (c.kind === "count" ? data.items.find((i) => i.id === c.itemId)?.tracking === "count" : editsOf(c).tracking === "count")).length;

  const edit = (id: string, patch: Edits) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    setErrors((prev) => (prev[id] ? { ...prev, [id]: {} } : prev));
  };

  const confirm = async () => {
    if (offline) {
      notify(MSG_OFFLINE);
      return;
    }
    if (busy.current) return;
    const submissions: CheckInSubmission[] = [];
    const nextErrors: Record<string, CardErrors> = {};
    const nextEdits = { ...edits };
    let first: string | null = null;
    for (const card of plan.cards) {
      const e = editsOf(card);
      const r = toRegistrationInput(card, e, data, today);
      if ("errors" in r) {
        nextErrors[card.entry.id] = r.errors;
        // 最初の誤りの欄: ジャンル → 単位 → 個数(カードの上から)
        if (r.errors.genre) first ??= `ci-${card.entry.id}-genre`;
        else if (r.errors.unit) first ??= `unit:${card.entry.id}`;
        else if (r.errors.qty) first ??= `ci-${card.entry.id}-qty`;
        if (r.errors.qty) nextEdits[card.entry.id] = { ...nextEdits[card.entry.id], qtyError: QUANTITY_ERROR[r.errors.qty] };
      } else {
        submissions.push({ entryId: card.entry.id, input: r });
      }
    }
    setErrors(nextErrors);
    setEdits(nextEdits);
    if (first) {
      // 何も登録せず、最初の誤りの欄へフォーカス
      const target = first.startsWith("unit:")
        ? document.querySelector<HTMLElement>(`[data-unit-group="${first.slice(5)}"] button`)
        : document.getElementById(first);
      target?.focus();
      return;
    }
    busy.current = true;
    const result = await shop.checkIn({ submissions, levelEntryIds: plan.levelEntries.map((e) => e.id), register: (input) => stock.register(input) });
    busy.current = false;
    if (result.ok) {
      notify(`${countTotal}件を在庫に登録しました`); // 残量で管理だけのときは「0件…」(承認済みの正典 ab250aa のとおり)
      router.push(back);
      return;
    }
    if (result.reason === "offline" || result.failedEntryId === null) {
      notify(MSG_OFFLINE);
      return;
    }
    const failed = plan.cards.find((c) => c.entry.id === result.failedEntryId);
    const name = failed?.entry.name ?? "";
    // 途中の失敗: 登録済みのカードは消え、残りは入れた値のまま残る(45 の決定 5 A)。失敗したカードへフォーカス
    notify(result.done > 0 ? `${result.done}件を登録しました。${name}から先は登録できませんでした。もう一度お試しください。` : `${name}を登録できませんでした`);
    document.querySelector<HTMLElement>(`[data-card-name="${result.failedEntryId}"]`)?.focus();
  };

  const bar = hasChecked ? (
    <Button type="button" className="w-full" onClick={() => void confirm()}>
      {countTotal > 0 ? `${countTotal}件を在庫に登録する` : "リストから消す"}
    </Button>
  ) : undefined;

  return (
    <Frame {...frame} barAllSizes bar={bar}>
      {offline && <OfflineNote className="mt-4">在庫登録には電波が要ります。入力はできます。登録は電波のある所で押してください。</OfflineNote>}
      {!hasChecked ? (
        <StateCard title="チェックした品物がありません" className="mt-4">
          買い物リストでチェックを付けると、ここに並びます。
        </StateCard>
      ) : (
        <>
          <p className="mt-2 text-base text-muted-foreground">チェックした品物を在庫に入れます。</p>
          {plan.cards.length > 0 && (
            <ul className="mt-4 grid gap-4 md:grid-cols-[repeat(auto-fill,minmax(21.25rem,1fr))]">
              {plan.cards.map((card) => (
                <CountCard
                  key={card.entry.id}
                  card={card}
                  edits={editsOf(card)}
                  errors={errors[card.entry.id] ?? {}}
                  data={data}
                  onEdit={(patch) => edit(card.entry.id, patch)}
                />
              ))}
            </ul>
          )}
          {plan.levelEntries.length > 0 && (
            <section className="mt-6">
              <h2 className="text-lg font-heading">残量で管理する品物</h2>
              <p className="text-base text-muted-foreground">在庫には数えません。残量はチェックしたときに ○ になっています。確定するとリストから消えます。</p>
              <Card className="mt-2">
                <ul>
                  {plan.levelEntries.map((e) => (
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
    </Frame>
  );
}

