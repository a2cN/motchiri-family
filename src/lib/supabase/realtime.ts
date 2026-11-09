import { getSupabase } from "./client";
import { mapRealtimeRow, type StockTable } from "./stock";
import type { AnyStockRow } from "@/modules/stock/types";

// 世帯の非公開のチャンネル household:<id> の購読(30_architecture.md Interfaces §3・§4)。
// DB の trigger(realtime.broadcast_changes)が送る。読めるのはその世帯の member だけ(realtime.messages のポリシー)。

export type { StockTable };
export type RowChange =
  | { table: StockTable; operation: "INSERT" | "UPDATE"; row: AnyStockRow }
  | { table: StockTable; operation: "DELETE"; oldRow: AnyStockRow };
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

export function subscribeHousehold(
  householdId: string,
  onChange: (change: RowChange) => void,
  onStatus: (status: ChannelStatus) => void,
): () => void {
  const db = getSupabase();
  onStatus("connecting");
  // 非公開のチャンネルは認証の token が要る。supabase-js がログインのたびに realtime.setAuth を呼ぶ
  const channel = db.channel(`household:${householdId}`, { config: { private: true } });
  channel.on("broadcast", { event: "*" }, (message) => {
    const change = parseBroadcast(message as BroadcastPayload);
    if (change) onChange(change);
  });
  channel.subscribe((status, error) => {
    if (status === "SUBSCRIBED") onStatus("subscribed");
    else if (status === "CHANNEL_ERROR" && /Unauthorized|permission/i.test(error?.message ?? "")) onStatus("denied");
    else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") onStatus("reconnecting");
  });
  return () => {
    void db.removeChannel(channel);
  };
}
