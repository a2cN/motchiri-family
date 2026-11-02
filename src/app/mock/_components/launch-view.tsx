"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckingView } from "./checking-view";

// 起動のながれ: 確かめ中を 2秒 → ログイン画面。起動からログイン画面までのつながりを見るため。
export function LaunchView() {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => router.push("/mock/login/"), 2000);
    return () => clearTimeout(t);
  }, [router]);
  return <CheckingView />;
}
