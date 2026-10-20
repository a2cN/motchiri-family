"use client";

import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from "react";
import { initialFoods, initialList, initialSupplies } from "../_data/fixtures";
import type { FoodStock, ShoppingEntry, SupplyItem, SupplyLevel } from "../_data/types";

// モックの状態(30_architecture.md D-10)。メモリだけに持つ。ブラウザの保存領域(Web Storage、IndexedDB、Cookie)と
// 外への通信は使わない。モックのレイアウトに置くので、モックの中を移動しても続き、再読み込みで初期値に戻る。
// モックと一緒に消える。

export type MockState = {
  foods: FoodStock[];
  supplies: SupplyItem[];
  list: ShoppingEntry[];
  /** 手入力の項目に振る番号 */
  nextId: number;
};

export type MockAction =
  | { type: "food/adjust"; id: string; delta: number }
  | { type: "food/remove"; id: string }
  | { type: "food/restore"; food: FoodStock; index: number }
  | { type: "supply/cycle"; id: string }
  | { type: "list/toggle"; id: string }
  | { type: "list/remove"; id: string }
  | { type: "list/restore"; entry: ShoppingEntry; index: number }
  | { type: "list/add"; name: string };

export const initialState: MockState = {
  foods: initialFoods,
  supplies: initialSupplies,
  list: initialList,
  nextId: 1,
};

const NEXT_LEVEL: Record<SupplyLevel, SupplyLevel> = { full: "low", low: "out", out: "full" };

function insertAt<T>(items: T[], item: T, index: number): T[] {
  const copy = items.slice();
  copy.splice(Math.min(index, copy.length), 0, item);
  return copy;
}

export function reducer(state: MockState, action: MockAction): MockState {
  switch (action.type) {
    case "food/adjust":
      return {
        ...state,
        foods: state.foods.map((f) => (f.id === action.id ? { ...f, quantity: Math.max(0, f.quantity + action.delta) } : f)),
      };
    case "food/remove":
      return { ...state, foods: state.foods.filter((f) => f.id !== action.id) };
    case "food/restore":
      return { ...state, foods: insertAt(state.foods, action.food, action.index) };
    case "supply/cycle":
      return {
        ...state,
        supplies: state.supplies.map((s) => (s.id === action.id ? { ...s, supplyLevel: NEXT_LEVEL[s.supplyLevel] } : s)),
      };
    case "list/toggle":
      return { ...state, list: state.list.map((e) => (e.id === action.id ? { ...e, checked: !e.checked } : e)) };
    case "list/remove":
      return { ...state, list: state.list.filter((e) => e.id !== action.id) };
    case "list/restore":
      return { ...state, list: insertAt(state.list, action.entry, action.index) };
    case "list/add":
      return {
        ...state,
        list: [...state.list, { id: `m${state.nextId}`, name: action.name, source: "manual", checked: false }],
        nextId: state.nextId + 1,
      };
  }
}

const StateContext = createContext<MockState>(initialState);
const DispatchContext = createContext<Dispatch<MockAction>>(() => {});

export function MockProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
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
