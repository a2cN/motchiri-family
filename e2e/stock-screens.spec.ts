import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { findBottomOverlap, findHorizontalOverflow, findSmallInputs, findSmallTapTargets } from "./checks";
import { loginWith } from "./auth-helpers";
import { sql } from "./db";
import { FIXED_NOW, openStock, resetStock, seedStock, shotPath, stockHousehold, stockWho } from "./stock-helpers";

// 倉庫の画面ごとのスクリーンショットと検査(30_architecture.md Interfaces §10)。承認済みのモックの状態(docs/design/stock-food/)ごとに撮る。
// 出力先は E2E_SCREENSHOT_DIR/<プロジェクト名>/。時計は 2026-10-23(金)正午に固定する。
// 世帯は project ごと(同じ世帯を2つのワーカーが同時に触らない。D-21)。ファイルの中は順に流す。
test.describe.configure({ mode: "serial" });

const chip = (page: Page, group: string, text: string) => page.getByRole("group", { name: group }).getByRole("button", { name: text, exact: true });

/** window の offline の出来事も起こす(Playwright の setOffline は通信を止めるだけで、WebKit では出来事が起きないことがある) */
async function goOffline(page: Page) {
  await page.context().setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
}

type Shot = {
  name: string;
  /** 撮る前の準備。h1 が出た状態で返す */
  prepare: (page: Page, info: TestInfo, household: string) => Promise<void>;
  full?: boolean;
  /** 下の帯の重なりの検査をしない(全体を撮るもの) */
  seed?: boolean;
};

const shots: Shot[] = [
  { name: "stock", prepare: async () => {} },
  { name: "stock-full", full: true, prepare: async () => {} },
  {
    name: "stock-genre",
    prepare: async (page) => {
      await page.getByRole("button", { name: "ジャンル別" }).click();
      await expect(page.getByRole("heading", { name: "卵・乳製品" })).toBeVisible();
    },
  },
  { name: "stock-empty", seed: false, prepare: async (page) => expect(page.getByText("食材の在庫はありません")).toBeVisible() },
  {
    name: "stock-loading",
    prepare: async (page, info) => {
      await page.route(/\/rest\/v1\/item_stock/, async (route) => {
        await new Promise((r) => setTimeout(r, 6000));
        await route.continue().catch(() => {});
      });
      await page.reload();
      await expect(page.getByText("読み込んでいます…")).toBeVisible({ timeout: 5000 });
      void info;
    },
  },
  {
    name: "stock-error",
    prepare: async (page) => {
      await page.route(/\/rest\/v1\/(item_stock|item|genre|location|unit)/, (route) => route.abort("connectionfailed"));
      await page.reload();
      await expect(page.getByRole("heading", { name: "つながりませんでした" })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("button", { name: "もう一度" })).toBeVisible();
    },
  },
  {
    name: "stock-offline-error",
    prepare: async (page) => {
      await page.addInitScript(() => Object.defineProperty(navigator, "onLine", { get: () => false }));
      await page.route(/\/rest\/v1\/(item_stock|item|genre|location|unit)/, (route) => route.abort("connectionfailed"));
      await page.reload();
      await expect(page.getByRole("heading", { name: "電波がありません" })).toBeVisible({ timeout: 15_000 });
    },
  },
  {
    name: "stock-offline",
    prepare: async (page) => {
      await goOffline(page);
      await expect(page.getByRole("status").filter({ hasText: "電波がありません" })).toBeVisible();
    },
  },
  {
    name: "stock-offline-tap",
    prepare: async (page) => {
      await goOffline(page);
      await expect(page.getByRole("status").filter({ hasText: "電波がありません" })).toBeVisible();
      await page.getByRole("button", { name: "ヨーグルトを1増やす" }).click();
      await expect(page.getByText("電波のある所で操作してください", { exact: true })).toBeVisible();
    },
  },
  {
    name: "stock-undo",
    prepare: async (page) => {
      await page.getByRole("button", { name: "牛乳を1減らす" }).first().click();
      await expect(page.getByText("牛乳を使い切りました")).toBeVisible();
      await expect(page.getByRole("button", { name: "元に戻す" })).toBeVisible();
    },
  },
  {
    name: "stock-save-failed",
    prepare: async (page) => {
      await page.route(/\/rest\/v1\/item_stock/, (route) => (route.request().method() === "PATCH" ? route.abort("connectionfailed") : route.continue()));
      await page.getByRole("button", { name: "ヨーグルトを1増やす" }).click();
      await expect(page.getByText("ヨーグルトを保存できませんでした。電波のよい場所で、もう一度お試しください。")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByLabel("ヨーグルトを編集")).toBeVisible();
    },
  },
  {
    name: "stock-gone",
    prepare: async (page, info, household) => {
      // 相手が先に使い切った(この画面は知らない): 画面の Realtime を止めておき、DB から消す
      void info;
      sql(`delete from public.item_stock where household_id = '${household}' and item_id = (select id from public.item where household_id = '${household}' and name = '納豆')`);
      await page.getByRole("button", { name: "納豆を1増やす" }).click();
      await expect(page.getByText("納豆の在庫は、もうありませんでした")).toBeVisible();
    },
  },
];

