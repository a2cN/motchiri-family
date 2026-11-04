"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchMembership,
  readSession,
  signInWithPassword,
  signOutLocal,
  subscribeAuth,
} from "@/lib/supabase/auth";
import { AuthContext, type AuthContextValue, type AuthNotice, type AuthState } from "./auth-context";
import { CheckingView } from "./checking-view";
import { LoginView } from "./login-view";
import { MemberErrorView } from "./member-error-view";
import { UnlinkedView } from "./unlinked-view";
import { TimeoutError, timed, withTimeout } from "./timing";

// ルートの layout が全画面を包む入口の門(30_architecture.md Interfaces §6、D-12)。
// 最初の描画(静的書き出しの HTML を含む)は必ず「確かめ中」。セッションと世帯を確かめるまで、children を描かない。
type Snapshot = {
  state: AuthState;
  userId: string | null;
  email: string | null;
  householdId: string | null;
  notice: AuthNotice;
};

const INITIAL: Snapshot = { state: "checking", userId: null, email: null, householdId: null, notice: null };

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [snap, setSnap] = useState<Snapshot>(INITIAL);
  const snapRef = useRef(snap);
  // 世帯の確かめの重なりを防ぐ(同じ利用者の確かめが動いている間は、新しく始めない)
  const checkingFor = useRef<string | null>(null);

  const checkMember = useCallback(async (userId: string, email: string | null) => {
    if (checkingFor.current === userId) return;
    checkingFor.current = userId;
    setSnap((s) => ({ ...s, state: "member-checking", userId, email, householdId: null }));
    try {
      const result = await timed("世帯の確かめ", () => withTimeout((signal) => fetchMembership(userId, signal)));
      if (result.kind === "linked") {
        setSnap({ state: "ready", userId, email, householdId: result.householdId, notice: null });
      } else if (result.kind === "unlinked") {
        setSnap({ state: "unlinked", userId, email, householdId: null, notice: null });
      } else {
        setSnap((s) => ({ ...s, state: "member-error", userId, email }));
      }
    } catch (e) {
      if (!(e instanceof TimeoutError)) console.error("[auth] 世帯の確かめで予期しない失敗");
      setSnap((s) => ({ ...s, state: "member-error", userId, email }));
    } finally {
      checkingFor.current = null;
    }
  }, []);

  const bootstrap = useCallback(async () => {
    let session;
    try {
      session = await timed("セッションの読み出し", () => withTimeout(() => readSession()));
    } catch {
      setSnap((s) => ({ ...s, state: "member-error" }));
      return;
    }
    if (session.kind === "session") await checkMember(session.userId, session.email);
    else if (session.kind === "none") setSnap({ ...INITIAL, state: "signed-out" });
    else if (session.kind === "invalid") setSnap({ ...INITIAL, state: "signed-out", notice: "expired" });
    else setSnap((s) => ({ ...s, state: "member-error" }));
  }, [checkMember]);

  useEffect(() => {
    snapRef.current = snap;
  }, [snap]);

  useEffect(() => {
    // 画面の最初の描画は「確かめ中」のまま、マウントのあとにセッションを確かめる
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 外部(ブラウザの保存領域と通信)との同期。setState は await のあと
    void bootstrap();
    return subscribeAuth((e) => {
      if (e.event === "signed-out") {
        const current = snapRef.current.state;
        // 自分でログアウトしたときは signOut が先に signed-out にしている。それ以外(期限切れの消失、別のタブ)は「切れた」知らせ
        if (current !== "signed-out" && current !== "checking") {
          setSnap({ ...INITIAL, state: "signed-out", notice: "expired" });
        }
      } else if (snapRef.current.userId !== e.userId && snapRef.current.state !== "checking") {
        // 別のタブでのログインなど、利用者が替わったときだけ世帯を確かめ直す(トークンの更新では確かめない)
        void checkMember(e.userId, e.email);
      }
    });
  }, [bootstrap, checkMember]);

  const signIn = useCallback<AuthContextValue["signIn"]>(
    async (email, password) => {
      const result = await timed("ログイン", () =>
        withTimeout(() => signInWithPassword(email, password)).catch(
          (): { ok: false; reason: "network" } => ({ ok: false, reason: "network" }),
        ),
      );
      if (!result.ok) return { ok: false, reason: result.reason };
      await checkMember(result.userId, result.email);
      return { ok: true };
    },
    [checkMember],
  );

  const signOut = useCallback(async () => {
    // 成功・失敗にかかわらず、画面はログアウトにする
    setSnap({ ...INITIAL, state: "signed-out", notice: "logged-out" });
    await signOutLocal();
  }, []);

  const retry = useCallback(() => {
    const { userId, email } = snapRef.current;
    if (userId) {
      void checkMember(userId, email);
    } else {
      setSnap((s) => ({ ...s, state: "checking" }));
      void bootstrap();
    }
  }, [bootstrap, checkMember]);

  const value = useMemo<AuthContextValue>(
    () => ({ ...snap, signIn, signOut, retry }),
    [snap, signIn, signOut, retry],
  );

  let body: React.ReactNode;
  switch (snap.state) {
    case "checking":
    case "member-checking":
      body = <CheckingView />;
      break;
    case "signed-out":
      body = <LoginView />;
      break;
    case "unlinked":
      body = <UnlinkedView />;
      break;
    case "member-error":
      body = <MemberErrorView />;
      break;
    case "ready":
      body = children;
      break;
  }

  return (
    <AuthContext.Provider value={value}>
      <div data-auth-state={snap.state} className="flex flex-1 flex-col">
        {body}
      </div>
    </AuthContext.Provider>
  );
}
