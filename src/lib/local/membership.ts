// 最後に確かめた世帯の覚え(30_architecture.md Interfaces §10、L-18)。localStorage のキー "motchiri.membership"。
// メールアドレス・名前は入れない(app は public。端末の中だけに置く)。電波の無い起動で、世帯を確かめずに画面を出すために使う。

export type RememberedMembership = { userId: string; householdId: string; verifiedAt: string };

const KEY = "motchiri.membership";

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function parseMembership(raw: string | null): RememberedMembership | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return null;
    const m = v as Record<string, unknown>;
    if (typeof m.userId !== "string" || typeof m.householdId !== "string" || typeof m.verifiedAt !== "string") return null;
    if (m.userId === "" || m.householdId === "") return null;
    return { userId: m.userId, householdId: m.householdId, verifiedAt: m.verifiedAt };
  } catch {
    return null;
  }
}

export function readMembership(): RememberedMembership | null {
  try {
    return parseMembership(storage()?.getItem(KEY) ?? null);
  } catch {
    return null;
  }
}

/** 世帯を確かめられたたびに */
export function rememberMembership(m: { userId: string; householdId: string }, now: Date = new Date()): void {
  try {
    storage()?.setItem(KEY, JSON.stringify({ userId: m.userId, householdId: m.householdId, verifiedAt: now.toISOString() } satisfies RememberedMembership));
  } catch {
    // 保存できなくても動く(電波の無い起動ができないだけ)
  }
}

/** ログアウト・期限切れ・別の利用者 */
export function forgetMembership(): void {
  try {
    storage()?.removeItem(KEY);
  } catch {
    // 同上
  }
}

/** ストレージを消えにくくする(ADR 0004 §5)。結果はコンソールに出すだけ。iOS で許されるかは事後確認 */
export async function requestPersistence(): Promise<void> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.persist) return;
    const granted = await navigator.storage.persist();
    console.info(`[storage] persist(): ${granted ? "許可" : "許可されなかった"}`);
  } catch {
    console.info("[storage] persist(): 呼べなかった");
  }
}
