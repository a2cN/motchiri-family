"use client";

import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from "react";
import { dataFor, type MockData } from "../_data/fixtures";
import { initialMasters, type MasterEntry, type MasterKind, type Masters } from "../_data/master";
import type {
  DataSnapshot,
  EditFrom,
  Item,
  ItemKind,
  ItemStock,
  Nav,
  NavFrom,
  RestockAt,
  Settings,
  ShoppingEntry,
  StockLevel,
  Tracking,
} from "../_data/types";
import { autoSource, syncList, totalOf } from "./rules";

// モックの状態(30_architecture.md D-10)。メモリだけに持つ。ブラウザの保存領域(Web Storage、IndexedDB、Cookie)と
// 外への通信は使わない。モックのレイアウトに置くので、モックの中を移動しても続き、再読み込みで初期値に戻る。
// モックと一緒に消える。

export type MockState = MockData & {
  masters: Masters;
  settings: Settings;
  nav: Nav;
  /** 外した自動の項目の品物(在庫登録の確定まで、自動では戻さない。OD-stock-uiux-48 A) */
  dismissed: string[];
  /** 新しい id と、チェックした順に振る番号 */
  seq: number;
};

/** 品物の登録・在庫登録の確定が渡す値 */
export type RegisterSpec = {
  name: string;
  kind: ItemKind;
  tracking: Tracking;
  genre: string;
  unit: string;
  location: string;
  quantity: number;
  level: StockLevel;
  expiresInDays: number | null;
  restockAt: RestockAt;
  note: string;
};

export type MockAction =
  | { type: "settings/data"; value: Settings["data"] }
  | { type: "nav/edit"; itemId: string; from: EditFrom }
  | { type: "nav/new"; from: NavFrom }
  | { type: "nav/masters"; from: NavFrom }
  | { type: "nav/items"; from: NavFrom }
  | { type: "nav/itemsKind"; kind: ItemKind }
  | { type: "stock/set"; id: string; quantity: number }
  | { type: "stock/patch"; id: string; patch: Partial<Pick<ItemStock, "location" | "expiresInDays">> }
  | { type: "stock/remove"; id: string }
  | { type: "stock/restore"; stock: ItemStock; index: number }
  | { type: "supply/set"; itemId: string; quantity: number }
  | { type: "level/cycle"; itemId: string }
  | { type: "level/set"; itemId: string; level: StockLevel }
  | { type: "list/toggle"; id: string }
  | { type: "list/remove"; id: string }
  | { type: "list/restore"; entry: ShoppingEntry; index: number }
  | { type: "list/add"; name: string }
  | { type: "memo/set"; value: string }
  | { type: "item/patch"; id: string; patch: Partial<Pick<Item, "name" | "genre" | "unit" | "note" | "location" | "restockAt">> }
  | { type: "item/regular"; id: string; value: boolean }
  | { type: "item/register"; spec: RegisterSpec }
  | {
      type: "item/changeTracking";
      id: string;
      to: Tracking;
      level: StockLevel;
      unit: string;
      quantity: number;
      restockAt: RestockAt;
    }
  | { type: "item/delete"; id: string }
  | { type: "data/restore"; snapshot: DataSnapshot }
  | { type: "checkin/confirm"; specs: RegisterSpec[]; entryIds: string[] }
  | { type: "master/add"; kind: MasterKind; name: string }
  | { type: "master/rename"; kind: MasterKind; from: string; to: string }
  | { type: "master/defaultLocation"; genre: string; location: string }
  | { type: "master/countable"; unit: string; value: boolean }
  | { type: "master/remove"; kind: MasterKind; name: string }
  | { type: "master/restore"; kind: MasterKind; entry: MasterEntry; index: number };

function defaultNav(items: Item[]): Nav {
  // 直接開いたとき・再読み込みのあとは「牛乳」(無ければ最初の食材)
  const milk = items.find((i) => i.name === "牛乳") ?? items.find((i) => i.kind === "food") ?? null;
  return { editItemId: milk?.id ?? null, editFrom: "stock", newFrom: "stock", mastersFrom: "stock", itemsFrom: "stock", itemsKind: "food" };
}

