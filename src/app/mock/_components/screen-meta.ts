import type { Metadata } from "next";
import { directionLabel, findDirection } from "../_data/directions";

// <title>: 「<画面名> — 案<A/B/C>「<名前>」| モック」(40_design_brief.md「共通: ページの枠」)
export async function screenMetadata(params: Promise<{ direction: string }>, screen: string): Promise<Metadata> {
  const { direction } = await params;
  const d = findDirection(direction);
  return { title: { absolute: `${screen} — ${d ? directionLabel(d) : ""}| モック` } };
}
