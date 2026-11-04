import { isAuthRetryableFetchError, type AuthChangeEvent } from "@supabase/supabase-js";
import { getSupabase } from "./client";

// 認証まわりの呼び出しを、この1か所に集める(@supabase/supabase-js を import してよいのは src/lib/supabase/ だけ。ESLint)。
// 新規登録・パスワードの再設定などを呼ぶ関数は作らない(PT-02。ESLint が呼び出しを禁止する)。

export type SessionRead =
  | { kind: "none" }
  | { kind: "session"; userId: string; email: string | null }
  // 通信の失敗でセッションを確かめられなかった(ログアウトにしない。ADR 0004 §4)
  | { kind: "unavailable" }
  // サーバーがセッションを受け付けなかった(更新トークンが無効など)
  | { kind: "invalid" };

/** ローカルに保存されたセッションを読む。期限が切れていれば、更新のために通信が起きる。 */
export async function readSession(): Promise<SessionRead> {
  try {
    const { data, error } = await getSupabase().auth.getSession();
    if (error) return isAuthRetryableFetchError(error) ? { kind: "unavailable" } : { kind: "invalid" };
    if (!data.session) return { kind: "none" };
    return { kind: "session", userId: data.session.user.id, email: data.session.user.email ?? null };
  } catch {
    return { kind: "unavailable" };
  }
}

export type SignInFailure = "invalid_credentials" | "network" | "rate_limited" | "unknown";
export type SignInResult =
  | { ok: true; userId: string; email: string | null }
  | { ok: false; reason: SignInFailure };

export async function signInWithPassword(email: string, password: string): Promise<SignInResult> {
  try {
    const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
    if (error) {
      if (isAuthRetryableFetchError(error)) return { ok: false, reason: "network" };
      if (error.code === "invalid_credentials") return { ok: false, reason: "invalid_credentials" };
      if (error.code === "over_request_rate_limit" || error.status === 429) return { ok: false, reason: "rate_limited" };
      return { ok: false, reason: "unknown" };
    }
    return { ok: true, userId: data.user.id, email: data.user.email ?? null };
  } catch {
    // fetch が例外を投げたとき(電波が無いなど)
    return { ok: false, reason: "network" };
  }
}

export type Membership = { kind: "linked"; householdId: string } | { kind: "unlinked" } | { kind: "error" };

/** 自分の member の行を1行だけ読む。RLS があるので自分の行しか返らない。0行なら世帯に結びついていない。 */
export async function fetchMembership(userId: string, signal: AbortSignal): Promise<Membership> {
  try {
    const { data, error } = await getSupabase()
      .from("member")
      .select("household_id")
      .eq("user_id", userId)
      .abortSignal(signal)
      .maybeSingle();
    if (error) return { kind: "error" };
    return data ? { kind: "linked", householdId: data.household_id } : { kind: "unlinked" };
  } catch {
    return { kind: "error" };
  }
}

/** この端末だけログアウトする(scope: 'local'。30_architecture.md D-15)。失敗しても例外を投げない。 */
export async function signOutLocal(): Promise<void> {
  try {
    await getSupabase().auth.signOut({ scope: "local" });
  } catch {
    // 失敗しても、画面はログアウトの状態にする(呼び出し側)
  }
}

export type AuthEvent = { event: "signed-in"; userId: string; email: string | null } | { event: "signed-out" };

/** セッションの変化(別のタブでのログイン・ログアウト、期限切れの消失)を購読する。トークンの更新では呼ばない。 */
export function subscribeAuth(onEvent: (e: AuthEvent) => void): () => void {
  const { data } = getSupabase().auth.onAuthStateChange((event: AuthChangeEvent, session) => {
    if (event === "SIGNED_OUT") onEvent({ event: "signed-out" });
    else if (event === "SIGNED_IN" && session) {
      onEvent({ event: "signed-in", userId: session.user.id, email: session.user.email ?? null });
    }
  });
  return () => data.subscription.unsubscribe();
}
