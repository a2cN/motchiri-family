"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchMembership,
  readSession,
  signInWithPassword,
  signOutLocal,
  subscribeAuth,
} from "@/lib/supabase/auth";
import { clearLocalData } from "@/lib/local/shopping-local";
import { forgetMembership, readMembership, rememberMembership, requestPersistence } from "@/lib/local/membership";
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
  /** 世帯をサーバーで確かめ済みか。false = 覚えた世帯で出している(電波の無い起動。L-18) */
  verified: boolean;
};

const INITIAL: Snapshot = { state: "checking", userId: null, email: null, householdId: null, notice: null, verified: true };

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [snap, setSnap] = useState<Snapshot>(INITIAL);
  const snapRef = useRef(snap);
  // 世帯の確かめの重なりを防ぐ(同じ利用者の確かめが動いている間は、新しく始めない)
  const checkingFor = useRef<string | null>(null);
  const recheckingRef = useRef(false);
  const persistedRef = useRef(false);

  const checkMember = useCallback(async (userId: string, email: string | null) => {
    if (checkingFor.current === userId) return;
    checkingFor.current = userId;
    setSnap((s) => ({ ...s, state: "member-checking", userId, email, householdId: null }));
    // 世帯を確かめられなかったとき、覚えた世帯が同じ利用者のものならそれで出す(L-18)
    const fallback = () => {
      const m = readMembership();
      if (m && m.userId === userId) setSnap({ state: "ready", userId, email, householdId: m.householdId, notice: null, verified: false });
      else setSnap((s) => ({ ...s, state: "member-error", userId, email }));
    };
    try {
      const result = await timed("世帯の確かめ", () => withTimeout((signal) => fetchMembership(userId, signal)));
      if (result.kind === "linked") {
        rememberMembership({ userId, householdId: result.householdId });
        setSnap({ state: "ready", userId, email, householdId: result.householdId, notice: null, verified: true });
      } else if (result.kind === "unlinked") {
        forgetMembership();
        setSnap({ state: "unlinked", userId, email, householdId: null, notice: null, verified: true });
      } else {
        fallback();
      }
    } catch (e) {
      if (!(e instanceof TimeoutError)) console.error("[auth] 世帯の確かめで予期しない失敗");
      fallback();
    } finally {
      checkingFor.current = null;
    }
  }, []);

  const bootstrap = useCallback(async () => {
    // 電波が無く、覚えた世帯があれば、セッションを読まずに出す(前提 A1。10 秒を待たない)
    const remembered = readMembership();
    if (isOffline() && remembered) {
      setSnap({ state: "ready", userId: remembered.userId, email: null, householdId: remembered.householdId, notice: null, verified: false });
      return;
    }
    let session;
    try {
      session = await timed("セッションの読み出し", () => withTimeout(() => readSession()));
    } catch {
      session = { kind: "unavailable" as const };
    }
    if (session.kind === "session") await checkMember(session.userId, session.email);
    else if (session.kind === "none") {
      forgetMembership();
      setSnap({ ...INITIAL, state: "signed-out" });
    } else if (session.kind === "invalid") {
      forgetMembership();
      setSnap({ ...INITIAL, state: "signed-out", notice: "expired" });
    } else if (remembered) {
      setSnap({ state: "ready", userId: remembered.userId, email: null, householdId: remembered.householdId, notice: null, verified: false });
    } else {
      setSnap((s) => ({ ...s, state: "member-error" }));
    }
  }, [checkMember]);

  // 覚えた世帯で出している間(verified: false)の確かめ直し。画面は変えず、結果に応じて切り替える(L-18)
  const recheck = useCallback(async () => {
    const cur = snapRef.current;
    if (cur.state !== "ready" || cur.verified || isOffline() || recheckingRef.current) return;
    recheckingRef.current = true;
    try {
      const session = await withTimeout(() => readSession()).catch(() => ({ kind: "unavailable" as const }));
      if (session.kind === "invalid" || session.kind === "none") {
        forgetMembership();
        setSnap({ ...INITIAL, state: "signed-out", notice: "expired" });
        return;
      }
      if (session.kind !== "session") return;
      const result = await withTimeout((signal) => fetchMembership(session.userId, signal)).catch(() => ({ kind: "error" as const }));
      if (result.kind === "linked") {
        rememberMembership({ userId: session.userId, householdId: result.householdId });
        // 別の世帯なら、端末の写しは DexieShoppingLocal の持ち主の確かめが消す(householdId が変わると Provider が作り直す)
        setSnap({ state: "ready", userId: session.userId, email: session.email, householdId: result.householdId, notice: null, verified: true });
      } else if (result.kind === "unlinked") {
        forgetMembership();
        setSnap({ state: "unlinked", userId: session.userId, email: session.email, householdId: null, notice: null, verified: true });
      }
    } finally {
      recheckingRef.current = false;
    }
  }, []);

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
          // 覚えた世帯だけ消す。端末の写しと行列は残す(次に同じ人・同じ世帯でログインしたら送る。L-19)
          forgetMembership();
          setSnap({ ...INITIAL, state: "signed-out", notice: "expired" });
        }
      } else if (snapRef.current.userId !== e.userId && snapRef.current.state !== "checking") {
        // 別のタブでのログインなど、利用者が替わったときだけ世帯を確かめ直す(トークンの更新では確かめない)
        void checkMember(e.userId, e.email);
      }
    });
  }, [bootstrap, checkMember]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void recheck();
    };
    const onOnline = () => void recheck();
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [recheck]);

  // 世帯が確かめられたあとに1回だけ、ストレージを消えにくくする(ADR 0004 §5)
  useEffect(() => {
    if (snap.state === "ready" && snap.verified && !persistedRef.current) {
      persistedRef.current = true;
      void requestPersistence();
    }
  }, [snap.state, snap.verified]);

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
    // 自分で押したログアウトは、覚えた世帯と端末の写し・行列を消す(L-19、ADR 0004 §4)
    forgetMembership();
    // セッションを先に消す(遅れると、すぐの再読み込みでログインのままになる)。端末のデータはそのあと
    await signOutLocal();
    await clearLocalData().catch(() => undefined);
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
