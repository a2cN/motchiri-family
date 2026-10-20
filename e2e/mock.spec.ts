import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { findHorizontalOverflow, findSmallInputs, findSmallTapTargets } from "./checks";

// モック(src/app/mock/)の検査とスクリーンショット(30_architecture.md §5、40_design_brief.md「撮るスクリーンショット」)。
// モックと一緒に消える。出力先は E2E_SCREENSHOT_DIR(無ければ e2e-artifacts/screenshots/mock)。
// 時計は固定する(D-11)。固定する日は 2026-10-21(水)の正午(日本時間)。モックの期限の表示は曜日で変わらない(決定 12)。

const FIXED_NOW = new Date("2026-10-21T12:00:00+09:00");
const screenshotDir = path.resolve(process.env.E2E_SCREENSHOT_DIR ?? "e2e-artifacts/screenshots/mock");

const directions = [
  { id: "anzu", title: "案A あんず" },
  { id: "sakura", title: "案B さくらもち" },
  { id: "tamago", title: "案C たまご" },
] as const;

const screens = [
  { name: "sample", path: "", h1: (t: string) => t },
  { name: "stock", path: "stock/", h1: () => "もっちり倉庫" },
  { name: "shopping-list", path: "shopping-list/", h1: () => "買い物リスト" },
  { name: "item-new", path: "item-new/", h1: () => "品物の登録" },
] as const;

async function shot(page: Page, project: string, name: string, options: { fullPage?: boolean } = {}) {
  const dir = path.join(screenshotDir, project);
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `mock-${name}.png`), fullPage: options.fullPage ?? true });
}

// 品物名の入力欄。候補の欄の aria-label「品物名の候補」と取り違えない(exact)
const nameField = (page: Page) => page.getByLabel("品物名", { exact: true });

// 品物の登録の画面が、マウント後の状態(購入日の既定値)まで描かれた = 入力を受け付けられる状態
async function itemNewReady(page: Page) {
  await expect(page.getByLabel("購入日")).toHaveValue("2026-10-21");
}

// Web フォントの読み込みと、表示の安定を待つ
async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}

// 開いて、フォントと hydration を待つ(待たないと、入力が React の状態に届く前に fill して失敗することがある)
async function openMock(page: Page, url: string) {
  await page.goto(url);
  await settle(page);
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_NOW);
});

test.describe("モックの目次", () => {
  test("表示・noindex・本番の画面にリンクが無い・スクリーンショット", async ({ page }, testInfo) => {
    const res = await page.goto("mock/");
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveText("デザインの見本(モック)");
    await expect(page.getByText("デザインの見本(モック)です。データは架空で、保存されません。")).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    // 見比べ表: 4画面 × 3案のリンク
    await expect(page.locator("table a")).toHaveCount(12);
    await expect(page.getByRole("link", { name: "在庫 — 案B" })).toHaveAttribute("href", /\/mock\/sakura\/stock\/$/);
    await expect(page.getByRole("link", { name: /案A あんず/ })).toHaveAttribute("href", /\/mock\/anzu\/$/);

    expect(await findHorizontalOverflow(page), "横スクロールが出ている").toBeNull();
    expect(await findSmallInputs(page)).toEqual([]);
    expect(await findSmallTapTargets(page), "44px 未満の押せる範囲がある").toEqual([]);
    await settle(page);
    await shot(page, testInfo.project.name, "index");
  });

  test("本番のトップと倉庫の画面に、モックへのリンクが無い(30 D-07)", async ({ page }) => {
    for (const url of ["", "stock/"]) {
      await page.goto(url);
      const hrefs = await page.locator("a[href]").evaluateAll((els) => els.map((e) => e.getAttribute("href")));
      expect(hrefs.filter((h) => h?.includes("mock")), url).toEqual([]);
    }
  });
});

for (const d of directions) {
  for (const s of screens) {
    test(`${d.id} / ${s.name}: 表示・横スクロール無し・入力欄 16px 以上・押せる範囲 44px 以上・スクリーンショット`, async ({ page }, testInfo) => {
      const res = await page.goto(`mock/${d.id}/${s.path}`);
      expect(res?.status()).toBe(200);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveText(s.h1(d.title));
      await expect(page.locator("html")).toHaveAttribute("lang", "ja");
      await expect(page.locator(`[data-direction="${d.id}"]`).first()).toBeVisible();
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
      // 日付はマウント後に出る(在庫だけ)
      if (s.name === "stock") await expect(page.getByText("期限 10/20(火)")).toBeVisible();

      await settle(page);
      expect(await findHorizontalOverflow(page), "横スクロールが出ている").toBeNull();
      expect(await findSmallInputs(page), "16px 未満の入力欄がある").toEqual([]);
      expect(await findSmallTapTargets(page), "44px 未満の押せる範囲がある").toEqual([]);
      await shot(page, testInfo.project.name, `${d.id}-${s.name}`);
    });
  }
}

