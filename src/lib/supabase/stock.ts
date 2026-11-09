import type { Database } from "./database.types";
import { getSupabase } from "./client";
import type {
  AnyStockRow, Genre, Item, ItemPatch, ItemStock, Location, NewItem, NewItemStock, StockData, StockLevel, StockPatch, Unit,
} from "@/modules/stock/types";

// 倉庫のデータの読み書き(supabase-js を呼ぶのはここだけ。30_architecture.md Interfaces §4)。
// 結果は画面の型(camelCase)に直して返す。失敗は種類だけを返し、エラーの中身(メッセージ)は画面に出さない。

type Tables = Database["public"]["Tables"];
type Row<T extends keyof Tables> = Tables[T]["Row"];

export type StockTable = "genre" | "location" | "unit" | "item" | "item_stock";
export type StockFailure = "network" | "timeout" | "not_found" | "name_taken" | "forbidden" | "unknown";
export type StockResult<T> = { ok: true; value: T } | { ok: false; reason: StockFailure };

// ---- 行の変換(DB の列 ⇄ 画面の型) ----
const base = (r: { id: string; household_id: string; created_at: string; updated_at: string }) => ({
  id: r.id,
  householdId: r.household_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const toLocation = (r: Row<"location">): Location => ({ ...base(r), name: r.name, sortOrder: r.sort_order });
export const toGenre = (r: Row<"genre">): Genre => ({
  ...base(r), name: r.name, defaultLocationId: r.default_location_id, sortOrder: r.sort_order,
});
export const toUnit = (r: Row<"unit">): Unit => ({ ...base(r), name: r.name, isCountable: r.is_countable, sortOrder: r.sort_order });
export const toItem = (r: Row<"item">): Item => ({
  ...base(r),
  name: r.name,
  itemKind: r.item_kind === "supply" ? "supply" : "food",
  tracking: r.tracking === "level" ? "level" : "count",
  genreId: r.genre_id,
  unitId: r.unit_id,
  locationId: r.location_id,
  stockLevel: r.stock_level as StockLevel | null,
  restockAtCount: r.restock_at_count,
  restockAtLevel: r.restock_at_level as "low" | "out" | null,
  isRegular: r.is_regular,
  lastExpiryDays: r.last_expiry_days,
});
export const toItemStock = (r: Row<"item_stock">): ItemStock => ({
  ...base(r),
  itemId: r.item_id,
  quantity: Number(r.quantity),
  locationId: r.location_id,
  purchasedOn: r.purchased_on,
  expiresOn: r.expires_on,
});

/** Realtime の知らせの行(列名は DB のまま)を画面の型に直す */
export function mapRealtimeRow(table: StockTable, record: unknown): AnyStockRow {
  switch (table) {
    case "genre": return toGenre(record as Row<"genre">);
    case "location": return toLocation(record as Row<"location">);
    case "unit": return toUnit(record as Row<"unit">);
    case "item": return toItem(record as Row<"item">);
    case "item_stock": return toItemStock({ ...(record as Row<"item_stock">) });
  }
}

// ---- 失敗の分け方 ----
type ErrorLike = { code?: string; message?: string; details?: string } | null;

function classify(error: ErrorLike): StockFailure {
  if (!error) return "unknown";
  if (error.code === "42501") return "forbidden";
  if (error.code === "23505" && /item_household_id_name_key/.test(`${error.message ?? ""} ${error.details ?? ""}`)) return "name_taken";
  // supabase-js は fetch の例外を、code が空のエラーとして返す
  if (!error.code && /fetch|network|load failed|abort|timed? ?out/i.test(error.message ?? "")) return "network";
  return "unknown";
}

function classifyThrown(e: unknown): StockFailure {
  if (e instanceof Error && e.name === "TimeoutError") return "timeout";
  if (e instanceof TypeError) return "network";
  return "unknown";
}

async function guarded<T>(run: () => Promise<StockResult<T>>): Promise<StockResult<T>> {
  try {
    return await run();
  } catch (e) {
    return { ok: false, reason: classifyThrown(e) };
  }
}

// ---- 読み込み ----
export function fetchStockData(householdId: string, signal: AbortSignal): Promise<StockResult<StockData>> {
  return guarded(async () => {
    const db = getSupabase();
    const [genres, locations, units, items, stocks] = await Promise.all([
      db.from("genre").select("*").eq("household_id", householdId).abortSignal(signal),
      db.from("location").select("*").eq("household_id", householdId).abortSignal(signal),
      db.from("unit").select("*").eq("household_id", householdId).abortSignal(signal),
      db.from("item").select("*").eq("household_id", householdId).abortSignal(signal),
      db.from("item_stock").select("*").eq("household_id", householdId).abortSignal(signal),
    ]);
    for (const r of [genres, locations, units, items, stocks]) if (r.error) return { ok: false, reason: classify(r.error) };
    return {
      ok: true,
      value: {
        genres: (genres.data ?? []).map(toGenre),
        locations: (locations.data ?? []).map(toLocation),
        units: (units.data ?? []).map(toUnit),
        items: (items.data ?? []).map(toItem),
        stocks: (stocks.data ?? []).map(toItemStock),
      },
    };
  });
}

// ---- 品物 ----
const itemColumns = (p: ItemPatch): Partial<Tables["item"]["Update"]> => {
  const out: Partial<Tables["item"]["Update"]> = {};
  if ("genreId" in p) out.genre_id = p.genreId;
  if ("unitId" in p) out.unit_id = p.unitId;
  if ("locationId" in p) out.location_id = p.locationId;
  if ("stockLevel" in p) out.stock_level = p.stockLevel;
  if ("lastExpiryDays" in p) out.last_expiry_days = p.lastExpiryDays;
  return out;
};

export function insertItem(row: NewItem, signal: AbortSignal): Promise<StockResult<Item>> {
  return guarded(async () => {
    const db = getSupabase();
    const { data, error } = await db
      .from("item")
      .insert({
        id: row.id,
        household_id: row.householdId,
        name: row.name,
        item_kind: row.itemKind,
        tracking: row.tracking,
        genre_id: row.genreId,
        unit_id: row.unitId,
        location_id: row.locationId,
        stock_level: row.stockLevel,
        restock_at_count: row.restockAtCount,
        restock_at_level: row.restockAtLevel,
        is_regular: row.isRegular,
        last_expiry_days: row.lastExpiryDays,
      })
      .select()
      .abortSignal(signal)
      .single();
    if (!error) return { ok: true, value: toItem(data) };
    // 同じ id が既にある(送り直し)は、その行を読んで ok
    if (error.code === "23505" && /item_pkey/.test(error.message ?? "")) {
      const again = await db.from("item").select().eq("id", row.id).abortSignal(signal).maybeSingle();
      if (again.data) return { ok: true, value: toItem(again.data) };
    }
    return { ok: false, reason: classify(error) };
  });
}

export function updateItem(id: string, patch: ItemPatch, signal: AbortSignal): Promise<StockResult<Item>> {
  return guarded(async () => {
    const { data, error } = await getSupabase()
      .from("item")
      .update(itemColumns(patch))
      .eq("id", id)
      .select()
      .abortSignal(signal);
    if (error) return { ok: false, reason: classify(error) };
    return data && data.length > 0 ? { ok: true, value: toItem(data[0]) } : { ok: false, reason: "not_found" };
  });
}

// ---- 在庫 ----
export function insertStock(row: NewItemStock, signal: AbortSignal): Promise<StockResult<ItemStock>> {
  return guarded(async () => {
    const db = getSupabase();
    const { data, error } = await db
      .from("item_stock")
      .insert({
        id: row.id,
        household_id: row.householdId,
        item_id: row.itemId,
        quantity: row.quantity,
        location_id: row.locationId,
        purchased_on: row.purchasedOn,
        expires_on: row.expiresOn,
        ...(row.createdAt ? { created_at: row.createdAt } : {}),
      })
      .select()
      .abortSignal(signal)
      .single();
    if (!error) return { ok: true, value: toItemStock(data) };
    // 同じ id が既にある(送り直し・取り消しの重なり)は、その行を読んで ok
    if (error.code === "23505" && /item_stock_pkey/.test(error.message ?? "")) {
      const again = await db.from("item_stock").select().eq("id", row.id).abortSignal(signal).maybeSingle();
      if (again.data) return { ok: true, value: toItemStock(again.data) };
    }
    return { ok: false, reason: classify(error) };
  });
}

export function updateStock(id: string, patch: StockPatch, signal: AbortSignal): Promise<StockResult<ItemStock>> {
  return guarded(async () => {
    const columns: Tables["item_stock"]["Update"] = {};
    if ("quantity" in patch) columns.quantity = patch.quantity;
    if ("locationId" in patch) columns.location_id = patch.locationId;
    if ("expiresOn" in patch) columns.expires_on = patch.expiresOn;
    const { data, error } = await getSupabase().from("item_stock").update(columns).eq("id", id).select().abortSignal(signal);
    if (error) return { ok: false, reason: classify(error) };
    return data && data.length > 0 ? { ok: true, value: toItemStock(data[0]) } : { ok: false, reason: "not_found" };
  });
}

/** 0 行でも ok(もう無い) */
export function deleteStock(id: string, signal: AbortSignal): Promise<StockResult<null>> {
  return guarded(async () => {
    const { error } = await getSupabase().from("item_stock").delete().eq("id", id).abortSignal(signal);
    return error ? { ok: false, reason: classify(error) } : { ok: true, value: null };
  });
}
