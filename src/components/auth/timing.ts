// ログインと世帯の確かめの通信の上限(OD-auth-household-22 A)。測った値ではない。
// かかった時間はブラウザのコンソールに出る(どこにも送らない)。実機の確認・使ってみたあとで見直す。
export const AUTH_REQUEST_TIMEOUT_MS = 10_000;

export class TimeoutError extends Error {
  constructor() {
    super("timeout");
    this.name = "TimeoutError";
  }
}

/** 上限を超えたら TimeoutError で失敗する。signal は、渡された処理が通信を打ち切るために使える。 */
export async function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  ms: number = AUTH_REQUEST_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new TimeoutError());
    }, ms);
  });
  try {
    return await Promise.race([run(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
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