export function createInitialState(): MockState {
  const data = dataFor("initial");
  return {
    ...data,
    masters: initialMasters(),
    settings: { data: "initial" },
    nav: defaultNav(data.items),
    dismissed: [],
    seq: 1,
  };
}

const NEXT_LEVEL: Record<StockLevel, StockLevel> = { full: "low", low: "out", out: "full" };

export function insertAt<T>(items: T[], item: T, index: number): T[] {
  const copy = items.slice();
  copy.splice(Math.min(index, copy.length), 0, item);
  return copy;
}

export const round1 = (n: number) => Math.round(n * 10) / 10;

/** 自動の項目を、いまの在庫・残量・いつもの に合わせる(ST-L01)。reducer の最後に毎回かける */
function sync(state: MockState): MockState {
  let seq = state.seq;
  const list = syncList(state.items, state.stocks, state.list, state.dismissed, () => `e${seq++}`);
  const changed = list.length !== state.list.length || list.some((e, i) => e !== state.list[i]);
  return changed ? { ...state, list, seq } : state;
}

function usedBy(state: MockState, kind: MasterKind, name: string): boolean {
  if (kind === "genres") return state.items.some((i) => i.kind === "food" && i.genre === name);
  if (kind === "units") return state.items.some((i) => i.tracking === "count" && i.unit === name);
  return (
    state.stocks.some((s) => s.location === name) ||
    state.items.some((i) => i.kind === "food" && i.tracking === "level" && i.location === name)
  );
}

export function isMasterUsed(state: MockState, kind: MasterKind, name: string): boolean {
  return usedBy(state, kind, name);
}

/** 品物の登録 / 在庫登録の確定。既存の品物(同じ種別の同じ名前)があればその品物への登録(OD-stock-uiux-30 (3)、49 A) */
function registerInto(state: MockState, spec: RegisterSpec): MockState {
  let { items, stocks, seq } = state;
  const existing = items.find((i) => i.kind === spec.kind && i.name === spec.name);
  const food = spec.kind === "food";
  if (!existing) {
    const id = `n${seq}`;
    seq += 1;
    items = [
      ...items,
      {
        id,
        name: spec.name,
        kind: spec.kind,
        tracking: spec.tracking,
        genre: spec.genre,
        unit: spec.tracking === "count" ? spec.unit : "",
        note: spec.kind === "supply" ? spec.note : "",
        isRegular: false,
        stockLevel: spec.tracking === "level" ? spec.level : "full",
        restockAt: spec.restockAt,
        location: food ? spec.location : "",
        suggestDays: null,
      },
    ];
    if (spec.tracking === "count") {
      stocks = [
        ...stocks,
        {
          id: `n${seq}`,
          itemId: id,
          location: food ? spec.location : "",
          quantity: spec.quantity,
          expiresInDays: food ? spec.expiresInDays : null,
        },
      ];
      seq += 1;
    }
  } else if (existing.tracking === "level") {
    items = items.map((i) => (i.id === existing.id ? { ...i, stockLevel: spec.level } : i));
  } else if (food) {
    stocks = [
      ...stocks,
      { id: `n${seq}`, itemId: existing.id, location: spec.location, quantity: spec.quantity, expiresInDays: spec.expiresInDays },
    ];
    seq += 1;
  } else {
    // 数で管理の日用品は、今の数に足す(OD-stock-uiux-42)
    const own = stocks.find((s) => s.itemId === existing.id);
    if (own) {
      stocks = stocks.map((s) => (s.id === own.id ? { ...s, quantity: round1(s.quantity + spec.quantity) } : s));
    } else {
      stocks = [...stocks, { id: `n${seq}`, itemId: existing.id, location: "", quantity: spec.quantity, expiresInDays: null }];
      seq += 1;
    }
  }
  return { ...state, items, stocks, seq };
}

