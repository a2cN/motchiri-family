// 買い物リスト・買い物メモの型(30_architecture.md Interfaces §5)。DB の列との対応は lib/supabase/shopping.ts。
import type { RegistrationInput } from "@/modules/stock/registration";
import type { ItemKind, StockLevel } from "@/modules/stock/types";

/** 発生元(語彙 source)。recipe は将来(ST-L09)で、いまは作らない */
export type ShoppingSource = "regular" | "low" | "out" | "manual" | "recipe";

/** 買い物リストの1項目(DB の shopping_list の1行) */
export type ShoppingListEntry = {
  id: string;
  householdId: string;
  createdAt: string;
  updatedAt: string;
  /** 自動の行が指す品物。手入力の行は null(名前の一致で品物として扱う) */
  itemId: string | null;
  name: string;
  source: ShoppingSource;
  isChecked: boolean;
  /** 自動の行を「外した」。画面に出ない */
  isDismissed: boolean;
  /** 残量で管理の品物をチェックする前の残量(サーバーの trigger だけが書く) */
  prevStockLevel: StockLevel | null;
  /** 削除の印(サーバーの時刻) */
  deletedAt: string | null;
};

export type ShoppingMemo = { householdId: string; body: string; updatedAt: string };

/** 端末が行に対して変えられる列(「その値にする」の形だけ。冪等)。deleted: true は削除の印、false は印を外す */
export type EntryPatch = Partial<{ isChecked: boolean; isDismissed: boolean; deleted: boolean }>;

/** 送信待ち行列の1件(ADR 0004 §3)。op は「その値にする」形だけ */
export type OutboxOp =
  | { seq: number; kind: "insert_manual"; id: string; name: string; at: string }
  | { seq: number; kind: "patch_entry"; id: string; patch: EntryPatch; at: string }
  | { seq: number; kind: "set_memo"; body: string; at: string };
export type NewOutboxOp = OutboxOp extends infer T ? (T extends OutboxOp ? Omit<T, "seq"> : never) : never;

/** 手入力の候補の写し(読むだけ。ADR 0004 §1) */
export type ItemName = { id: string; name: string; itemKind: ItemKind };

export type ShoppingSnapshot = {
  load: "loading" | "ready" | "error";
  connection: "online" | "offline" | "reconnecting";
  /** 画面に出す行(外した・削除の印を除く。並びは作った順) */
  entries: ShoppingListEntry[];
  memo: ShoppingMemo | null;
  candidates: ItemName[];
  /** 未同期の件数(L-20: 行列の宛先の数) */
  pendingCount: number;
  /** 端末に写しがあるか(まだ1度も同期していなければ false) */
  hasLocalCopy: boolean;
};

/** 端末のデータ(写しと行列)への1回の書き込み。1つのトランザクションでまとめる */
export type LocalChange = {
  list?: ShoppingListEntry[];
  memo?: ShoppingMemo;
  cursor?: string | null;
  candidates?: ItemName[];
  /** seq は store が付ける(写しの最大 + 1) */
  outboxAdd?: OutboxOp[];
  outboxPut?: OutboxOp[];
  outboxRemove?: number[];
};

export interface ShoppingLocal {
  load(): Promise<{ list: ShoppingListEntry[]; memo: ShoppingMemo | null; outbox: OutboxOp[]; candidates: ItemName[]; cursor: string | null }>;
  commit(change: LocalChange): Promise<void>;
  /** ログアウト(L-19) */
  clear(): Promise<void>;
}

/** 在庫登録のカード(30 Interfaces §8) */
export type CheckInCard =
  | { kind: "count"; entry: ShoppingListEntry; itemId: string }
  | { kind: "new"; entry: ShoppingListEntry };
export type CheckInPlan = { cards: CheckInCard[]; levelEntries: ShoppingListEntry[] };

export type CheckInSubmission = { entryId: string; input: RegistrationInput };
export type CheckInResult =
  | { ok: true }
  | { ok: false; reason: "offline" | "network" | "timeout" | "unknown" | "conflict" | "forbidden" | "not_found" | "name_taken" | "validation"; failedEntryId: string | null; done: number };
