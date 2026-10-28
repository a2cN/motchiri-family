// マスタ(ジャンル・場所・単位)の初期値は docs/02_要件定義.md §7 の値そのまま。モックと一緒に消える。
// マスタはジャンル・場所・単位の3つだけ(日用品のジャンルはマスタに持たない、OD-stock-uiux-35 B)。
// モックではマスタを触れる(追加・名前の変更・削除)ので、値は状態(_state/mock-state.tsx)が持つ。

export type MasterEntry = {
  name: string;
  /** ジャンルだけ。未選択は "" */
  defaultLocation: string;
  /** 単位だけ。±で数える(OD-stock-uiux-47 の推奨。識別子の案 unit.is_countable) */
  countable: boolean;
};
export type MasterKind = "genres" | "locations" | "units";

export type Masters = Record<MasterKind, MasterEntry[]>;

const entry = (name: string, defaultLocation = "", countable = true): MasterEntry => ({ name, defaultLocation, countable });

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
    units: [entry("個"), entry("本"), entry("パック"), entry("袋"), entry("枚"), entry("g", "", false), entry("ml", "", false)],
  };
}

/** 場所が空(未選択)の在庫のまとまりの名前 */
export const NO_LOCATION_LABEL = "場所なし";

/**
 * 数える単位か(± を出すか)。単位のマスタの「±で数える」で決める(OD-stock-uiux-47 A)。
 * 単位がまだ選ばれていない("")ときは ± を出す。マスタに無い名前は数える単位として扱う。
 */
export function isCountUnit(masters: Masters, unit: string): boolean {
  if (unit === "") return true;
  return masters.units.find((u) => u.name === unit)?.countable ?? true;
}
