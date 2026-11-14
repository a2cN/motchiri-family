import { CacheFirst, ExpirationPlugin, Serwist, type PrecacheEntry, type SerwistGlobalConfig } from "serwist";

// service worker(30_architecture.md Interfaces §11、L-15〜L-17)。npm run build が `serwist build` で out/sw.js に束ねる。
// 役目は「電波の無い起動」のために画面の部品(HTML・JS・CSS・RSC の .txt・画像)を端末に置くことだけ。
// Supabase への通信(別のオリジン)はここを通らない・保存しない。認証には関わらない。

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // 画面の URL の ?from=…&id=… は中身を変えない(静的書き出しの HTML は同じ。値はブラウザが読む)ので、照合では無視する
  precacheOptions: { ignoreURLParametersMatching: [/.*/], cleanupOutdatedCaches: true },
  // 新しい版は待たせる(L-16)。切り替えは画面から SKIP_WAITING を送る
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    // Web フォントは小さな断片が数百個あり、precache の上限(5 MB)に入らない。使った断片だけ、使ったときに置く(同じオリジンのものだけ)
    {
      matcher: ({ request, sameOrigin, url }) => sameOrigin && request.destination === "font" && url.pathname.includes("/_next/static/media/"),
      handler: new CacheFirst({
        cacheName: "fonts",
        plugins: [new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 365 })],
      }),
    },
  ],
});

self.addEventListener("message", (event) => {
  if (event.data && (event.data as { type?: string }).type === "SKIP_WAITING") void self.skipWaiting();
});

serwist.addEventListeners();
