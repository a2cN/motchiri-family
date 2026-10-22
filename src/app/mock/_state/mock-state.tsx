"use client";

import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from "react";
import { dataFor, type MockData } from "../_data/fixtures";
import { initialMasters, type MasterEntry, type MasterKind, type Masters } from "../_data/master";
import type { EditFrom, Item, Nav, NavFrom, Settings, ShoppingEntry, Stock, SupplyLevel } from "../_data/types";

// モックの状態(30_architecture.md D-10)。メモリだけに持つ。ブラウザの保存領域(Web Storage、IndexedDB、Cookie)と
// 外への通信は使わない。モックのレイアウトに置くので、モックの中を移動しても続き、再読み込みで初期値に戻る。
// モックと一緒に消える。

export type MockState = MockData & {
  masters: Masters;
  settings: Settings;
  nav: Nav;
  /** 新しい id と、チェックした順に振る番号 */
  seq: number;
};

export type RegisterFood = {
  name: string;
  genre: string;
  unit: string;
  location: string;
  quantity: number;
  expiresInDays: number | null;
};

export type CheckInRow = RegisterFood & { entryId: string };

export type MockAction =
  | { type: "settings/data"; value: Settings["data"] }
  | { type: "settings/undo"; value: Settings["undoSeconds"] }
  | { type: "settings/order"; value: Settings["checkedOrder"] }
  | { type: "nav/edit"; itemId: string; from: EditFrom }
  | { type: "nav/new"; from: NavFrom }
  | { type: "nav/masters"; from: NavFrom }
  | { type: "stock/set"; id: string; quantity: number }
  | { type: "stock/patch"; id: string; patch: Partial<Pick<Stock, "location" | "expiresInDays">> }
  | { type: "stock/remove"; id: string }
  | { type: "stock/restore"; stock: Stock; index: number }
  | { type: "supply/cycle"; itemId: string }
  | { type: "list/toggle"; id: string }
  | { type: "list/remove"; id: string }
  | { type: "list/restore"; entry: ShoppingEntry; index: number }
  | { type: "list/add"; name: string }
  | { type: "memo/set"; value: string }
  | { type: "item/patch"; id: string; patch: Partial<Pick<Item, "name" | "genre" | "unit" | "note">> }
  | { type: "item/regular"; id: string; value: boolean }
  | { type: "item/registerFood"; food: RegisterFood }
  | { type: "item/registerSupply"; name: string; level: SupplyLevel; note: string }
  | { type: "checkin/confirm"; rows: CheckInRow[]; entryIds: string[] }
  | { type: "master/add"; kind: MasterKind; name: string }
  | { type: "master/rename"; kind: MasterKind; from: string; to: string }
  | { type: "master/defaultLocation"; genre: string; location: string }
  | { type: "master/remove"; kind: MasterKind; name: string }
  | { type: "master/restore"; kind: MasterKind; entry: MasterEntry; index: number };

function defaultNav(items: Item[]): Nav {
  // 直接開いたとき・再読み込みのあとは「牛乳」(無ければ最初の食材)
  const milk = items.find((i) => i.name === "牛乳") ?? items.find((i) => i.kind === "food") ?? null;
  return { editItemId: milk?.id ?? null, editFrom: "stock", newFrom: "stock", mastersFrom: "stock" };
}

export function createInitialState(): MockState {
  const data = dataFor("initial");
  return {
    ...data,
    masters: initialMasters(),
    settings: { data: "initial", undoSeconds: 6, checkedOrder: "stay" },
    nav: defaultNav(data.items),
    seq: 1,
  };
}

const NEXT_LEVEL: Record<SupplyLevel, SupplyLevel> = { full: "low", low: "out", out: "full" };

export function insertAt<T>(items: T[], item: T, index: number): T[] {
  const copy = items.slice();
  copy.splice(Math.min(index, copy.length), 0, item);
  return copy;
}

const isSupplySource = (s: ShoppingEntry["source"]) => s === "supply_low" || s === "supply_out";
const sourceFor = (level: SupplyLevel): ShoppingEntry["source"] => (level === "low" ? "supply_low" : "supply_out");

function newEntry(state: MockState, name: string, source: ShoppingEntry["source"], itemId: string | null): [ShoppingEntry, number] {
  return [{ id: `e${state.seq}`, name, source, checked: false, itemId, checkedSeq: 0, prevLevel: null }, state.seq + 1];
}

