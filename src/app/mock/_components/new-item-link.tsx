"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "cn";
import type { NavFrom } from "../_data/types";
import { useMockDispatch } from "../_state/mock-state";

// 「＋ 品物の登録」(主なボタンの見た目のリンク)。開いた元(食材 / 日用品)を覚えて、登録画面の種別と「‹ もどる」に使う。
export function NewItemLink({ from, className }: { from: NavFrom; className?: string }) {
  const dispatch = useMockDispatch();
  return (
    <Link href="/mock/item-new/" className={cn(buttonVariants(), className)} onClick={() => dispatch({ type: "nav/new", from })}>
      <span aria-hidden="true">＋</span>品物の登録
    </Link>
  );
}
