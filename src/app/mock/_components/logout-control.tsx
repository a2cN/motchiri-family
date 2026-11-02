"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useMock } from "../_state/mock-state";

// ログアウトの導線(OD-16)。押すと(確認ありなら確認のあと)/mock/login/ へ移り、「ログアウトしました。」を出す。
// variant: section = トップの本文の下(secondary)/ header = ヘッダーの右(文字だけ)。
export function LogoutButton({ variant }: { variant: "section" | "header" }) {
  const router = useRouter();
  const { settings, logout, setConfirmOpen } = useMock();
  function onClick() {
    if (settings.logoutConfirm === "on") {
      setConfirmOpen(true);
      return;
    }
    logout();
    router.push("/mock/login/");
  }
  return variant === "header" ? (
    <Button id="logout-button" type="button" variant="ghost" size="text" onClick={onClick}>
      ログアウト
    </Button>
  ) : (
    <Button id="logout-button" type="button" variant="secondary" className="min-w-40" onClick={onClick}>
      ログアウト
    </Button>
  );
}

// 確認ありのときに、その場に開くパネル。ダイアログは使わない。
export function LogoutConfirm() {
  const router = useRouter();
  const { confirmOpen, setConfirmOpen, logout } = useMock();
  const bodyRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (confirmOpen) bodyRef.current?.focus();
  }, [confirmOpen]);
  if (!confirmOpen) return null;
  return (
    <section aria-label="ログアウトの確認" className="mt-3 rounded-lg bg-muted p-4">
      <p ref={bodyRef} tabIndex={-1} className="text-base text-foreground outline-none">
        ログアウトしますか?
      </p>
      <div className="mt-3 flex flex-col gap-2 md:flex-row">
        <Button
          type="button"
          onClick={() => {
            logout();
            router.push("/mock/login/");
          }}
        >
          ログアウトする
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="text"
          className="h-12"
          onClick={() => {
            setConfirmOpen(false);
            document.getElementById("logout-button")?.focus();
          }}
        >
          やめる
        </Button>
      </div>
    </section>
  );
}