// 状態の見本(iPhone 縦だけ、3案ずつ)とフォーカスの輪(iPad 縦、3案)
for (const d of directions) {
  test(`${d.id}: 状態の見本(「元に戻す」・候補・誤りの表示)`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "iphone-portrait", "状態の見本は iPhone 縦だけ");

    await page.goto(`mock/${d.id}/shopping-list/`);
    await page.getByRole("button", { name: "牛乳を外す" }).click();
    await expect(page.getByText("牛乳を外しました")).toBeVisible();
    // 表示の出る動き(Sonner の既定)が終わるのを待つ。表示は画面に固定なので、画面の範囲だけ撮る
    await settle(page);
    await page.waitForTimeout(900);
    await shot(page, testInfo.project.name, `${d.id}-state-undo`, { fullPage: false });

    await page.goto(`mock/${d.id}/item-new/`);
    await itemNewReady(page);
    await nameField(page).fill("に");
    await expect(page.getByRole("button", { name: "にんじん" })).toBeVisible();
    await settle(page);
    await shot(page, testInfo.project.name, `${d.id}-state-suggest`);

    await page.goto(`mock/${d.id}/item-new/`);
    await itemNewReady(page);
    await page.getByRole("button", { name: "登録する" }).filter({ visible: true }).click();
    await expect(page.getByText("品物名を入れてください")).toBeVisible();
    await settle(page);
    await shot(page, testInfo.project.name, `${d.id}-state-error`);
  });

  test(`${d.id}: フォーカスの輪(見本帳で Tab を押して主なボタンへ)`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "ipad-portrait", "フォーカスの輪は iPad 縦だけ");
    await page.goto(`mock/${d.id}/`);
    await settle(page);
    let focused = "";
    for (let i = 0; i < 60 && focused !== "登録する"; i++) {
      await page.keyboard.press("Tab");
      focused = await page.evaluate(() => (document.activeElement?.textContent ?? "").trim());
    }
    expect(focused).toBe("登録する");
    await page.waitForTimeout(200);
    await shot(page, testInfo.project.name, `${d.id}-focus`, { fullPage: false });
  });
}

