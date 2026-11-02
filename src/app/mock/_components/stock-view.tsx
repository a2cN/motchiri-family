"use client";

import { useMock } from "../_state/mock-state";
import { MockBackHeader, MockMain, MockNote } from "./bits";
import { LogoutButton, LogoutConfirm } from "./logout-control";

// 倉庫の空の画面(足場の正典 §2)の写し。ログアウトの位置が C のときだけ、ヘッダーの右に「ログアウト」。
export function StockView() {
  const { settings } = useMock();
  const c = settings.logoutPos === "c";
  return (
    <>
      <MockBackHeader right={c ? <LogoutButton variant="header" /> : undefined} />
      <MockMain>
        {c ? <LogoutConfirm /> : null}
        <h1 className={`text-2xl font-bold ${c ? "mt-4" : ""}`}>もっちり倉庫</h1>
        <section className="mt-4 rounded-lg bg-muted p-6">
          <h2 className="text-lg font-bold">まだ在庫はありません</h2>
          <p className="text-base text-muted-foreground">
            食材と日用品の在庫は、ここに並ぶ予定です。いまは準備中です。
          </p>
        </section>
        <MockNote />
      </MockMain>
    </>
  );
}
