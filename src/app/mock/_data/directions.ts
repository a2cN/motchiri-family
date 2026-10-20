// モック 1巡目の3つの方向性(40_design_brief.md「3つの方向性」)。値(色など)は tokens.css の [data-direction] の範囲にある。
// この表はモックと一緒に消える。

export const DIRECTIONS = [
  { id: "anzu", letter: "A", name: "あんず", tagline: "落ち着いた、毎日の道具。足場の延長" },
  { id: "sakura", letter: "B", name: "さくらもち", tagline: "ふんわり、やさしい。いちばん「もっちり」" },
  { id: "tamago", letter: "C", name: "たまご", tagline: "明るく、元気。ぽってり" },
] as const;

export type DirectionId = (typeof DIRECTIONS)[number]["id"];
export type Direction = (typeof DIRECTIONS)[number];

export function findDirection(id: string): Direction | undefined {
  return DIRECTIONS.find((d) => d.id === id);
}

export function directionLabel(d: Direction): string {
  return `案${d.letter}「${d.name}」`;
}