function reduce(state: MockState, action: MockAction): MockState {
  switch (action.type) {
    case "settings/data": {
      // データを入れ替える(マスタはそのまま)。画面の覚え(nav)も初期に戻す
      const data = dataFor(action.value);
      return { ...state, ...data, settings: { data: action.value }, nav: defaultNav(data.items), dismissed: [] };
    }
    case "nav/edit":
      return { ...state, nav: { ...state.nav, editItemId: action.itemId, editFrom: action.from } };
    case "nav/new":
      return { ...state, nav: { ...state.nav, newFrom: action.from } };
    case "nav/masters":
      return { ...state, nav: { ...state.nav, mastersFrom: action.from } };
    case "nav/items":
      return { ...state, nav: { ...state.nav, itemsFrom: action.from, itemsKind: action.from === "supply" ? "supply" : "food" } };
    case "nav/itemsKind":
      return { ...state, nav: { ...state.nav, itemsKind: action.kind } };

    case "stock/set":
      return { ...state, stocks: state.stocks.map((s) => (s.id === action.id ? { ...s, quantity: round1(Math.max(0.1, action.quantity)) } : s)) };
    case "stock/patch":
      return { ...state, stocks: state.stocks.map((s) => (s.id === action.id ? { ...s, ...action.patch } : s)) };
    case "stock/remove":
      return { ...state, stocks: state.stocks.filter((s) => s.id !== action.id) };
    case "stock/restore":
      return { ...state, stocks: insertAt(state.stocks, action.stock, action.index) };

    case "supply/set": {
      // 数で管理の日用品の数(在庫は品物に1つ。0 でも残る)
      const quantity = round1(Math.max(0, action.quantity));
      const own = state.stocks.find((s) => s.itemId === action.itemId);
      if (own) return { ...state, stocks: state.stocks.map((s) => (s.id === own.id ? { ...s, quantity } : s)) };
      const stock: ItemStock = { id: `n${state.seq}`, itemId: action.itemId, location: "", quantity, expiresInDays: null };
      return { ...state, stocks: [...state.stocks, stock], seq: state.seq + 1 };
    }

    case "level/cycle": {
      const item = state.items.find((i) => i.id === action.itemId);
      if (!item || item.tracking !== "level") return state;
      const level = NEXT_LEVEL[item.stockLevel];
      return { ...state, items: state.items.map((i) => (i.id === item.id ? { ...i, stockLevel: level } : i)) };
    }
    case "level/set":
      return { ...state, items: state.items.map((i) => (i.id === action.itemId ? { ...i, stockLevel: action.level } : i)) };

    case "list/toggle": {
      const entry = state.list.find((e) => e.id === action.id);
      if (!entry) return state;
      const item = entry.itemId !== null ? state.items.find((i) => i.id === entry.itemId) : undefined;
      const levelItem = item !== undefined && item.tracking === "level";
      const checking = !entry.checked;
      let items = state.items;
      let prevLevel: StockLevel | null = entry.prevLevel;
      if (levelItem && item) {
        if (checking) {
          // 残量で管理の品物をチェック → 残量は ○。チェックする前の残量を覚える(ST-D03、OD-stock-uiux-17)
          prevLevel = item.stockLevel;
          items = state.items.map((i) => (i.id === item.id ? { ...i, stockLevel: "full" } : i));
        } else {
          // チェックを外す → チェックする前の残量に戻す
          const back: StockLevel = entry.prevLevel ?? (entry.source === "low" ? "low" : "out");
          items = state.items.map((i) => (i.id === item.id ? { ...i, stockLevel: back } : i));
          prevLevel = null;
        }
      }
      return {
        ...state,
        items,
        seq: checking ? state.seq + 1 : state.seq,
        list: state.list.map((e) => (e.id === entry.id ? { ...e, checked: checking, checkedSeq: checking ? state.seq : 0, prevLevel } : e)),
      };
    }
    case "list/remove": {
      const entry = state.list.find((e) => e.id === action.id);
      if (!entry) return state;
      // 外した自動の項目は、在庫登録の確定まで戻さない(OD-stock-uiux-48 A)
      const dismissed = entry.itemId && entry.source !== "manual" ? [...state.dismissed, entry.itemId] : state.dismissed;
      return { ...state, list: state.list.filter((e) => e.id !== action.id), dismissed };
    }
    case "list/restore":
      return {
        ...state,
        list: insertAt(state.list, action.entry, action.index),
        dismissed: state.dismissed.filter((id) => id !== action.entry.itemId),
      };
    case "list/add":
      return {
        ...state,
        list: [...state.list, { id: `e${state.seq}`, name: action.name, source: "manual", checked: false, itemId: null, checkedSeq: 0, prevLevel: null }],
        seq: state.seq + 1,
      };

    case "memo/set":
      return { ...state, memo: action.value };

    case "item/patch": {
      const before = state.items.find((i) => i.id === action.id);
      if (!before) return state;
      const patch = action.patch;
      return {
        ...state,
        items: state.items.map((i) => (i.id === action.id ? { ...i, ...patch } : i)),
        // 名前を変えたら、結びついた買い物リストの項目の名前も変わる
        list: patch.name === undefined ? state.list : state.list.map((e) => (e.itemId === action.id ? { ...e, name: patch.name as string } : e)),
      };
    }
    case "item/regular": {
      const item = state.items.find((i) => i.id === action.id);
      if (!item) return state;
      return {
        ...state,
        items: state.items.map((i) => (i.id === item.id ? { ...i, isRegular: action.value } : i)),
        // いつもの にしたら、外していた行も戻す
        dismissed: action.value ? state.dismissed.filter((id) => id !== item.id) : state.dismissed,
      };
    }

    case "item/register":
      return registerInto(state, action.spec);

    case "item/changeTracking": {
      const item = state.items.find((i) => i.id === action.id);
      if (!item || item.tracking === action.to) return state;
      const mine = state.stocks.filter((s) => s.itemId === item.id);
      if (action.to === "level") {
        // 数 → 残量: 在庫(期限・場所の行)は消える。食材の場所は最後に登録した在庫の場所を品物に残す(OD-stock-uiux-43 A)
        const lastLocation = mine.length > 0 ? mine[mine.length - 1].location : item.location;
        return {
          ...state,
          items: state.items.map((i) =>
            i.id === item.id ? { ...i, tracking: "level", stockLevel: action.level, restockAt: action.restockAt, location: lastLocation } : i,
          ),
          stocks: state.stocks.filter((s) => s.itemId !== item.id),
        };
      }
      // 残量 → 数: 単位と個数を入れ、在庫を1件作る。食材は 0 なら作らない(日用品は 0 でも1件)
      const next: MockState = {
        ...state,
        items: state.items.map((i) =>
          i.id === item.id ? { ...i, tracking: "count", unit: action.unit, restockAt: action.restockAt, stockLevel: "full" } : i,
        ),
      };
      if (item.kind === "food" && action.quantity <= 0) return next;
      const stock: ItemStock = {
        id: `n${state.seq}`,
        itemId: item.id,
        location: item.kind === "food" ? item.location : "",
        quantity: action.quantity,
        expiresInDays: null,
      };
      return { ...next, stocks: [...next.stocks, stock], seq: state.seq + 1 };
    }

    case "item/delete": {
      // 品物と一緒に、在庫・残量と、買い物リストのその品物の行(発生元・チェックによらず全部)を消す(OD-stock-uiux-44 A)
      const item = state.items.find((i) => i.id === action.id);
      if (!item) return state;
      return {
        ...state,
        items: state.items.filter((i) => i.id !== item.id),
        stocks: state.stocks.filter((s) => s.itemId !== item.id),
        list: state.list.filter((e) => e.itemId !== item.id && !(e.source === "manual" && e.name === item.name)),
        dismissed: state.dismissed.filter((id) => id !== item.id),
      };
    }
    case "data/restore":
      return { ...state, ...action.snapshot };

    case "checkin/confirm": {
      // 確定: 在庫に足し、新しい品物は品物として足し、チェック済みの行をリストから消す。外していた自動の項目は、条件を満たしていれば未チェックで戻る(OD-req-06、OD-stock-uiux-48)
      let next: MockState = state;
      for (const spec of action.specs) next = registerInto(next, spec);
      return { ...next, list: next.list.filter((e) => !action.entryIds.includes(e.id)), dismissed: [] };
    }

    case "master/add": {
      const entry: MasterEntry = { name: action.name, defaultLocation: "", countable: true };
      return { ...state, masters: { ...state.masters, [action.kind]: [...state.masters[action.kind], entry] } };
    }
    case "master/rename": {
      const { kind, from, to } = action;
      const masters: Masters = { ...state.masters, [kind]: state.masters[kind].map((m) => (m.name === from ? { ...m, name: to } : m)) };
      if (kind === "locations") {
        masters.genres = masters.genres.map((g) => (g.defaultLocation === from ? { ...g, defaultLocation: to } : g));
        return {
          ...state,
          masters,
          stocks: state.stocks.map((s) => (s.location === from ? { ...s, location: to } : s)),
          items: state.items.map((i) => (i.location === from ? { ...i, location: to } : i)),
        };
      }
      if (kind === "genres") {
        return { ...state, masters, items: state.items.map((i) => (i.kind === "food" && i.genre === from ? { ...i, genre: to } : i)) };
      }
      return { ...state, masters, items: state.items.map((i) => (i.unit === from ? { ...i, unit: to } : i)) };
    }
    case "master/defaultLocation":
      return {
        ...state,
        masters: {
          ...state.masters,
          genres: state.masters.genres.map((g) => (g.name === action.genre ? { ...g, defaultLocation: action.location } : g)),
        },
      };
    case "master/countable":
      return {
        ...state,
        masters: { ...state.masters, units: state.masters.units.map((u) => (u.name === action.unit ? { ...u, countable: action.value } : u)) },
      };
    case "master/remove":
      return { ...state, masters: { ...state.masters, [action.kind]: state.masters[action.kind].filter((m) => m.name !== action.name) } };
    case "master/restore":
      return { ...state, masters: { ...state.masters, [action.kind]: insertAt(state.masters[action.kind], action.entry, action.index) } };
  }
}

