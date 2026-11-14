import { getSupabase } from "./client";
import { toEntry, toMemo } from "./shopping";
import { mapRealtimeRow, type StockTable } from "./stock";
import type { ShoppingListEntry, ShoppingMemo } from "@/modules/shopping/types";
import type { AnyStockRow } from "@/modules/stock/types";

// 世帯の非公開のチャンネル household:<id> の購読(30_architecture.md Interfaces §3・§4、L-14)。
// DB の trigger(realtime.broadcast_changes)が送る。読めるのはその世帯の member だけ(realtime.messages のポリシー)。
// チャンネルは世帯ごとに1つだけ開き、倉庫の store と買い物リストの store に配る(参照の数で開け閉めする)。

export type { StockTable };
export type RowChange =
  | { table: StockTable; operation: "INSERT" | "UPDATE"; row: AnyStockRow }
  | { table: StockTable; operation: "DELETE"; oldRow: AnyStockRow };
export type ShoppingChange =
  | { table: "shopping_list"; row: ShoppingListEntry }
  | { table: "shopping_memo"; row: ShoppingMemo };
export type ChannelStatus = "connecting" | "subscribed" | "reconnecting" | "denied";

const TABLES: readonly string[] = ["genre", "location", "unit", "item", "item_stock"];

type BroadcastPayload = {
  payload?: { table?: string; operation?: string; record?: unknown; old_record?: unknown };
};

/** 受け取った知らせを画面の型に直す。形が違うものは捨てる(null) */
export function parseBroadcast(message: BroadcastPayload): RowChange | null {
  const p = message.payload;
  if (!p || !p.table || !TABLES.includes(p.table)) return null;
  const table = p.table as StockTable;
  if (p.operation === "INSERT" || p.operation === "UPDATE") {
    return p.record ? { table, operation: p.operation, row: mapRealtimeRow(table, p.record) } : null;
  }
  if (p.operation === "DELETE") {
    return p.old_record ? { table, operation: "DELETE", oldRow: mapRealtimeRow(table, p.old_record) } : null;
  }
  return null;
}

/** 買い物リスト・メモの知らせ。削除の権限が無いので INSERT・UPDATE だけ */
export function parseShoppingBroadcast(message: BroadcastPayload): ShoppingChange | null {
  const p = message.payload;
  if (!p || !p.record || (p.operation !== "INSERT" && p.operation !== "UPDATE")) return null;
  if (p.table === "shopping_list") return { table: "shopping_list", row: toEntry(p.record as Parameters<typeof toEntry>[0]) };
  if (p.table === "shopping_memo") return { table: "shopping_memo", row: toMemo(p.record as Parameters<typeof toMemo>[0]) };
  return null;
}

type Listener = {
  onStock?: (change: RowChange) => void;
  onShopping?: (change: ShoppingChange) => void;
  onStatus: (status: ChannelStatus) => void;
};
type Hub = { listeners: Set<Listener>; last: ChannelStatus; close: () => void };
const hubs = new Map<string, Hub>();

function open(householdId: string): Hub {
  const db = getSupabase();
  const hub: Hub = { listeners: new Set(), last: "connecting", close: () => undefined };
  const setStatus = (s: ChannelStatus) => {
    hub.last = s;
    for (const l of [...hub.listeners]) l.onStatus(s);
  };
  // 非公開のチャンネルは認証の token が要る。supabase-js がログインのたびに realtime.setAuth を呼ぶ
  const channel = db.channel(`household:${householdId}`, { config: { private: true } });
  channel.on("broadcast", { event: "*" }, (message) => {
    const m = message as BroadcastPayload;
    const stock = parseBroadcast(m);
    if (stock) for (const l of [...hub.listeners]) l.onStock?.(stock);
    const shopping = stock ? null : parseShoppingBroadcast(m);
    if (shopping) for (const l of [...hub.listeners]) l.onShopping?.(shopping);
  });
  channel.subscribe((status, error) => {
    if (status === "SUBSCRIBED") setStatus("subscribed");
    else if (status === "CHANNEL_ERROR" && /Unauthorized|permission/i.test(error?.message ?? "")) setStatus("denied");
    else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setStatus("reconnecting");
  });
  hub.close = () => void db.removeChannel(channel);
  return hub;
}

function acquire(householdId: string, listener: Listener): () => void {
  let hub = hubs.get(householdId);
  if (!hub) {
    hub = open(householdId);
    hubs.set(householdId, hub);
  }
  hub.listeners.add(listener);
  listener.onStatus(hub.last);
  const mine = hub;
  return () => {
    mine.listeners.delete(listener);
    if (mine.listeners.size === 0) {
      if (hubs.get(householdId) === mine) hubs.delete(householdId);
      mine.close();
    }
  };
}

export function subscribeHousehold(
  householdId: string,
  onChange: (change: RowChange) => void,
  onStatus: (status: ChannelStatus) => void,
): () => void {
  return acquire(householdId, { onStock: onChange, onStatus });
}

export function subscribeShopping(
  householdId: string,
  onChange: (change: ShoppingChange) => void,
  onStatus: (status: ChannelStatus) => void,
): () => void {
  return acquire(householdId, { onShopping: onChange, onStatus });
}