for (const shot of shots) {
  test(`スクリーンショット: ${shot.name}`, async ({ page, context }, info) => {
    test.setTimeout(60_000);
    const household = stockHousehold(info, "shots");
    resetStock(household);
    if (shot.seed !== false) seedStock(household);
    if (shot.name === "stock-gone") await context.routeWebSocket(/realtime/, () => {});
    await openStock(page, info, 1, "shots");
    if (shot.seed !== false) await expect(page.getByRole("button", { name: "ヨーグルトを1増やす" })).toBeVisible();
    await shot.prepare(page, info, household);
    await page.waitForTimeout(500); // 通知の出入りと描画が落ち着くまで
    await page.screenshot({ path: shotPath(info, shot.name), fullPage: !!shot.full });
    expect(await findHorizontalOverflow(page)).toBeNull();
    expect(await findSmallInputs(page)).toEqual([]);
    expect(await findSmallTapTargets(page)).toEqual([]);
    if (!shot.full) expect(await findBottomOverlap(page)).toBeNull();
  });
}

// ---- 登録・編集の画面 ----
type Sub = {
  name: string;
  url: string;
  prepare: (page: Page, info: TestInfo) => Promise<void>;
  full?: boolean;
  offlineBefore?: boolean;
};
const subs: Sub[] = [
  { name: "item-new", url: "stock/item-new/", prepare: async () => {} },
  { name: "item-new-full", url: "stock/item-new/", full: true, prepare: async () => {} },
  {
    name: "item-new-level",
    url: "stock/item-new/",
    prepare: async (page) => {
      await page.getByRole("button", { name: "残量で管理" }).click();
      await expect(page.getByRole("button", { name: "残量 ○" })).toBeVisible();
    },
  },
  {
    name: "item-new-suggest",
    url: "stock/item-new/",
    prepare: async (page) => {
      await page.getByLabel("品物名").fill("牛");
      await expect(page.getByRole("button", { name: "牛乳", exact: true })).toBeVisible();
    },
  },
  {
    name: "item-new-error",
    url: "stock/item-new/",
    prepare: async (page) => {
      await page.getByRole("button", { name: "登録する" }).click();
      await expect(page.getByText("品物名を入れてください")).toBeVisible();
      await expect(page.getByText("ジャンルを選んでください")).toBeVisible();
      await expect(page.getByText("単位を選んでください")).toBeVisible();
      await expect(page.getByLabel("品物名")).toBeFocused();
    },
  },
  {
    name: "item-new-unit-error",
    url: "stock/item-new/",
    prepare: async (page) => {
      await page.getByLabel("品物名").fill("牛");
      await page.getByRole("button", { name: "牛乳", exact: true }).click();
      await chip(page, "単位", "個").click();
      await page.getByRole("button", { name: "登録する" }).click();
      await expect(page.getByText("牛乳の在庫は「本」で数えています。「本」を選ぶか、在庫を使い切ってから登録してください。")).toBeVisible();
    },
  },
  {
    name: "item-new-tracking-error",
    url: "stock/item-new/",
    prepare: async (page) => {
      await page.getByLabel("品物名").fill("しょ");
      await page.getByRole("button", { name: "しょうゆ", exact: true }).click();
      await chip(page, "管理のしかた", "数で管理").click();
      await page.getByRole("button", { name: "登録する" }).click();
      await expect(page.getByText("しょうゆは「残量で管理」の品物です。「残量で管理」を選んでください。")).toBeVisible();
    },
  },
  {
    name: "item-new-register-failed",
    url: "stock/item-new/",
    prepare: async (page) => {
      await page.route(/\/rest\/v1\/item(\?|$)/, (route) => (route.request().method() === "POST" ? route.abort("connectionfailed") : route.continue()));
      await page.getByLabel("品物名").fill("トマト");
      await page.getByLabel("ジャンル").selectOption({ label: "野菜・果物" });
      await chip(page, "単位", "個").click();
      await page.getByRole("button", { name: "登録する" }).click();
      await expect(page.getByText("トマトを登録できませんでした")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("button", { name: "入れ直す" })).toBeVisible();
    },
  },
  {
    name: "item-new-typing",
    url: "stock/item-new/",
    prepare: async (page) => {
      await page.getByLabel("品物名").focus();
      await expect(page.locator("[data-bottom-stack]")).toHaveCount(0);
    },
  },
  {
    name: "item-new-offline",
    url: "stock/item-new/",
    prepare: async (page) => {
      await goOffline(page);
      await expect(page.getByRole("status").filter({ hasText: "電波がありません" })).toBeVisible();
    },
  },
  { name: "item-edit", url: "stock/", prepare: async (page) => openEdit(page, "牛乳") },
  { name: "item-edit-full", url: "stock/", full: true, prepare: async (page) => openEdit(page, "牛乳") },
  { name: "item-edit-soy", url: "stock/", prepare: async (page) => openEdit(page, "しょうゆ") },
  {
    // 在庫の無い数で管理の品物(一覧に行が無いので、id を引いて直接開く)
    name: "item-edit-bread",
    url: "stock/",
    prepare: async (page, info) => {
      const id = String(sql(`select id from public.item where household_id = '${stockHousehold(info, "shots")}' and name = '食パン'`)[0].id);
      await page.goto(`stock/item-edit/?id=${id}`);
      await expect(page.locator("#edit-name")).toHaveValue("食パン");
      await expect(page.getByText("在庫はありません")).toBeVisible();
    },
  },
  {
    name: "item-edit-none",
    url: "stock/item-edit/?id=00000000-0000-4000-8000-000000000000",
    prepare: async (page) => {
      await expect(page.getByRole("heading", { name: "品物がありません" })).toBeVisible();
    },
  },
  {
    name: "item-edit-offline",
    url: "stock/",
    prepare: async (page) => {
      await openEdit(page, "牛乳");
      await goOffline(page);
      await expect(page.getByRole("status").filter({ hasText: "電波がありません" })).toBeVisible();
    },
  },
];