// ---- 触れる操作(40_design_brief.md「User Flow」4)。案 B で確かめる ----
test.describe("触れる操作(案B さくらもち)", () => {
  test("在庫: −で 0 になると行が消えて「元に戻す」、押すと同じ位置に戻る", async ({ page }) => {
    await openMock(page, "mock/sakura/stock/");
    const milkRow = page.locator("li", { hasText: "牛乳" }).filter({ has: page.getByRole("button", { name: "牛乳を1減らす" }) });
    await expect(milkRow).toHaveCount(1);
    await page.getByRole("button", { name: "牛乳を1減らす" }).click();
    await expect(page.getByRole("button", { name: "牛乳を1減らす" })).toHaveCount(0);
    await expect(page.getByText("牛乳を使い切りました")).toBeVisible();
    // いつもの の牛乳は在庫なしになる
    await expect(page.locator("li", { hasText: "牛乳" }).getByText("在庫なし")).toBeVisible();
    await page.getByRole("button", { name: "元に戻す", exact: true }).click();
    await expect(page.getByRole("button", { name: "牛乳を1減らす" })).toHaveCount(1);
    await expect(page.getByText("牛乳を使い切りました")).toHaveCount(0);
  });

  test("在庫: +1/−1、場所別 / ジャンル別、日用品の残量の順送り", async ({ page }) => {
    await openMock(page, "mock/sakura/stock/");
    await expect(page.getByText("2本", { exact: true })).toBeVisible(); // にんじん
    await page.getByRole("button", { name: "にんじんを1増やす" }).click();
    await expect(page.getByText("3本", { exact: true })).toBeVisible();

    await expect(page.getByRole("heading", { level: 2, name: "冷蔵庫" })).toBeVisible();
    await page.getByRole("button", { name: "ジャンル別" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "冷蔵庫" })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 2, name: "肉" })).toBeVisible();
    await expect(page.getByRole("button", { name: "ジャンル別" })).toHaveAttribute("aria-pressed", "true");

    const supply = page.getByRole("button", { name: /^食器用洗剤の残量/ });
    await expect(supply).toHaveAttribute("aria-label", "食器用洗剤の残量 △。押すと × にする");
    await supply.click();
    await expect(supply).toHaveAttribute("aria-label", "食器用洗剤の残量 ×。押すと ○ にする");
    await supply.click();
    await expect(supply).toHaveAttribute("aria-label", "食器用洗剤の残量 ○。押すと △ にする");
  });

  test("買い物リスト: 行全体を押すとチェック、「外す」で消えて元に戻せる、手入力を足せる", async ({ page }) => {
    await openMock(page, "mock/sakura/shopping-list/");
    const tofu = page.getByRole("checkbox", { name: /豆腐/ });
    await expect(tofu).not.toBeChecked();
    // 行の名前の文字(label の中)を押してもチェックが付く
    await page.getByText("豆腐", { exact: true }).click();
    await expect(tofu).toBeChecked();
    await page.getByText("豆腐", { exact: true }).click();
    await expect(tofu).not.toBeChecked();
    // 手入力の項目に「外す」は無い。自動の項目にはある
    await expect(page.getByRole("button", { name: "豆腐を外す" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "卵を外す" })).toHaveCount(1);
    // 初期のチェック済み
    await expect(page.getByRole("checkbox", { name: /バナナ/ })).toBeChecked();

    await page.getByRole("button", { name: "卵を外す" }).click();
    await expect(page.getByText("卵を外しました")).toBeVisible();
    await expect(page.getByRole("button", { name: "卵を外す" })).toHaveCount(0);
    await page.getByRole("button", { name: "元に戻す", exact: true }).click();
    await expect(page.getByRole("button", { name: "卵を外す" })).toHaveCount(1);

    await nameField(page).fill("りんご");
    await page.getByRole("button", { name: "追加" }).click();
    await expect(page.getByText("りんご", { exact: true })).toBeVisible();
    await expect(nameField(page)).toHaveValue("");
    // 空白だけは足さない
    const before = await page.getByRole("checkbox").count();
    await nameField(page).fill("   ");
    await page.getByRole("button", { name: "追加" }).click();
    expect(await page.getByRole("checkbox").count()).toBe(before);
  });

  test("買い物リスト: 自動の項目を全部外しても、手入力の2件は残る(空の状態には届かない。OD-stock-uiux-10)", async ({ page }) => {
    await openMock(page, "mock/sakura/shopping-list/");
    for (const name of ["牛乳", "卵", "食パン", "食器用洗剤", "ティッシュペーパー"]) {
      await page.getByRole("button", { name: `${name}を外す` }).click();
    }
    // 手入力の2件は「外す」が無いので、リストは空にならない(ST-L02)。空の状態のカードは、モックでは出せない
    await expect(page.getByRole("checkbox")).toHaveCount(2);
  });

  test("状態は案の中を移動しても続く(メモリ)", async ({ page }) => {
    await openMock(page, "mock/sakura/shopping-list/");
    await page.getByText("豆腐", { exact: true }).click();
    await page.getByRole("link", { name: "もどる" }).click();
    await page.getByRole("link", { name: /在庫/ }).first().click();
    await page.getByRole("link", { name: "もどる" }).click();
    await page.getByRole("link", { name: /買い物リスト/ }).click();
    await expect(page.getByRole("checkbox", { name: /豆腐/ })).toBeChecked();
  });

  test("品物の登録: 候補を選ぶと前回の値が入り、登録できる", async ({ page }) => {
    await openMock(page, "mock/sakura/item-new/");
    await itemNewReady(page);
    await expect(page.getByRole("button", { name: "食材" })).toHaveAttribute("aria-pressed", "true");
    await nameField(page).fill("ほげ");
    await expect(page.getByText("候補はありません。このまま新しい品物として登録できます。")).toBeVisible();
    await nameField(page).fill("牛");
    await page.getByRole("button", { name: "牛乳" }).click();
    await expect(nameField(page)).toHaveValue("牛乳");
    await expect(page.getByLabel("ジャンル")).toHaveValue("卵・乳製品");
    await expect(page.getByRole("button", { name: "本", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "冷蔵庫" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("期限")).toHaveValue("2026-10-31");
    await expect(page.getByText("前回から 10日後を提案")).toBeVisible();
    await page.getByRole("button", { name: "登録する" }).filter({ visible: true }).click();
    await expect(page.getByText("牛乳を登録しました")).toBeVisible();
    await expect(nameField(page)).toHaveValue("");
  });

  test("品物の登録: 品物名が空だと誤りが出て、フォーカスが品物名へ移る。日用品に切り替えられる", async ({ page }) => {
    await openMock(page, "mock/sakura/item-new/");
    await itemNewReady(page);
    await page.getByRole("button", { name: "登録する" }).filter({ visible: true }).click();
    await expect(page.getByText("品物名を入れてください")).toBeVisible();
    await expect(nameField(page)).toHaveAttribute("aria-invalid", "true");
    await expect(nameField(page)).toBeFocused();

    await page.getByRole("button", { name: "日用品" }).click();
    await expect(page.getByLabel("備考")).toBeVisible();
    await expect(page.getByRole("button", { name: "残量 ○" })).toHaveAttribute("aria-pressed", "true");
  });

  test("見本帳: 「元に戻す」の表示を出せる", async ({ page }) => {
    await openMock(page, "mock/sakura/");
    await page.getByRole("button", { name: "「元に戻す」の表示を見る" }).click();
    await expect(page.getByText("見本です")).toBeVisible();
    await expect(page.getByRole("button", { name: "元に戻す", exact: true })).toBeVisible();
  });

  test("モックは保存も通信もしない", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (r) => {
      const u = new URL(r.url());
      if (u.hostname !== "127.0.0.1") requests.push(r.url());
    });
    await openMock(page, "mock/sakura/shopping-list/");
    await nameField(page).fill("りんご");
    await page.getByRole("button", { name: "追加" }).click();
    expect(requests).toEqual([]);
    const stored = await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
      cookie: document.cookie,
    }));
    expect(stored).toEqual({ local: 0, session: 0, cookie: "" });
    // 再読み込みで初期値に戻る
    await page.reload();
    await expect(page.getByText("りんご", { exact: true })).toHaveCount(0);
  });
});