/** 残量が △・× の日用品を、買い物リストに載せる(または発生元を更新する)。○ のときは、チェックしていなければ外す(ST-L01) */
function syncSupplyEntry(state: MockState, itemId: string, level: SupplyLevel): MockState {
  const item = state.items.find((i) => i.id === itemId);
  if (!item) return state;
  const existing = state.list.find((e) => e.itemId === itemId && isSupplySource(e.source));
  if (level === "full") {
    if (existing && !existing.checked) return { ...state, list: state.list.filter((e) => e.id !== existing.id) };
    return state;
  }
  if (existing) {
    return { ...state, list: state.list.map((e) => (e.id === existing.id ? { ...e, source: sourceFor(level) } : e)) };
  }
  const [entry, seq] = newEntry(state, item.name, sourceFor(level), itemId);
  return { ...state, list: [...state.list, entry], seq };
}

/** いつもの の品物で、買い物リストに無いものを未チェックで足す */
function restoreRegulars(state: MockState): MockState {
  let next = state;
  for (const item of state.items) {
    if (!item.isRegular) continue;
    if (next.list.some((e) => e.itemId === item.id && e.source === "regular")) continue;
    const [entry, seq] = newEntry(next, item.name, "regular", item.id);
    next = { ...next, list: [...next.list, entry], seq };
  }
  return next;
}

function usedBy(state: MockState, kind: MasterKind, name: string): boolean {
  if (kind === "genres") return state.items.some((i) => i.kind === "food" && i.genre === name);
  if (kind === "units") return state.items.some((i) => i.kind === "food" && i.unit === name);
  return state.stocks.some((s) => s.location === name);
}

export function isMasterUsed(state: MockState, kind: MasterKind, name: string): boolean {
  return usedBy(state, kind, name);
}

