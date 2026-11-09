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

