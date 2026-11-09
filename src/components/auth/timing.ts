import { TimeoutError, withTimeout as withTimeoutMs } from "@/lib/timing";

// ログインと世帯の確かめの通信の上限(OD-auth-household-22 A)。測った値ではない。
// かかった時間はブラウザのコンソールに出る(どこにも送らない)。実機の確認・使ってみたあとで見直す。
export const AUTH_REQUEST_TIMEOUT_MS = 10_000;

export { TimeoutError };

/** 上限(既定は AUTH_REQUEST_TIMEOUT_MS)を超えたら TimeoutError で失敗する。 */
export function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number = AUTH_REQUEST_TIMEOUT_MS): Promise<T> {
  return withTimeoutMs(run, ms);
}

/** かかった時間をコンソールに出す(見直しの材料)。 */
export async function timed<T>(label: string, run: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await run();
  } finally {
    console.info(`[auth] ${label}: ${Math.round(performance.now() - start)}ms(上限 ${AUTH_REQUEST_TIMEOUT_MS}ms)`);
  }
}
