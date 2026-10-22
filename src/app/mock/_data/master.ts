// マスタ(ジャンル・場所・単位)の初期値は docs/02_要件定義.md §7 の値そのまま。モックと一緒に消える。
// モックではマスタを触れる(追加・名前の変更・削除)ので、値は状態(_state/mock-state.tsx)が持つ。

export type MasterEntry = { name: string; /** ジャンルだけ。未選択は "" */ defaultLocation: string };
export type MasterKind = "genres" | "locations" | "units";

export type Masters = Record<MasterKind, MasterEntry[]>;

const entry = (name: string, defaultLocation = ""): MasterEntry => ({ name, defaultLocation });

export function initialMasters(): Masters {
  return {
    genres: [
      entry("野菜・果物", "冷蔵庫"),
      entry("肉", "冷蔵庫"),
      entry("魚", "冷蔵庫"),
      entry("卵・乳製品", "冷蔵庫"),
      entry("冷凍食品", "冷凍庫"),
      entry("主食(米・パン・麺)", "棚"),
      entry("調味料", "棚"),
      entry("飲み物", "棚"),
      entry("お菓子", "棚"),
      entry("その他", "棚"),
    ],
    locations: ["冷蔵庫", "冷凍庫", "野菜室", "棚"].map((n) => entry(n)),
    units: ["個", "本", "パック", "袋", "枚", "g", "ml"].map((n) => entry(n)),
  };
}

/** 場所が空(未選択)の在庫のまとまりの名前 */
export const NO_LOCATION_LABEL = "場所なし";

/** 数える単位(+1/−1 がある)。g・ml は数の入力欄だけ(ST-F05)。 */
export function isCountUnit(unit: string): boolean {
  return unit !== "g" && unit !== "ml";
}
