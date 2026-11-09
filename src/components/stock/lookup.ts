import { useMemo } from "react";
import type { Item, StockData } from "@/modules/stock/types";

/** 画面で使う、id から名前などを引く表 */
export function useLookup(data: StockData) {
  return useMemo(() => {
    const units = new Map(data.units.map((u) => [u.id, u]));
    const locations = new Map(data.locations.map((l) => [l.id, l]));
    const items = new Map(data.items.map((i) => [i.id, i]));
    return {
      unitName: (item: Item) => (item.unitId ? (units.get(item.unitId)?.name ?? "") : ""),
      /** ± で数える単位か。単位が無い品物は数える */
      isCountable: (item: Item) => (item.unitId ? (units.get(item.unitId)?.isCountable ?? true) : true),
      locationName: (id: string | null) => (id ? (locations.get(id)?.name ?? "") : ""),
      item: (id: string) => items.get(id),
      locations: [...data.locations].sort((a, b) => a.sortOrder - b.sortOrder),
      genres: [...data.genres].sort((a, b) => a.sortOrder - b.sortOrder),
      units: [...data.units].sort((a, b) => a.sortOrder - b.sortOrder),
    };
  }, [data]);
}
