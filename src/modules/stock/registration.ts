// 登録の画面の初期値(前回の値、期限の提案、ジャンルの既定の場所)と、登録の内容から「何を書くか」を決める関数。
// OD-stock-food-06 の答えはここだけに効く: (1) ジャンルは品物の値を書き換える / 単位は在庫が 0 件のときだけ書き換え、在庫があるのに違えば誤り /
// 管理のしかたが違えば誤り (2) 期限を空で登録したときは前回の日数を残す (3) 場所なしで登録したら場所なしを覚える (4) 品物の編集では前回の値を変えない。
import { addDays, daysBetween } from "./dates";
import { supplyStockOf } from "./supply";
import type { Item, ItemKind, ItemPatch, NewItem, NewItemStock, StockData, StockLevel, StockPatch, Tracking } from "./types";

export type RegistrationInput = {
  /** 食材か日用品(OD-stock-uiux-40 A)。日用品は genreId・locationId・expiresOn に null を渡す */
  kind: ItemKind;
  /** 前後の空白を除いた品物名 */
  name: string;
  tracking: Tracking;
  genreId: string | null;
  /** 日用品だけ(normalizeFreeText 済み)。null = ジャンルなし */
  supplyGenre: string | null;
  /** 日用品だけ(normalizeFreeText 済み) */
  note: string | null;
  /** 数で管理のとき必須 */
  unitId: string | null;
  /** 数で管理のとき必須(0 より大きい) */
  quantity: number | null;
  /** 残量で管理のときの残量 */
  stockLevel: StockLevel;
  locationId: string | null;
  purchasedOn: string;
  /** 数で管理のときだけ使う。null は期限なし */
  expiresOn: string | null;
};

export type RegistrationPrefill = {
  kind: ItemKind;
  supplyGenre: string | null;
  note: string | null;
  tracking: Tracking;
  genreId: string | null;
  unitId: string | null;
  locationId: string | null;
  expiresOn: string | null;
  stockLevel: StockLevel;
};

export type RegistrationError =
  | { error: "name_empty" }
  | { error: "genre_missing" }
  | { error: "unit_missing" }
  | { error: "quantity_invalid" }
  /** 既存の品物の管理のしかたと違う */
  | { error: "tracking_mismatch"; itemName: string; currentTracking: Tracking }
  /** 既存の品物の在庫があるのに、単位を変えた */
  | { error: "unit_mismatch"; itemName: string; currentUnitId: string }
  /** 別の種別に同じ名前の品物がある(OD-stock-uiux-49 A) */
  | { error: "kind_mismatch"; itemName: string; currentKind: ItemKind };

export type RegistrationPlan = {
  newItem?: NewItem;
  itemPatch?: { id: string; patch: ItemPatch };
  newStock?: NewItemStock;
  /** 数の日用品の既存の在庫に足す(OD-stock-uiux-42 A) */
  stockPatch?: { id: string; patch: StockPatch };
};

export type RegistrationIds = { householdId: string; itemId: string; stockId: string };

export function defaultLocationForGenre(genreId: string, data: StockData): string | null {
  return data.genres.find((g) => g.id === genreId)?.defaultLocationId ?? null;
}

/** 候補を選んだときの初期値: 管理のしかた・ジャンル・単位・場所(品物の場所、無ければジャンルの既定)・期限(購入日 + 前回の日数) */
export function prefillFromItem(item: Item, data: StockData, purchasedOn: string): RegistrationPrefill {
  const locationId = item.locationId ?? (item.genreId ? defaultLocationForGenre(item.genreId, data) : null);
  return {
    kind: item.itemKind,
    supplyGenre: item.supplyGenre,
    note: item.note,
    tracking: item.tracking,
    genreId: item.genreId,
    unitId: item.unitId,
    locationId,
    expiresOn: item.tracking === "count" && item.lastExpiryDays !== null ? addDays(purchasedOn, item.lastExpiryDays) : null,
    stockLevel: item.stockLevel ?? "full",
  };
}

export function findItemByName(name: string, data: StockData): Item | undefined {
  return data.items.find((i) => i.name === name.trim());
}

/**
 * 単位を変えると「残っている在庫の単位の表示が変わってしまう」ので誤りにする(OD-stock-food-06 (1) A)。
 * 食材は在庫の行があるとき。日用品は在庫の行が 0 個でも残る(OD-stock-uiux-42 A)ので、合計が 0 より大きいとき(30 S-06)。
 */
function hasStockToProtect(item: Item, data: StockData): boolean {
  const stocks = data.stocks.filter((s) => s.itemId === item.id);
  return item.itemKind === "supply" ? stocks.reduce((a, s) => a + s.quantity, 0) > 0 : stocks.length > 0;
}

