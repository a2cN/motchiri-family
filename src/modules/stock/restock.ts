// 補充の目安(R3-9。30_architecture.md Interfaces §9・L-23)。画面の値(RestockUi)⇄ 列の値(restockAtCount・restockAtLevel)と、補足の文字。
// 列は run 1 のまま: 数 = null(なし)/ 0(切れたら)/ n(数で決める)、残量 = null(なし)/ low(△で)/ out(×で)。
import { formatQuantity } from "./quantity";
import type { Item, Tracking } from "./types";

export type RestockUi = { kind: "none" } | { kind: "zero" } | { kind: "count"; n: number } | { kind: "low" } | { kind: "out" };
export type RestockColumns = { restockAtCount: number | null; restockAtLevel: "low" | "out" | null };

export function toRestockUi(item: Pick<Item, "tracking" | "restockAtCount" | "restockAtLevel">): RestockUi {
  if (item.tracking === "count") {
    if (item.restockAtCount === null) return { kind: "none" };
    return item.restockAtCount === 0 ? { kind: "zero" } : { kind: "count", n: item.restockAtCount };
  }
  return item.restockAtLevel === null ? { kind: "none" } : { kind: item.restockAtLevel };
}

/** 管理のしかたに合わない値(数で管理に △で など)は「なし」にする(DB の check が守る形) */
export function fromRestockUi(tracking: Tracking, ui: RestockUi): RestockColumns {
  if (tracking === "count") {
    if (ui.kind === "zero") return { restockAtCount: 0, restockAtLevel: null };
    if (ui.kind === "count") return { restockAtCount: ui.n, restockAtLevel: null };
    return { restockAtCount: null, restockAtLevel: null };
  }
  if (ui.kind === "low" || ui.kind === "out") return { restockAtCount: null, restockAtLevel: ui.kind };
  return { restockAtCount: null, restockAtLevel: null };
}

/** 新しい品物・管理のしかたを変えたときの既定値(OD-stock-uiux-18 A。数: なし、残量: △で) */
export function restockDefaults(tracking: Tracking): RestockUi {
  return tracking === "count" ? { kind: "none" } : { kind: "low" };
}
export const restockColumnsDefault = (tracking: Tracking): RestockColumns => fromRestockUi(tracking, restockDefaults(tracking));

/** 品物の一覧の補足の文字(正典の部品「補充の目安」) */
export function restockLabel(item: Pick<Item, "tracking" | "restockAtCount" | "restockAtLevel">, unitName: string): string {
  const ui = toRestockUi(item);
  switch (ui.kind) {
    case "none": return "目安なし";
    case "zero": return "目安 切れたら";
    case "count": return `目安 ${formatQuantity(ui.n)} ${unitName}以下`;
    case "low": return "目安 △";
    case "out": return "目安 ×";
  }
}
