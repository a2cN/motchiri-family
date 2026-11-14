import type { Database } from "./database.types";
import { getSupabase } from "./client";
import type { StockFailure, StockResult } from "./stock";
import type { EntryPatch, ShoppingListEntry, ShoppingMemo, ShoppingSource } from "@/modules/shopping/types";
import type { StockLevel } from "@/modules/stock/types";

// 買い物リストとメモの読み書き(supabase-js を呼ぶ。30_architecture.md Interfaces §4)。
// 書き込みは「その値にする」形だけ(冪等)。削除の印の時刻はサーバーの trigger が決める(端末が送った値は保存されない)。

type Tables = Database["public"]["Tables"];
type ListRow = Tables["shopping_list"]["Row"];
type MemoRow = Tables["shopping_memo"]["Row"];

export interface ShoppingApi {
  /** since が null なら全部(削除の印の付いた行を除く)。since があれば updated_at >= since の行(削除の印の付いた行を含む) */
  fetchList(householdId: string, since: string | null, signal: AbortSignal): Promise<StockResult<ShoppingListEntry[]>>;
  fetchMemo(householdId: string, signal: AbortSignal): Promise<StockResult<ShoppingMemo | null>>;
  /** 手入力の行。同じ id が既にあれば何もしない(冪等) */
  insertManual(row: { id: string; householdId: string; name: string }, signal: AbortSignal): Promise<StockResult<null>>;
  /** id の行の列を、その値にする。冪等。0 行は not_found */
  patchEntry(id: string, patch: EntryPatch, signal: AbortSignal): Promise<StockResult<ShoppingListEntry>>;
  setMemo(householdId: string, body: string, signal: AbortSignal): Promise<StockResult<ShoppingMemo>>;
  /** 在庫登録の確定(オンラインだけ。行列を通さない)。ids の行に削除の印。clearDismissed なら、外した印の生きている行にも */
  finishCheckIn(householdId: string, ids: string[], clearDismissed: boolean, signal: AbortSignal): Promise<StockResult<null>>;
  /** 品物の削除の「元に戻す」: 行の削除の印を外し、自動の行は item_id を戻す */
  restoreEntries(rows: Array<{ id: string; itemId: string | null }>, signal: AbortSignal): Promise<StockResult<null>>;
}

export const toEntry = (r: ListRow): ShoppingListEntry => ({
  id: r.id,
  householdId: r.household_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  itemId: r.item_id,
  name: r.name,
  source: r.source as ShoppingSource,
  isChecked: r.is_checked,
  isDismissed: r.is_dismissed,
  prevStockLevel: r.prev_stock_level as StockLevel | null,
  deletedAt: r.deleted_at,
});
export const toMemo = (r: MemoRow): ShoppingMemo => ({ householdId: r.household_id, body: r.body, updatedAt: r.updated_at });

type ErrorLike = { code?: string; message?: string } | null;

function classify(error: ErrorLike): StockFailure {
  if (!error) return "unknown";
  if (error.code === "42501") return "forbidden";
  if (error.code === "23503" || error.code === "23514" || error.code === "23505") return "conflict";
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

export function fetchList(householdId: string, since: string | null, signal: AbortSignal): Promise<StockResult<ShoppingListEntry[]>> {
  return guarded(async () => {
    let q = getSupabase().from("shopping_list").select("*").eq("household_id", householdId);
    q = since === null ? q.is("deleted_at", null) : q.gte("updated_at", since);
    const { data, error } = await q.abortSignal(signal);
    return error ? { ok: false, reason: classify(error) } : { ok: true, value: (data ?? []).map(toEntry) };
  });
}

export function fetchMemo(householdId: string, signal: AbortSignal): Promise<StockResult<ShoppingMemo | null>> {
  return guarded(async () => {
    const { data, error } = await getSupabase().from("shopping_memo").select("*").eq("household_id", householdId).abortSignal(signal).maybeSingle();
    return error ? { ok: false, reason: classify(error) } : { ok: true, value: data ? toMemo(data) : null };
  });
}

export function insertManual(row: { id: string; householdId: string; name: string }, signal: AbortSignal): Promise<StockResult<null>> {
  return guarded(async () => {
    const { error } = await getSupabase()
      .from("shopping_list")
      .upsert({ id: row.id, household_id: row.householdId, name: row.name, source: "manual" }, { onConflict: "id", ignoreDuplicates: true })
      .abortSignal(signal);
    return error ? { ok: false, reason: classify(error) } : { ok: true, value: null };
  });
}

export function patchEntry(id: string, patch: EntryPatch, signal: AbortSignal): Promise<StockResult<ShoppingListEntry>> {
  return guarded(async () => {
    const columns: Tables["shopping_list"]["Update"] = {};
    if (patch.isChecked !== undefined) columns.is_checked = patch.isChecked;
    if (patch.isDismissed !== undefined) columns.is_dismissed = patch.isDismissed;
    // 時刻は trigger が now() にする。端末の時刻は「印を付ける」意味だけ(型のコメント)
    if (patch.deleted !== undefined) columns.deleted_at = patch.deleted ? new Date().toISOString() : null;
    const { data, error } = await getSupabase().from("shopping_list").update(columns).eq("id", id).select().abortSignal(signal);
    if (error) return { ok: false, reason: classify(error) };
    return data && data.length > 0 ? { ok: true, value: toEntry(data[0]) } : { ok: false, reason: "not_found" };
  });
}

export function setMemo(householdId: string, body: string, signal: AbortSignal): Promise<StockResult<ShoppingMemo>> {
  return guarded(async () => {
    const { data, error } = await getSupabase().from("shopping_memo").update({ body }).eq("household_id", householdId).select().abortSignal(signal);
    if (error) return { ok: false, reason: classify(error) };
    return data && data.length > 0 ? { ok: true, value: toMemo(data[0]) } : { ok: false, reason: "not_found" };
  });
}

export function finishCheckIn(householdId: string, ids: string[], clearDismissed: boolean, signal: AbortSignal): Promise<StockResult<null>> {
  return guarded(async () => {
    const db = getSupabase();
    const stamp = new Date().toISOString();
    if (ids.length > 0) {
      const { error } = await db.from("shopping_list").update({ deleted_at: stamp }).in("id", ids).is("deleted_at", null).abortSignal(signal);
      if (error) return { ok: false, reason: classify(error) };
    }
    if (clearDismissed) {
      const { error } = await db
        .from("shopping_list")
        .update({ deleted_at: stamp })
        .eq("household_id", householdId)
        .eq("is_dismissed", true)
        .is("deleted_at", null)
        .abortSignal(signal);
      if (error) return { ok: false, reason: classify(error) };
    }
    return { ok: true, value: null };
  });
}

export function restoreEntries(rows: Array<{ id: string; itemId: string | null }>, signal: AbortSignal): Promise<StockResult<null>> {
  return guarded(async () => {
    const db = getSupabase();
    for (const r of rows) {
      const columns: Tables["shopping_list"]["Update"] = r.itemId ? { deleted_at: null, item_id: r.itemId } : { deleted_at: null };
      const { error } = await db.from("shopping_list").update(columns).eq("id", r.id).abortSignal(signal);
      if (error) return { ok: false, reason: classify(error) };
    }
    return { ok: true, value: null };
  });
}
