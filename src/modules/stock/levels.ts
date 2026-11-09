import type { StockLevel } from "./types";

export const LEVEL_SYMBOL: Record<StockLevel, string> = { full: "○", low: "△", out: "×" };
export const NEXT_LEVEL: Record<StockLevel, StockLevel> = { full: "low", low: "out", out: "full" };
export const LEVEL_VARIANT = { full: "ok", low: "warn", out: "alert" } as const;
