"use client";

import { createContext, useContext } from "react";
import type { SignInFailure } from "@/lib/supabase/auth";

// 30_architecture.md Interfaces §6 の状態。
export type AuthState = "checking" | "member-checking" | "signed-out" | "unlinked" | "member-error" | "ready";

/** ログイン画面に出す知らせ(OD-auth-household-16・18)。 */
export type AuthNotice = "logged-out" | "expired" | null;

export type SignInOutcome = { ok: true } | { ok: false; reason: SignInFailure };

export type AuthContextValue = {
  state: AuthState;
  userId: string | null;
  email: string | null;
  householdId: string | null;
  notice: AuthNotice;
  signIn: (email: string, password: string) => Promise<SignInOutcome>;
  signOut: () => Promise<void>;
  retry: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth は AuthGate の中でだけ使える");
  return value;
}
