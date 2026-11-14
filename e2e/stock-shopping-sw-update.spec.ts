import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "@playwright/test";

// service worker の新しい版への切り替え(L-16)と取り下げ(L-17。雛形 scripts/sw-kill-switch.js)の E2E。
// 公開するものと同じ out/ を一時の場所へ写し、別のポートで配る(ほかの spec が使う out/sw.js・service worker を触らない)。
test.use({ serviceWorkers: "allow" });
test.describe.configure({ mode: "serial" });

const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".txt": "text/plain; charset=utf-8", ".woff2": "font/woff2" };
/** 一時の場所を /motchiri-family/ の下で配る小さなサーバー(scripts/serve-static.mjs と同じ配り方。ディレクトリは index.html) */
function serve(root: string) {
  return http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    const rel = pathname.replace(/^\/motchiri-family\/?/, "");
    let file = path.resolve(root, rel);
    if (!file.startsWith(root)) file = root;
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!pathname.startsWith("/motchiri-family") || !fs.existsSync(file)) {
      res.writeHead(404).end("Not Found");
      return;
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(fs.readFileSync(file));
  });
}

let server: http.Server;
let dir: string;
let origin: string;

test.beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "motchiri-sw-"));
  fs.cpSync(path.resolve(__dirname, "..", "out"), dir, { recursive: true });
  server = serve(dir);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}/motchiri-family/`;
});
test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(dir, { recursive: true, force: true });
});

const swPath = () => path.join(dir, "sw.js");
async function install(page: import("@playwright/test").Page) {
  await page.goto(origin);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 15_000 }).toBe(true);
}

test("新しい版: 届いたら待たせ、画面が裏に回ったときに切り替えて読み直す。最初の導入では読み直さない", async ({ page }) => {
  test.setTimeout(90_000);
  await install(page);
  await page.evaluate(() => {
    (window as unknown as { __kept: number }).__kept = 1; // 読み直されると消える
  });
  // 最初の導入(clientsClaim)では読み直さない
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => (window as unknown as { __kept?: number }).__kept)).toBe(1);
  // 新しい版を置く(バイト列が違えば別の版)
  fs.appendFileSync(swPath(), "\n// new version\n");
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    await reg?.update();
  });
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting !== null), { timeout: 15_000 }).toBe(true);
  // 使っている間は読み直されない
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => (window as unknown as { __kept?: number }).__kept)).toBe(1);
  // 画面が裏に回る → 切り替わって読み直される
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __kept?: number }).__kept ?? 0), { timeout: 15_000 }).toBe(0);
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting ?? null), { timeout: 10_000 }).toBeNull();
});

test("取り下げ: 雛形の sw.js を出すと、次の更新の確かめでキャッシュと登録が消え、画面が読み直される。端末のデータ(IndexedDB)は残る", async ({ page }) => {
  test.setTimeout(90_000);
  await install(page);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("kill-switch-probe", 1);
        open.onupgradeneeded = () => open.result.createObjectStore("x");
        open.onsuccess = () => {
          const tx = open.result.transaction("x", "readwrite");
          tx.objectStore("x").put(1, "k");
          tx.oncomplete = () => (open.result.close(), resolve());
        };
        open.onerror = () => reject(open.error);
      }),
  );
  expect(await page.evaluate(async () => (await caches.keys()).length)).toBeGreaterThan(0);
  // 取り下げは「前の版 + 雛形の sw.js」を出す想定(前の版は service worker を登録しない)。この写しは今の版なので、読み直しのあとの登録だけ止める
  await page.addInitScript(() => {
    if (sessionStorage.getItem("no-register")) navigator.serviceWorker.register = () => Promise.resolve(undefined as unknown as ServiceWorkerRegistration);
  });
  await page.evaluate(() => sessionStorage.setItem("no-register", "1"));
  fs.copyFileSync(path.resolve(__dirname, "..", "scripts", "sw-kill-switch.js"), swPath());
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    await reg?.update();
  });
  // 取り下げのあと、開いている画面は読み直される(その間の evaluate は失敗しうる)
  const settled = () =>
    page
      .evaluate(async () => (await navigator.serviceWorker.getRegistration()) === undefined && (await caches.keys()).length === 0)
      .catch(() => false);
  await expect.poll(settled, { timeout: 20_000 }).toBe(true);
  // 端末のデータは消さない(読み直しの間の evaluate は失敗しうるので、読み直しが落ち着くまで繰り返す)
  const kept = () =>
    page
      .evaluate(
        () =>
          new Promise<number>((resolve) => {
            const open = indexedDB.open("kill-switch-probe");
            open.onsuccess = () => {
              const get = open.result.transaction("x").objectStore("x").get("k");
              get.onsuccess = () => (open.result.close(), resolve(get.result as number));
            };
          }),
      )
      .catch(() => -1);
  await expect.poll(kept, { timeout: 15_000 }).toBe(1);
});