export function reducer(state: MockState, action: MockAction): MockState {
  return sync(reduce(state, action));
}

const StateContext = createContext<MockState>(createInitialState());
const DispatchContext = createContext<Dispatch<MockAction>>(() => {});

export function MockProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>{children}</DispatchContext.Provider>
    </StateContext.Provider>
  );
}

export function useMockState(): MockState {
  return useContext(StateContext);
}

export function useMockDispatch(): Dispatch<MockAction> {
  return useContext(DispatchContext);
}

/** 画面が持つ「元に戻す」のための控え */
export function snapshotOf(state: MockState): DataSnapshot {
  return { items: state.items, stocks: state.stocks, list: state.list, dismissed: state.dismissed };
}

/** 日用品のジャンルの候補(OD-stock-uiux-45 A): いま日用品の品物が使っている語を、最初に使われた順に */
export function supplyGenres(items: Item[]): string[] {
  const out: string[] = [];
  for (const i of items) if (i.kind === "supply" && i.genre !== "" && !out.includes(i.genre)) out.push(i.genre);
  return out;
}

/** 品物名の候補(部分一致)。kind を渡すとその種別だけ */
export function findCandidates(items: Item[], query: string, kind?: ItemKind): Item[] {
  const q = query.trim();
  if (!q) return [];
  return items.filter((i) => (kind ? i.kind === kind : true) && i.name.includes(q));
}

export { autoSource, totalOf };
