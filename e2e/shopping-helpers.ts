import { expect, type BrowserContextOptions, type Page, type TestInfo } from "@playwright/test";
import { sql } from "./db";

// 買い物リストのオフライン・同期の spec(stock-shopping-offline.spec.ts、stock-shopping-sync.spec.ts)の共通部品。

export const wait = { timeout: 10_000 };

export const rowOf = (page: Page, name: string) => page.locator("li", { has: page.getByRole("button", { name: `${name}を外す` }) });
export const checkbox = (page: Page, name: string) => rowOf(page, name).getByRole("checkbox");
export const memoBox = (page: Page) => page.getByRole("textbox", { name: "買い物メモ" }).filter({ visible: true });
const addInput = (page: Page) => page.locator('input[id^="shopping-add-"]:visible');
const addButton = (page: Page) => page.locator('form:has(input[id^="shopping-add-"]:visible)').getByRole("button", { name: "追加" });

export async function addManual(page: Page, name: string) {
  await addInput(page).fill(name);
  await addButton(page).click();
  // 欄を外す(外れると下のタブが戻って帯がずれる。そのまま次の行の「外す」を押すと、押した指がボタンから外れる。part 1 の注記 5)
  await addInput(page).blur();
}

/** メモを書く。スマホはメモの画面へ移って書き、買い物リストへ戻る。iPad はそのまま書く */
export async function writeMemo(page: Page, info: TestInfo, text: string) {
  const separate = info.project.name === "iphone-portrait";
  if (separate) {
    await page.getByRole("link", { name: /買い物メモ/ }).click();
    await expect(page.locator("h1")).toHaveText("買い物メモ");
  }
  await memoBox(page).fill(text);
  if (separate) {
    await page.getByRole("link", { name: /もどる/ }).click();
    await expect(page.locator("h1")).toHaveText("買い物リスト");
  }
}

/** ブラウザの電波を切る・戻す(online / offline の出来事も届ける) */
export async function goOffline(page: Page) {
  await page.context().setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline"))).catch(() => undefined);
}
export async function goOnline(page: Page) {
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online"))).catch(() => undefined);
}

export function contextOptions(use: Record<string, unknown>): BrowserContextOptions {
  const keys = ["viewport", "userAgent", "deviceScaleFactor", "isMobile", "hasTouch", "baseURL"];
  return Object.fromEntries(keys.filter((k) => k in use).map((k) => [k, use[k]])) as BrowserContextOptions;
}

type DbEntry = { id: string; name: string; source: string; is_checked: boolean; is_dismissed: boolean; deleted_at: string | null };
/** 生きている行(削除の印の無いもの) */
export const dbEntries = (h: string) =>
  sql(`select id, name, source, is_checked, is_dismissed, deleted_at from public.shopping_list where household_id = '${h}' and deleted_at is null order by created_at, id`) as DbEntry[];
export const dbEntry = (h: string, name: string) => dbEntries(h).find((e) => e.name === name);
export const dbMemo = (h: string) => String(sql(`select body from public.shopping_memo where household_id = '${h}'`)[0]?.body ?? "");
export const setDbMemo = (h: string, body: string) => sql(`update public.shopping_memo set body = '${body.replace(/'/g, "''")}' where household_id = '${h}'`);

/** この端末の IndexedDB(写し)の行数。保存されている(再読み込みしても残る)ことの確かめに使う */
export async function localCounts(page: Page): Promise<{ list: number; outbox: number; cursor: boolean } | null> {
  return page.evaluate(
    () =>
      new Promise<{ list: number; outbox: number; cursor: boolean } | null>((resolve) => {
        const open = indexedDB.open("motchiri-family");
        open.onerror = () => resolve(null);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("shoppingList")) {
            db.close();
            resolve(null);
            return;
          }
          const t = db.transaction(["shoppingList", "outbox", "meta"], "readonly");
          const out = { list: 0, outbox: 0, cursor: false };
          t.objectStore("shoppingList").count().onsuccess = (e) => (out.list = (e.target as IDBRequest<number>).result);
          t.objectStore("outbox").count().onsuccess = (e) => (out.outbox = (e.target as IDBRequest<number>).result);
          t.objectStore("meta").get("cursor").onsuccess = (e) => (out.cursor = (e.target as IDBRequest).result !== undefined);
          t.oncomplete = () => {
            db.close();
            resolve(out);
          };
        };
      }),
  );
}

/**
 * service worker が入り、この画面を受け持つまで待つ(precache は install のうちに済む)。
 * 画面を開いたあとに有効になった場合(最初の訪問。開いた画面は claim されないことがある)は、読み直して受け持たせる。
 */
export async function waitForServiceWorker(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  const controlled = () => page.evaluate(() => navigator.serviceWorker.controller !== null);
  for (let i = 0; i < 20 && !(await controlled()); i++) await page.waitForTimeout(250);
  if (!(await controlled())) {
    await page.reload();
    await expect.poll(controlled, { timeout: 15_000 }).toBe(true);
  }
}
