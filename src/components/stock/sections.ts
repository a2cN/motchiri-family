import { Package, Refrigerator, ShoppingBasket, SlidersHorizontal, SprayCan, type LucideIcon } from "lucide-react";

// 倉庫の画面の並びの設定(30_architecture.md S-09)。下のタブ(tab: true。スマホと iPad 縦)と iPad 横のサイドバー(sidebar: true)は、ここから描く。
// 並び・ラベル・アイコンは承認済みのモック(docs/design/stock-supply/)のとおり。3b(stock-shopping)で「買い物リスト」を 1 行足した(下のタブは 3 つ、iPad 横のサイドバーは 5 項目)。
export type StockSectionKey = "stock" | "supply" | "shopping-list" | "items" | "masters";
export type StockSection = { key: StockSectionKey; href: string; label: string; icon: LucideIcon; tab: boolean; sidebar: boolean };

export const STOCK_SECTIONS: readonly StockSection[] = [
  { key: "stock", href: "/stock/", label: "食材", icon: Refrigerator, tab: true, sidebar: true },
  { key: "supply", href: "/stock/supply/", label: "日用品", icon: SprayCan, tab: true, sidebar: true },
  { key: "shopping-list", href: "/stock/shopping-list/", label: "買い物リスト", icon: ShoppingBasket, tab: true, sidebar: true },
  { key: "items", href: "/stock/items/", label: "品物", icon: Package, tab: false, sidebar: true },
  { key: "masters", href: "/stock/masters/", label: "マスタ", icon: SlidersHorizontal, tab: false, sidebar: true },
];
