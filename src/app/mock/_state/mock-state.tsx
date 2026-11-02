"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

// モックの設定と、画面をまたぐ小さな状態。メモリだけ(保存も通信もしない)。再読み込みで初期値に戻る。
// 40_design_brief.md「モックの設定」の11項目 + OD-09・11・13 の選択肢を見比べるための3項目(44 に書いた)。

export type Settings = {
  checking: "a" | "b" | "c"; // OD-12
  loginLayout: "a" | "b" | "c"; // OD-09(追加)
  loginResult: "success" | "credentials" | "network" | "rate" | "unknown"; // OD-11
  errorStyle: "a" | "b" | "c" | "text"; // OD-11(追加)
  wait: "1s" | "forever"; // OD-09(送信中の見た目)
  household: "linked" | "unlinked" | "error"; // OD-13・14
  memberError: "a" | "b" | "c"; // OD-13(追加)
  passwordToggle: "on" | "off"; // OD-10
  unlinkedCopy: "a" | "b" | "c"; // OD-14
  unlinkedRetry: "on" | "off"; // OD-15
  logoutPos: "a" | "b" | "c"; // OD-16
  logoutConfirm: "off" | "on"; // OD-16
  who: "a" | "b" | "c"; // OD-17
  emailLength: "short" | "long"; // OD-17
};

export const DEFAULT_SETTINGS: Settings = {
  checking: "a",
  loginLayout: "a",
  loginResult: "success",
  errorStyle: "a",
  wait: "1s",
  household: "linked",
  memberError: "a",
  passwordToggle: "on",
  unlinkedCopy: "a",
  unlinkedRetry: "off",
  logoutPos: "a",
  logoutConfirm: "off",
  who: "a",
  emailLength: "short",
};

export const EMAIL_SHORT = "taro@example.com";
export const EMAIL_LONG = "sakuramochi.daifuku.family.taro@example.com";

type Notice = "none" | "logged-out";

type MockContext = {
  settings: Settings;
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  email: string;
  notice: Notice;
  clearNotice: () => void;
  logout: () => void; // 知らせを立てる。移動は呼ぶ側が /mock/login/ へ
  confirmOpen: boolean;
  setConfirmOpen: (open: boolean) => void;
};

const Ctx = createContext<MockContext | null>(null);

export function MockProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [notice, setNotice] = useState<Notice>("none");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const set = useCallback<MockContext["set"]>((key, value) => {
    setSettings((s) => ({ ...s, [key]: value }));
    setConfirmOpen(false);
  }, []);
  const clearNotice = useCallback(() => setNotice("none"), []);
  const logout = useCallback(() => {
    setNotice("logged-out");
    setConfirmOpen(false);
  }, []);

  const value = useMemo<MockContext>(
    () => ({
      settings,
      set,
      email: settings.emailLength === "long" ? EMAIL_LONG : EMAIL_SHORT,
      notice,
      clearNotice,
      logout,
      confirmOpen,
      setConfirmOpen,
    }),
    [settings, set, notice, clearNotice, logout, confirmOpen],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMock(): MockContext {
  const v = useContext(Ctx);
  if (!v) throw new Error("MockProvider の外で useMock を呼んだ");
  return v;
}
