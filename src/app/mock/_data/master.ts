// マスタ(ジャンル・場所・単位)は docs/02_要件定義.md §7 の値そのまま。モックと一緒に消える。

export const LOCATIONS = ["冷蔵庫", "冷凍庫", "野菜室", "棚"] as const;
export type Location = (typeof LOCATIONS)[number];

export const GENRES = [
  { name: "野菜・果物", defaultLocation: "冷蔵庫" },
  { name: "肉", defaultLocation: "冷蔵庫" },
  { name: "魚", defaultLocation: "冷蔵庫" },
  { name: "卵・乳製品", defaultLocation: "冷蔵庫" },
  { name: "冷凍食品", defaultLocation: "冷凍庫" },
  { name: "主食(米・パン・麺)", defaultLocation: "棚" },
  { name: "調味料", defaultLocation: "棚" },
  { name: "飲み物", defaultLocation: "棚" },
  { name: "お菓子", defaultLocation: "棚" },
  { name: "その他", defaultLocation: "棚" },
] as const satisfies readonly { name: string; defaultLocation: Location }[];

export const UNITS = ["個", "本", "パック", "袋", "枚", "g", "ml"] as const;
export type Unit = (typeof UNITS)[number];

/** 数える単位(+1/−1 がある)。g・ml は重さ・量の文字だけ(ST-F05)。 */
export function isCountUnit(unit: Unit): boolean {
  return unit !== "g" && unit !== "ml";
}