async function openEdit(page: Page, name: string) {
  await page.getByRole("link", { name: `${name}を編集` }).first().click();
  await expect(page.locator("h1")).toHaveText("品物の編集");
  await expect(page.locator("#edit-name")).toHaveValue(name);
}

for (const sub of subs) {
  test(`スクリーンショット: ${sub.name}`, async ({ page }, info) => {
    test.setTimeout(60_000);
    const household = stockHousehold(info, "shots");
    resetStock(household);
    seedStock(household);
    await page.clock.setFixedTime(FIXED_NOW);
    await loginWith(page, stockWho(info, 1, "shots"));
    await page.goto(sub.url);
    await expect(page.locator("h1").first()).toBeVisible();
    if (sub.url === "stock/") await expect(page.getByRole("button", { name: "ヨーグルトを1増やす" })).toBeVisible();
    if (sub.url.includes("item-new")) await expect(page.getByRole("button", { name: "登録する" })).toBeVisible();
    await sub.prepare(page, info);
    await page.waitForTimeout(500);
    await page.screenshot({ path: shotPath(info, sub.name), fullPage: !!sub.full });
    expect(await findHorizontalOverflow(page)).toBeNull();
    expect(await findSmallInputs(page)).toEqual([]);
    expect(await findSmallTapTargets(page)).toEqual([]);
    if (!sub.full) expect(await findBottomOverlap(page)).toBeNull();
  });
}