export function reducer(state: MockState, action: MockAction): MockState {
  switch (action.type) {
    case "settings/data": {
      // データを入れ替える(マスタはそのまま)。画面の覚え(nav)も初期に戻す
      const data = dataFor(action.value);
      return { ...state, ...data, settings: { ...state.settings, data: action.value }, nav: defaultNav(data.items) };
    }
    case "settings/undo":
      return { ...state, settings: { ...state.settings, undoSeconds: action.value } };
    case "settings/order":
      return { ...state, settings: { ...state.settings, checkedOrder: action.value } };
    case "nav/edit":
      return { ...state, nav: { ...state.nav, editItemId: action.itemId, editFrom: action.from } };
    case "nav/new":
      return { ...state, nav: { ...state.nav, newFrom: action.from } };
    case "nav/masters":
      return { ...state, nav: { ...state.nav, mastersFrom: action.from } };

    case "stock/set":
      return { ...state, stocks: state.stocks.map((s) => (s.id === action.id ? { ...s, quantity: Math.max(1, action.quantity) } : s)) };
    case "stock/patch":
      return { ...state, stocks: state.stocks.map((s) => (s.id === action.id ? { ...s, ...action.patch } : s)) };
    case "stock/remove":
      return { ...state, stocks: state.stocks.filter((s) => s.id !== action.id) };
    case "stock/restore":
      return { ...state, stocks: insertAt(state.stocks, action.stock, action.index) };

    case "supply/cycle": {
      const item = state.items.find((i) => i.id === action.itemId);
      if (!item) return state;
      const level = NEXT_LEVEL[item.supplyLevel];
      const next = { ...state, items: state.items.map((i) => (i.id === item.id ? { ...i, supplyLevel: level } : i)) };
      return syncSupplyEntry(next, item.id, level);
    }

    case "list/toggle": {
      const entry = state.list.find((e) => e.id === action.id);
      if (!entry) return state;
      const linkedSupply = entry.itemId !== null && isSupplySource(entry.source);
      const checking = !entry.checked;
      let items = state.items;
      let prevLevel: SupplyLevel | null = entry.prevLevel;
      let source = entry.source;
      if (linkedSupply) {
        const item = state.items.find((i) => i.id === entry.itemId);
        if (checking) {
          // 日用品をチェック → 残量は ○。チェックする前の残量を覚える(ST-D03、OD-stock-uiux-17)
          prevLevel = item ? item.supplyLevel : null;
          items = state.items.map((i) => (i.id === entry.itemId ? { ...i, supplyLevel: "full" } : i));
        } else {
          // チェックを外す → チェックする前の残量に戻す
          const back: SupplyLevel = entry.prevLevel ?? (entry.source === "supply_low" ? "low" : "out");
          items = state.items.map((i) => (i.id === entry.itemId ? { ...i, supplyLevel: back } : i));
          source = sourceFor(back);
          prevLevel = null;
        }
      }
      const seq = checking ? state.seq + 1 : state.seq;
      return {
        ...state,
        items,
        seq,
        list: state.list.map((e) =>
          e.id === entry.id ? { ...e, checked: checking, checkedSeq: checking ? state.seq : 0, prevLevel, source } : e,
        ),
      };
    }
    case "list/remove":
      return { ...state, list: state.list.filter((e) => e.id !== action.id) };
    case "list/restore":
      return { ...state, list: insertAt(state.list, action.entry, action.index) };
    case "list/add": {
      const [entry, seq] = newEntry(state, action.name, "manual", null);
      return { ...state, list: [...state.list, entry], seq };
    }

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
      const next: MockState = { ...state, items: state.items.map((i) => (i.id === item.id ? { ...i, isRegular: action.value } : i)) };
      if (!action.value) {
        // いつもの を外すと、在庫の「いつもの」と買い物リストの いつもの から消える
        return { ...next, list: next.list.filter((e) => !(e.itemId === item.id && e.source === "regular")) };
      }
      return restoreRegulars(next);
    }

    case "item/registerFood": {
      const f = action.food;
      const existing = state.items.find((i) => i.kind === "food" && i.name === f.name);
      let items = state.items;
      let itemId = existing?.id;
      let seq = state.seq;
      if (!existing) {
        itemId = `n${seq}`;
        seq += 1;
        items = [
          ...items,
          {
            id: itemId,
            name: f.name,
            kind: "food",
            genre: f.genre,
            unit: f.unit,
            note: "",
            isRegular: false,
            supplyLevel: "full",
            lastLocation: f.location,
            suggestDays: null,
          },
        ];
      }
      const stock: Stock = { id: `n${seq}`, itemId: itemId as string, location: f.location, quantity: f.quantity, expiresInDays: f.expiresInDays };
      return { ...state, items, stocks: [...state.stocks, stock], seq: seq + 1 };
    }
    case "item/registerSupply": {
      if (state.items.some((i) => i.kind === "supply" && i.name === action.name)) return state;
      const id = `n${state.seq}`;
      const item: Item = {
        id,
        name: action.name,
        kind: "supply",
        genre: "",
        unit: "",
        note: action.note,
        isRegular: false,
        supplyLevel: action.level,
        lastLocation: "",
        suggestDays: null,
      };
      const next: MockState = { ...state, items: [...state.items, item], seq: state.seq + 1 };
      return action.level === "full" ? next : syncSupplyEntry(next, id, action.level);
    }

    case "checkin/confirm": {
      // 確定: 在庫に足し、新しい品物は品物として足し、チェック済みの行をリストから消す。いつもの は未チェックで戻る(OD-req-06、ST-L01)
      let next: MockState = state;
      for (const row of action.rows) next = reducer(next, { type: "item/registerFood", food: row });
      next = { ...next, list: next.list.filter((e) => !action.entryIds.includes(e.id)) };
      return restoreRegulars(next);
    }

    case "master/add": {
      const entry: MasterEntry = { name: action.name, defaultLocation: "" };
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
          items: state.items.map((i) => (i.lastLocation === from ? { ...i, lastLocation: to } : i)),
        };
      }
      const key = kind === "genres" ? "genre" : "unit";
      return { ...state, masters, items: state.items.map((i) => (i.kind === "food" && i[key] === from ? { ...i, [key]: to } : i)) };
    }
    case "master/defaultLocation":
      return {
        ...state,
        masters: {
          ...state.masters,
          genres: state.masters.genres.map((g) => (g.name === action.genre ? { ...g, defaultLocation: action.location } : g)),
        },
      };
    case "master/remove":
      return { ...state, masters: { ...state.masters, [action.kind]: state.masters[action.kind].filter((m) => m.name !== action.name) } };
    case "master/restore":
      return { ...state, masters: { ...state.masters, [action.kind]: insertAt(state.masters[action.kind], action.entry, action.index) } };
  }
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

/** 品物名の候補(部分一致)。kind を渡すとその種別だけ */
export function findCandidates(items: Item[], query: string, kind?: Item["kind"]): Item[] {
  const q = query.trim();
  if (!q) return [];
  return items.filter((i) => (kind ? i.kind === kind : true) && i.name.includes(q));
}