export function validateRegistration(input: RegistrationInput, data: StockData): RegistrationError | null {
  const name = input.name.trim();
  if (name === "") return { error: "name_empty" };
  const existing = findItemByName(name, data);
  if (existing) {
    if (existing.itemKind !== input.kind) {
      return { error: "kind_mismatch", itemName: existing.name, currentKind: existing.itemKind };
    }
    if (existing.tracking !== input.tracking) {
      return { error: "tracking_mismatch", itemName: existing.name, currentTracking: existing.tracking };
    }
    if (
      input.tracking === "count" &&
      existing.unitId !== null &&
      existing.unitId !== input.unitId &&
      hasStockToProtect(existing, data)
    ) {
      return { error: "unit_mismatch", itemName: existing.name, currentUnitId: existing.unitId };
    }
  }
  if (input.kind === "food" && input.genreId === null) return { error: "genre_missing" };
  if (input.tracking === "count") {
    if (input.quantity === null || !(input.quantity > 0)) return { error: "quantity_invalid" };
    if (input.unitId === null) return { error: "unit_missing" };
  }
  return null;
}

export function planRegistration(
  input: RegistrationInput,
  data: StockData,
  ids: RegistrationIds,
): RegistrationPlan | RegistrationError {
  const invalid = validateRegistration(input, data);
  if (invalid) return invalid;
  const name = input.name.trim();
  const isCount = input.tracking === "count";
  const isSupply = input.kind === "supply";
  const expiresOn = isCount && !isSupply ? input.expiresOn : null;
  const days = expiresOn !== null ? daysBetween(input.purchasedOn, expiresOn) : null;
  const existing = findItemByName(name, data);

  if (!existing) {
    const newItem: NewItem = {
      id: ids.itemId,
      householdId: ids.householdId,
      name,
      itemKind: input.kind,
      tracking: input.tracking,
      genreId: isSupply ? null : input.genreId,
      unitId: isCount ? input.unitId : null,
      locationId: isSupply ? null : input.locationId,
      stockLevel: isCount ? null : input.stockLevel,
      restockAtCount: null,
      restockAtLevel: isCount ? null : "low",
      isRegular: false,
      lastExpiryDays: days,
      supplyGenre: isSupply ? input.supplyGenre : null,
      note: isSupply ? input.note : null,
    };
    return isCount ? { newItem, newStock: stockFor(ids.itemId, input, ids) } : { newItem };
  }

  if (isSupply) return planExistingSupply(existing, input, data, ids);

  const patch: ItemPatch = {};
  if (existing.genreId !== input.genreId) patch.genreId = input.genreId;
  if (isCount) {
    if (existing.unitId !== input.unitId) patch.unitId = input.unitId;
    if (existing.locationId !== input.locationId) patch.locationId = input.locationId;
    if (days !== null && existing.lastExpiryDays !== days) patch.lastExpiryDays = days;
  } else {
    if (existing.stockLevel !== input.stockLevel) patch.stockLevel = input.stockLevel;
    if (existing.locationId !== input.locationId) patch.locationId = input.locationId;
  }
  const plan: RegistrationPlan = {};
  if (Object.keys(patch).length > 0) plan.itemPatch = { id: existing.id, patch };
  if (isCount) plan.newStock = stockFor(existing.id, input, ids);
  return plan;
}

/** 既存の日用品への登録(30 Interfaces §4)。ジャンル・備考は書き換え、残量は残量を、数は今の数に足す */
function planExistingSupply(existing: Item, input: RegistrationInput, data: StockData, ids: RegistrationIds): RegistrationPlan {
  const patch: ItemPatch = {};
  if (existing.supplyGenre !== input.supplyGenre) patch.supplyGenre = input.supplyGenre;
  if (existing.note !== input.note) patch.note = input.note;
  const plan: RegistrationPlan = {};
  if (input.tracking === "level") {
    if (existing.stockLevel !== input.stockLevel) patch.stockLevel = input.stockLevel;
  } else {
    if (existing.unitId !== input.unitId) patch.unitId = input.unitId;
    const current = supplyStockOf(existing.id, data);
    if (current) {
      plan.stockPatch = {
        id: current.id,
        patch: { quantity: Math.round((current.quantity + (input.quantity as number)) * 10) / 10, purchasedOn: input.purchasedOn },
      };
    } else {
      plan.newStock = stockFor(existing.id, input, ids);
    }
  }
  if (Object.keys(patch).length > 0) plan.itemPatch = { id: existing.id, patch };
  return plan;
}

function stockFor(itemId: string, input: RegistrationInput, ids: RegistrationIds): NewItemStock {
  const isSupply = input.kind === "supply";
  return {
    id: ids.stockId,
    householdId: ids.householdId,
    itemId,
    quantity: input.quantity as number,
    locationId: isSupply ? null : input.locationId,
    purchasedOn: input.purchasedOn,
    expiresOn: isSupply ? null : input.expiresOn,
  };
}
