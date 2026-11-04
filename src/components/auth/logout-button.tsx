"use client";

import { Button } from "@/components/ui/button";
import { useAuth } from "./auth-context";

// ログアウトの導線(OD-auth-household-16 B)。トップのヘッダーの右に置く、文字だけのボタン。確認は出さない。
export function LogoutButton() {
  const { signOut } = useAuth();
  return (
    <Button type="button" variant="ghost" size="text" onClick={() => void signOut()}>
      ログアウト
    </Button>
  );
}

// ログイン中の人(OD-auth-household-17 A)。トップのタイルの格子の下。
export function AccountNote() {
  const { email } = useAuth();
  if (!email) return null;
  return (
    <section aria-label="アカウント" className="mt-12">
      <p className="text-base wrap-anywhere text-muted-foreground">ログイン中: {email}</p>
    </section>
  );
}
