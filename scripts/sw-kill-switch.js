// service worker の取り下げ用 sw.js の雛形(30_architecture.md L-17、Migration & Rollback)。ふだんは配らない。
// 使い方: Pages を前の版に戻すとき、戻した版の out/ の直下に、このファイルを `sw.js` として置いて出す。
// 端末は次の更新の確かめ(起動・画面が前面に戻ったとき)でこれを受け取り、キャッシュと登録を全部消して、開いている画面を読み直す。
// 端末のデータ(IndexedDB の写しと行列)は消さない。
self.addEventListener("install", () => {
  void self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) {
        if ("navigate" in client) void client.navigate(client.url);
      }
    })(),
  );
});
