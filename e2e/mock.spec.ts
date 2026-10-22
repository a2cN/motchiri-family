import fs from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { findBottomOverlap, findHorizontalOverflow, findSmallInputs, findSmallTapTargets } from "./checks";

// モック 2巡目(src/app/mock/)の検査とスクリーンショット(30_architecture.md §5、40_design_brief.md rev2「撮るスクリーンショット」)。
// モックと一緒に消える。出力先は E2E_SCREENSHOT_DIR(無ければ e2e-artifacts/screenshots/mock)。
// 時計は固定する(D-11)。固定する日は 2026-10-23(金)の正午(日本時間)。金曜を選ぶ理由: OD-stock-uiux-08 B の境目(にんじん +7)が写る。

const FIXED_NOW = new Date("2026-10-23T12:00:00+09:00");
const screenshotDir = path.resolve(process.env.E2E_SCREENSHOT_DIR ?? "e2e-artifacts/screenshots/mock");

const pages = [
  { name: "index", path: "mock/", h1: "デザインの見本(モック)", title: "モックの目次 | モック" },
  { name: "stock", path: "mock/stock/", h1: "もっちり倉庫", title: "食材の在庫 | モック" },
  { name: "supply", path: "mock/supply/", h1: "日用品の残量", title: "日用品の残量 | モック" },
  { name: "shopping-list", path: "mock/shopping-list/", h1: "買い物リスト", title: "買い物リスト | モック" },
  { name: "shopping-memo", path: "mock/shopping-memo/", h1: "買い物メモ", title: "買い物メモ | モック" },
  { name: "check-in", path: "mock/check-in/", h1: "在庫に登録", title: "在庫登録 | モック" },
  { name: "item-new", path: "mock/item-new/", h1: "品物の登録", title: "品物の登録 | モック" },
  { name: "item-edit", path: "mock/item-edit/", h1: "品物の編集", title: "品物の編集 | モック" },
  { name: "masters", path: "mock/masters/", h1: "マスタ", title: "マスタ | モック" },
  { name: "pwa", path: "mock/pwa/", h1: "アイコンと起動時の画面", title: "アイコンと起動時の画面 | モック" },
] as const;

async function shot(page: Page, project: string, name: string, options: { fullPage?: boolean } = {}) {
  const dir = path.join(screenshotDir, project);
  fs.mkdirSync(dir, { recursive: true });
  const full = options.fullPage ?? false;
  await page.screenshot({ path: path.join(dir, `mock-${name}${full ? "-full" : ""}.png`), fullPage: full });
}

// Web フォントの読み込みと、表示の安定を待つ
async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  // React が hydration を終えるまで待つ(終えた要素には __reactProps$ が付く)
  await page.waitForFunction(() => {
    const el = document.querySelector("main button, main label, main a, main input");
    return !el || Object.keys(el).some((k) => k.startsWith("__reactProps"));
  });
  await page.waitForTimeout(500);
}

// 開いて、フォントと hydration を待つ(待たないと、入力が React の状態に届く前に操作して失敗することがある)
async function openMock(page: Page, url: string) {
  await page.goto(url);
  await settle(page);
}

// 目次で設定を変えてから、リンクで画面を開く(状態は画面を移っても続く。再読み込みで消えるので goto はしない)
async function openViaIndex(page: Page, setting: string | null, linkName: string) {
  await openMock(page, "mock/");
  if (setting) await page.getByRole("button", { name: setting, exact: true }).click();
  await page.getByRole("link", { name: linkName, exact: true }).click();
}

const isPhone = (name: string) => name === "iphone-portrait";
const isLandscape = (name: string) => name === "ipad-landscape";

// 品物名の入力欄(品物の登録)と、買い物リストの追加の入力欄(見えているほう)
const itemName = (page: Page) => page.getByRole("textbox", { name: "品物名", exact: true });
const listName = (page: Page) => page.getByRole("textbox", { name: "品物名", exact: true });
// 前の表示が消える動きの最中は2つ見えることがある。新しいほう(最後)を見る
const toast = (page: Page, text: string) => page.getByText(text, { exact: true }).last();
const undoButton = (page: Page) => page.getByRole("button", { name: "元に戻す", exact: true });
const registerButton = (page: Page) => page.getByRole("button", { name: "登録する", exact: true });
const checkedNames = async (page: Page) =>
  page.getByRole("checkbox").evaluateAll((els) =>
    els.map((el) => ({ checked: el.getAttribute("aria-checked") === "true", text: (el.closest("label")?.textContent ?? "").trim() })),
  );

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_NOW);
});

// ---- 10ページの検査とスクリーンショット(見える範囲 + ページ全体) ----
for (const p of pages) {
  test(`${p.name}: 表示・noindex・横スクロール無し・入力欄 16px 以上・押せる範囲 44px 以上・帯の裏に隠れない・スクリーンショット`, async ({ page }, testInfo) => {
    const res = await page.goto(p.path);
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveText(p.h1);
    await expect(page).toHaveTitle(p.title);
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    await expect(page.locator('[data-direction="sakura"]').first()).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    // 日付はマウント後に出る(在庫だけ)。2026-10-23 − 1日 = 10/22(木)
    if (p.name === "stock") await expect(page.getByText("期限 10/22(木)")).toBeVisible();

    await settle(page);
    expect(await findHorizontalOverflow(page), "横スクロールが出ている").toBeNull();
    expect(await findSmallInputs(page), "16px 未満の入力欄がある").toEqual([]);
    expect(await findSmallTapTargets(page), "44px 未満の押せる範囲がある").toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, testInfo.project.name, p.name);
    await shot(page, testInfo.project.name, p.name, { fullPage: true });
    // 一番下までスクロールして、最後の要素が帯・タブと重ならないこと(スクリーンショットのあとに測る)
    expect(await findBottomOverlap(page), "最後の要素が下の帯・タブの裏に隠れている").toBeNull();
  });
}

test("本番のトップと倉庫の画面に、モックへのリンクが無い(30 D-07)", async ({ page }) => {
  for (const url of ["", "stock/"]) {
    await page.goto(url);
    const hrefs = await page.locator("a[href]").evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    expect(hrefs.filter((h) => h?.includes("mock")), url).toEqual([]);
  }
});

test("1巡目の URL(案の入口)は無い", async ({ request }) => {
  for (const d of ["anzu", "sakura", "tamago"]) {
    const res = await request.get(`mock/${d}/`);
    expect(res.status(), d).toBe(404);
  }
});

// ---- 状態のスクリーンショット(3サイズ、見える範囲) ----
test.describe("状態の見本", () => {
  test("在庫: 牛乳を −で 0 にした直後 / 買い物リスト: 食器用洗剤を外した直後", async ({ page }, testInfo) => {
    await openMock(page, "mock/stock/");
    await page.getByRole("button", { name: "牛乳を1減らす" }).first().click();
    await expect(toast(page, "牛乳を使い切りました")).toBeVisible();
    await page.waitForTimeout(900);
    await shot(page, testInfo.project.name, "stock-undo");

    await openMock(page, "mock/shopping-list/");
    await page.getByRole("button", { name: "食器用洗剤を外す" }).click();
    await expect(toast(page, "食器用洗剤を外しました")).toBeVisible();
    await page.waitForTimeout(900);
    await shot(page, testInfo.project.name, "shopping-list-undo");
  });

  test("買い物リストの候補 / 品物の登録の候補・選んだ直後・誤り / 在庫登録の誤り", async ({ page }, testInfo) => {
    await openMock(page, "mock/shopping-list/");
    await listName(page).fill("に");
    await expect(page.getByRole("group", { name: "品物名の候補" }).getByRole("button", { name: "にんじん" })).toBeVisible();
    await settle(page);
    await shot(page, testInfo.project.name, "shopping-list-suggest");

    await openMock(page, "mock/item-new/");
    await expect(page.getByLabel("購入日")).toHaveValue("2026-10-23");
    // 40 は「ぎゅ」→ 候補と書いたが、候補は品物名の部分一致で、品物名は漢字(読みを持たない)。「牛」で候補を出す(OD-stock-uiux-31)
    await itemName(page).fill("牛");
    await expect(page.getByRole("button", { name: "牛乳" })).toBeVisible();
    await settle(page);
    await shot(page, testInfo.project.name, "item-new-suggest");
    await page.getByRole("button", { name: "牛乳" }).click();
    await expect(itemName(page)).toHaveValue("牛乳");
    await settle(page);
    await shot(page, testInfo.project.name, "item-new-picked");

    await openMock(page, "mock/item-new/");
    await expect(page.getByLabel("購入日")).toHaveValue("2026-10-23");
    await registerButton(page).click();
    await expect(page.getByText("品物名を入れてください")).toBeVisible();
    await settle(page);
    await shot(page, testInfo.project.name, "item-new-error");

    await openMock(page, "mock/check-in/");
    await page.getByRole("button", { name: "2件を在庫に登録する" }).click();
    await expect(page.getByText("ジャンルを選んでください")).toBeVisible();
    await settle(page);
    await shot(page, testInfo.project.name, "check-in-error");
  });

  // 設定「データ」= 空(目次で切り替えて、リンクで開く)
  for (const [name, link, h1] of [
    ["stock", "食材の在庫", "もっちり倉庫"],
    ["supply", "日用品の残量", "日用品の残量"],
    ["shopping-list", "買い物リスト", "買い物リスト"],
    ["check-in", "在庫登録", "在庫に登録"],
  ] as const) {
    test(`空の状態: ${name}`, async ({ page }, testInfo) => {
      await openViaIndex(page, "空のデータ", link);
      await expect(page.locator("h1")).toHaveText(h1);
      await expect(page.locator("section", { hasText: /ありません|空です/ }).first()).toBeVisible();
      await settle(page);
      await shot(page, testInfo.project.name, `${name}-empty`);
    });
  }

  test("フォーカスの輪(iPad 縦。買い物リストの最初の行のチェックへ Tab)", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "ipad-portrait", "フォーカスの輪は iPad 縦だけ");
    await openMock(page, "mock/shopping-list/");
    let role: string | null = null;
    for (let i = 0; i < 20 && role !== "checkbox"; i++) {
      await page.keyboard.press("Tab");
      role = await page.evaluate(() => document.activeElement?.getAttribute("role") ?? null);
    }
    expect(role).toBe("checkbox");
    await page.waitForTimeout(200);
    await shot(page, testInfo.project.name, "focus");
  });
});

// ---- 移動 ----
test.describe("画面の間の移動", () => {
  test("下のタブ(スマホ・iPad 縦)/ 左のサイドバー(iPad 横)。選ばれている項目は aria-current", async ({ page }, testInfo) => {
    await openMock(page, "mock/stock/");
    const nav = page.getByRole("navigation", { name: "倉庫の画面" });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: "食材" })).toHaveAttribute("aria-current", "page");
    if (isLandscape(testInfo.project.name)) {
      await expect(nav.getByRole("link")).toHaveCount(4);
      await expect(nav.getByRole("link", { name: "マスタ" })).toBeVisible();
      await expect(page.getByRole("link", { name: "マスタ", exact: true })).toHaveCount(1);
    } else {
      await expect(nav.getByRole("link")).toHaveCount(3);
      await page.getByRole("link", { name: "マスタ", exact: true }).click();
      await expect(page.locator("h1")).toHaveText("マスタ");
      await page.getByRole("link", { name: "もどる" }).click();
      await expect(page.locator("h1")).toHaveText("もっちり倉庫");
    }
    await nav.getByRole("link", { name: "日用品" }).click();
    await expect(page.locator("h1")).toHaveText("日用品の残量");
    await expect(nav.getByRole("link", { name: "日用品" })).toHaveAttribute("aria-current", "page");
    await nav.getByRole("link", { name: "買い物リスト" }).click();
    await expect(page.locator("h1")).toHaveText("買い物リスト");
  });

  test("サブ画面の「‹ もどる」は来た元へ戻る(登録は日用品から、編集はマスタから)", async ({ page }) => {
    await openMock(page, "mock/supply/");
    await page.getByRole("link", { name: "品物の登録", exact: true }).click();
    await expect(page.locator("h1")).toHaveText("品物の登録");
    await expect(page.getByRole("button", { name: "日用品", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("link", { name: "もどる" }).click();
    await expect(page.locator("h1")).toHaveText("日用品の残量");

    await openViaIndex(page, null, "マスタ");
    await page.getByRole("link", { name: "ゴミ袋を編集" }).click();
    await expect(page.locator("h1")).toHaveText("品物の編集");
    await expect(page.getByRole("textbox", { name: "品物名" })).toHaveValue("ゴミ袋");
    await page.getByRole("link", { name: "もどる" }).click();
    await expect(page.locator("h1")).toHaveText("マスタ");
  });
});

// ---- 食材の在庫 ----
test.describe("食材の在庫", () => {
  test("−で 0 になると行が消えて「元に戻す」、押すと同じ位置に戻る。いつもの は在庫なしにならない合計", async ({ page }) => {
    await openMock(page, "mock/stock/");
    await expect(page.getByText("在庫 2本", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "牛乳を1減らす" })).toHaveCount(2);
    await page.getByRole("button", { name: "牛乳を1減らす" }).first().click();
    await expect(toast(page, "牛乳を使い切りました")).toBeVisible();
    await expect(page.getByRole("button", { name: "牛乳を1減らす" })).toHaveCount(1);
    await expect(page.getByText("在庫 1本", { exact: true })).toBeVisible();
    await undoButton(page).click();
    await expect(page.getByRole("button", { name: "牛乳を1減らす" })).toHaveCount(2);
    await expect(page.getByText("在庫 2本", { exact: true })).toBeVisible();
  });

  test("期限の印(金曜は翌週の金曜まで)・+1/−1・場所別 / ジャンル別・g は +/− なし", async ({ page }) => {
    await openMock(page, "mock/stock/");
    const rowOf = (name: string) => page.getByRole("link", { name: `${name}を編集` }).locator("xpath=ancestor::li");
    await expect(rowOf("豚こま肉")).toContainText("期限切れ");
    await expect(rowOf("牛乳")).toHaveCount(3); // いつもの + 在庫2件
    await expect(rowOf("牛乳").nth(1)).toContainText("期限間近");
    await expect(rowOf("牛乳").nth(2)).not.toContainText("期限間近"); // +9
    await expect(rowOf("にんじん")).toContainText("期限間近"); // +7 = 次の金曜(10/30)
    await expect(rowOf("卵").last()).not.toContainText("期限間近"); // +8
    await expect(rowOf("キャベツ")).toContainText("期限なし");
    await expect(page.getByRole("button", { name: "豚こま肉を1減らす" })).toHaveCount(0);

    await expect(page.getByText("2本", { exact: true })).toBeVisible(); // にんじん
    await page.getByRole("button", { name: "にんじんを1増やす" }).click();
    await expect(page.getByText("3本", { exact: true })).toBeVisible();

    await expect(page.getByRole("heading", { level: 2, name: "冷蔵庫" })).toBeVisible();
    await page.getByRole("button", { name: "ジャンル別" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "冷蔵庫" })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 2, name: "肉" })).toBeVisible();
  });

  test("品物名を押すと品物の編集が開き、もどると在庫へ戻る", async ({ page }) => {
    await openMock(page, "mock/stock/");
    await page.getByRole("link", { name: "ヨーグルトを編集" }).click();
    await expect(page.locator("h1")).toHaveText("品物の編集");
    await expect(page.getByRole("textbox", { name: "品物名" })).toHaveValue("ヨーグルト");
    await page.getByRole("link", { name: "もどる" }).click();
    await expect(page.locator("h1")).toHaveText("もっちり倉庫");
  });
});

// ---- 日用品の残量 ----
test.describe("日用品の残量と買い物リストの結びつき", () => {
  test("順送り ○→△→×→○。△・× で買い物リストに載り、○ で(チェックしていなければ)消える。チェックで ○、外すと元の残量", async ({ page }) => {
    await openMock(page, "mock/supply/");
    const detergent = page.getByRole("button", { name: /^食器用洗剤の残量/ });
    await expect(detergent).toHaveAttribute("aria-label", "食器用洗剤の残量 △。押すと × にする");
    await detergent.click();
    await expect(detergent).toHaveAttribute("aria-label", "食器用洗剤の残量 ×。押すと ○ にする");
    const tissue = page.getByRole("button", { name: /^ティッシュペーパーの残量/ });
    await tissue.click(); // × → ○
    await expect(tissue).toHaveAttribute("aria-label", "ティッシュペーパーの残量 ○。押すと △ にする");

    await page.getByRole("navigation", { name: "倉庫の画面" }).getByRole("link", { name: "買い物リスト" }).click();
    await expect(page.locator("label", { hasText: "食器用洗剤" })).toContainText("残量×");
    await expect(page.getByRole("checkbox", { name: /ティッシュペーパー/ })).toHaveCount(0);

    // 日用品をチェックすると、日用品の画面で ○(ST-D03)。外すと、チェックする前の × に戻る
    await page.locator("label", { hasText: "食器用洗剤" }).click();
    await page.getByRole("navigation", { name: "倉庫の画面" }).getByRole("link", { name: "日用品" }).click();
    await expect(page.getByRole("button", { name: /^食器用洗剤の残量/ })).toHaveAttribute("aria-label", "食器用洗剤の残量 ○。押すと △ にする");
    await page.getByRole("navigation", { name: "倉庫の画面" }).getByRole("link", { name: "買い物リスト" }).click();
    await page.locator("label", { hasText: "食器用洗剤" }).click();
    await page.getByRole("navigation", { name: "倉庫の画面" }).getByRole("link", { name: "日用品" }).click();
    await expect(page.getByRole("button", { name: /^食器用洗剤の残量/ })).toHaveAttribute("aria-label", "食器用洗剤の残量 ×。押すと ○ にする");
  });
});

// ---- 買い物リスト ----
test.describe("買い物リスト", () => {
  test("行全体を押すとチェック。手入力の行にも「外す」。外すと「元に戻す」", async ({ page }) => {
    await openMock(page, "mock/shopping-list/");
    const tofu = page.getByRole("checkbox", { name: /豆腐/ });
    await expect(tofu).not.toBeChecked();
    await page.getByText("豆腐", { exact: true }).click();
    await expect(tofu).toBeChecked();
    await page.getByText("豆腐", { exact: true }).click();
    await expect(tofu).not.toBeChecked();
    await expect(page.getByRole("checkbox", { name: /バナナ/ })).toBeChecked();

    await page.getByRole("button", { name: "豆腐を外す" }).click();
    await expect(toast(page, "豆腐を外しました")).toBeVisible();
    await expect(page.getByRole("button", { name: "豆腐を外す" })).toHaveCount(0);
    await undoButton(page).click();
    await expect(page.getByRole("button", { name: "豆腐を外す" })).toHaveCount(1);
  });

  test("入力欄から追加(空白だけは足さない)・候補を押すと1タップで足す", async ({ page }) => {
    await openMock(page, "mock/shopping-list/");
    await listName(page).fill("りんご");
    await page.getByRole("button", { name: "追加", exact: true }).click();
    await expect(page.getByText("りんご", { exact: true })).toBeVisible();
    await expect(listName(page)).toHaveValue("");
    const before = await page.getByRole("checkbox").count();
    await listName(page).fill("   ");
    await page.getByRole("button", { name: "追加", exact: true }).click();
    expect(await page.getByRole("checkbox").count()).toBe(before);

    await listName(page).fill("に");
    const group = page.getByRole("group", { name: "品物名の候補" });
    await expect(group.getByRole("button")).toHaveCount(1);
    await group.getByRole("button", { name: "にんじん" }).click();
    await expect(page.locator("label", { hasText: "にんじん" })).toContainText("手入力");
    await expect(listName(page)).toHaveValue("");
    await listName(page).fill("zzz");
    await expect(group).toHaveCount(0);
  });

  test("全部外すと空の状態のカード", async ({ page }) => {
    await openMock(page, "mock/shopping-list/");
    for (const name of ["牛乳", "卵", "食パン", "食器用洗剤", "ティッシュペーパー", "バナナ", "豆腐"]) {
      await page.getByRole("button", { name: `${name}を外す` }).click();
    }
    await expect(page.getByRole("heading", { level: 2, name: "買い物リストは空です" })).toBeVisible();
    await expect(page.getByText("入力欄から品物を追加できます。")).toBeVisible();
    await expect(page.getByRole("link", { name: /^在庫に登録/ })).toHaveCount(0);
  });

  test("チェック済みの行の並び(設定): その場に残す / 下へ移す", async ({ page }) => {
    // 既定: その場に残す(牛乳が先頭のまま)
    await openMock(page, "mock/shopping-list/");
    expect((await checkedNames(page))[0].text).toContain("牛乳");
    await openViaIndex(page, "下へ移す", "買い物リスト");
    await expect(page.getByRole("checkbox")).toHaveCount(7);
    const rows = await checkedNames(page);
    expect(rows.slice(0, 5).every((r) => !r.checked)).toBe(true);
    expect(rows.slice(5).map((r) => r.text.replace(/\s+/g, ""))).toEqual(["牛乳いつもの", "バナナ手入力"]);
  });

  test("買い物メモ: スマホは入口のカードから別の画面、iPad は横のカードに直接書ける。内容は続く", async ({ page }, testInfo) => {
    await openMock(page, "mock/shopping-list/");
    if (isPhone(testInfo.project.name)) {
      await expect(page.getByRole("link", { name: /買い物メモ/ })).toContainText("卵は10個入り");
      await page.getByRole("link", { name: /買い物メモ/ }).click();
      await expect(page.locator("h1")).toHaveText("買い物メモ");
      await page.getByRole("textbox", { name: "買い物メモ" }).fill("牛乳は2本");
      await page.getByRole("link", { name: "もどる" }).click();
      await expect(page.getByRole("link", { name: /買い物メモ/ })).toContainText("牛乳は2本");
    } else {
      await expect(page.getByRole("link", { name: /買い物メモ/ })).toHaveCount(0);
      const memo = page.getByRole("textbox", { name: "買い物メモ" });
      await expect(memo).toHaveValue("卵は10個入り\nパンは6枚切り");
      await memo.fill("牛乳は2本");
      await expect(memo).toHaveValue("牛乳は2本");
    }
  });
});

// ---- 在庫登録 ----
test.describe("在庫登録", () => {
  test("チェックした食材のカード。新しい品物はジャンルと単位が必須。確定で在庫に増え、リストから消え、いつもの は未チェックで戻る", async ({ page }) => {
    await openMock(page, "mock/shopping-list/");
    await page.getByRole("link", { name: "在庫に登録(2件)" }).click();
    await expect(page.locator("h1")).toHaveText("在庫に登録");
    await expect(page.getByRole("heading", { level: 3 })).toHaveCount(2);
    await expect(page.getByText("新しい品物", { exact: true })).toHaveCount(1);
    // 牛乳は既存: 場所は前回の冷蔵庫、期限は提案(10日後 = 11/02)
    await expect(page.locator("#ci-exp-l1")).toHaveValue("2026-11-02");
    await expect(page.getByRole("group", { name: "牛乳の場所" }).getByRole("button", { name: "冷蔵庫" })).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "2件を在庫に登録する" }).click();
    await expect(page.getByText("ジャンルを選んでください")).toBeVisible();
    await expect(page.getByText("単位を選んでください")).toBeVisible();
    await expect(page.locator("#ci-genre-l6")).toBeFocused();
    await expect(page.locator("h1")).toHaveText("在庫に登録"); // 何も登録しない

    await page.locator("#ci-genre-l6").selectOption("野菜・果物");
    await expect(page.getByRole("group", { name: "バナナの場所" }).getByRole("button", { name: "冷蔵庫" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "個", exact: true }).click();
    await page.getByRole("button", { name: "2件を在庫に登録する" }).click();

    await expect(page.locator("h1")).toHaveText("買い物リスト");
    await expect(toast(page, "2件を在庫に登録しました")).toBeVisible();
    // 元に戻すは出さない(UX-04 の対象に在庫登録は無い)
    await expect(undoButton(page)).toHaveCount(0);
    const rows = await checkedNames(page);
    expect(rows.some((r) => r.checked)).toBe(false);
    expect(rows.some((r) => r.text.includes("バナナ"))).toBe(false);
    expect(rows.some((r) => r.text.includes("牛乳"))).toBe(true); // いつもの は未チェックで戻る

    await page.getByRole("navigation", { name: "倉庫の画面" }).getByRole("link", { name: "食材" }).click();
    await expect(page.getByRole("link", { name: "バナナを編集" })).toBeVisible();
    await expect(page.getByText("在庫 3本", { exact: true })).toBeVisible();
  });

  test("チェック済みの日用品は「在庫には数えません」で並び、確定でリストから消える", async ({ page }) => {
    await openMock(page, "mock/shopping-list/");
    await page.getByRole("button", { name: "バナナを外す" }).click();
    await page.locator("label", { hasText: "食器用洗剤" }).click();
    await page.getByRole("link", { name: "在庫に登録(2件)" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "日用品" })).toBeVisible();
    await expect(page.getByText("在庫には数えません。確定するとリストから消えます。")).toBeVisible();
    await page.getByRole("button", { name: "1件を在庫に登録する" }).click();
    await expect(page.locator("h1")).toHaveText("買い物リスト");
    await expect(page.getByRole("checkbox", { name: /食器用洗剤/ })).toHaveCount(0);
  });
});

// ---- UX-01 の手数(OD-stock-uiux-26) ----
test.describe("UX-01 の手数(品物名の候補を選んだあと、登録が終わるまで)", () => {
  test("① 前回の値のまま ② 個数を +1 ③ 場所を変える ④ 買い物リストから在庫登録", async ({ page }, testInfo) => {
    let taps = 0;
    const tap = async (locator: Locator) => {
      await locator.click();
      taps += 1;
    };
    const counts: Record<string, number> = {};
    const prepare = async () => {
      await openMock(page, "mock/item-new/");
      await expect(page.getByLabel("購入日")).toHaveValue("2026-10-23");
      await itemName(page).fill("牛"); // 文字の入力は数えない
      await page.getByRole("button", { name: "牛乳" }).click(); // 候補を押すタップは数えない(ここが起点)
      await expect(itemName(page)).toHaveValue("牛乳");
      taps = 0;
    };

    await prepare();
    await tap(registerButton(page));
    await expect(toast(page, "牛乳を登録しました")).toBeVisible();
    counts["①前回の値のまま"] = taps;

    await prepare();
    await tap(page.getByRole("button", { name: "個数を1増やす" }));
    await tap(registerButton(page));
    await expect(toast(page, "牛乳を登録しました")).toBeVisible();
    counts["②個数を+1"] = taps;

    await prepare();
    await tap(page.getByRole("group", { name: "場所" }).getByRole("button", { name: "棚" }));
    await tap(registerButton(page));
    await expect(toast(page, "牛乳を登録しました")).toBeVisible();
    counts["③場所を変える"] = taps;
    await page.getByRole("link", { name: "もどる" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "棚" }).locator("xpath=ancestor::section")).toContainText("牛乳");

    // ④ 買い物リストで品物名を選ぶ(チェック)のあと、在庫登録の画面で確定するまで
    await openMock(page, "mock/shopping-list/");
    await page.getByRole("button", { name: "バナナを外す" }).click(); // 新しい品物は単位とジャンルが要るので、準備で外す
    taps = 0;
    await tap(page.getByRole("link", { name: "在庫に登録(1件)" }));
    await tap(page.getByRole("button", { name: "1件を在庫に登録する" }));
    await expect(toast(page, "1件を在庫に登録しました")).toBeVisible();
    counts["④買い物リストから在庫登録"] = taps;

    console.log(`UX-01 taps [${testInfo.project.name}]: ${JSON.stringify(counts)}`);
    testInfo.annotations.push({ type: "UX-01 taps", description: JSON.stringify(counts) });
    for (const [flow, n] of Object.entries(counts)) expect(n, flow).toBeLessThanOrEqual(3);
    expect(counts["①前回の値のまま"]).toBe(1);
    expect(counts["②個数を+1"]).toBe(2);
    expect(counts["③場所を変える"]).toBe(2);
  });
});

// ---- 品物の登録 ----
test.describe("品物の登録", () => {
  test("初期値は単位・ジャンル・場所が未選択。必須が空だと欄ごとに誤りが出て、最初の誤りの欄へフォーカス", async ({ page }) => {
    await openMock(page, "mock/item-new/");
    await expect(page.getByLabel("購入日")).toHaveValue("2026-10-23");
    await expect(page.getByRole("button", { name: "食材", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("ジャンル")).toHaveValue("");
    await expect(page.getByRole("group", { name: "単位" }).locator('[aria-pressed="true"]')).toHaveCount(0);
    await expect(page.getByRole("group", { name: "場所" }).locator('[aria-pressed="true"]')).toHaveCount(0);

    // 個数 1 のときの「−」は薄くしない。押しても何も起きず、誤りも出ない
    const minus = page.getByRole("button", { name: "個数を1減らす" });
    await expect(minus).toHaveAttribute("aria-disabled", "true");
    await expect(minus).toHaveCSS("opacity", "1");
    await minus.click({ force: true });
    await expect(page.getByText("個数を1減らす")).toHaveCount(0);

    await registerButton(page).click();
    await expect(page.getByText("品物名を入れてください")).toBeVisible();
    await expect(page.getByText("ジャンルを選んでください")).toBeVisible();
    await expect(page.getByText("単位を選んでください")).toBeVisible();
    await expect(itemName(page)).toBeFocused();
    await expect(itemName(page)).toHaveAttribute("aria-invalid", "true");
  });

  test("候補を選ぶと前回の値が入り、フォーカスが外れる。登録すると食材の在庫に1件増える", async ({ page }) => {
    await openMock(page, "mock/item-new/");
    await expect(page.getByLabel("購入日")).toHaveValue("2026-10-23");
    await itemName(page).fill("ほげ");
    await expect(page.getByText("候補はありません。このまま新しい品物として登録できます。")).toBeVisible();
    await itemName(page).fill("牛");
    await page.getByRole("button", { name: "牛乳" }).click();
    await expect(itemName(page)).not.toBeFocused();
    await expect(page.getByLabel("ジャンル")).toHaveValue("卵・乳製品");
    await expect(page.getByRole("button", { name: "本", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "冷蔵庫" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("期限")).toHaveValue("2026-11-02");
    await expect(page.getByText("前回から 10日後を提案")).toBeVisible();
    await registerButton(page).click();
    await expect(toast(page, "牛乳を登録しました")).toBeVisible();
    await expect(itemName(page)).toHaveValue("");
    await page.getByRole("link", { name: "もどる" }).click();
    await expect(page.getByText("在庫 3本", { exact: true })).toBeVisible();
  });

  test("新しい食材と新しい日用品を登録すると、在庫・日用品・買い物リストに載る", async ({ page }) => {
    await openMock(page, "mock/item-new/");
    await expect(page.getByLabel("購入日")).toHaveValue("2026-10-23");
    await itemName(page).fill("みかん");
    await page.getByLabel("ジャンル").selectOption("野菜・果物");
    await page.getByRole("group", { name: "単位" }).getByRole("button", { name: "個", exact: true }).click();
    await registerButton(page).click();
    await expect(toast(page, "みかんを登録しました")).toBeVisible();

    await page.getByRole("button", { name: "日用品", exact: true }).click();
    await expect(page.getByLabel("備考")).toBeVisible();
    await expect(page.getByRole("button", { name: "残量 ○" })).toHaveAttribute("aria-pressed", "true");
    await itemName(page).fill("ラップ");
    await page.getByRole("button", { name: "残量 △" }).click();
    await registerButton(page).click();
    await expect(toast(page, "ラップを登録しました")).toBeVisible();

    await page.getByRole("link", { name: "もどる" }).click();
    await expect(page.getByRole("link", { name: "みかんを編集" })).toBeVisible();
    await page.getByRole("navigation", { name: "倉庫の画面" }).getByRole("link", { name: "日用品" }).click();
    await expect(page.getByRole("link", { name: "ラップを編集" })).toBeVisible();
    await page.getByRole("navigation", { name: "倉庫の画面" }).getByRole("link", { name: "買い物リスト" }).click();
    await expect(page.locator("label", { hasText: "ラップ" })).toContainText("残量△");
  });
});

// ---- 品物の編集 ----
test.describe("品物の編集", () => {
  test("直接開くと牛乳。在庫は2ブロック。使い切りで消えて「元に戻す」。数を 0 にしても消える", async ({ page }) => {
    await openMock(page, "mock/item-edit/");
    await expect(page.getByRole("textbox", { name: "品物名" })).toHaveValue("牛乳");
    await expect(page.getByRole("heading", { level: 3 })).toHaveCount(2);
    await page.getByRole("button", { name: /^牛乳\(冷蔵庫\)を使い切り$/ }).first().click();
    await expect(toast(page, "牛乳を使い切りました")).toBeVisible();
    await expect(page.getByRole("heading", { level: 3 })).toHaveCount(1);
    await undoButton(page).click();
    await expect(page.getByRole("heading", { level: 3 })).toHaveCount(2);

    const qty = page.getByRole("textbox", { name: "牛乳の数" }).first();
    await qty.fill("0");
    await qty.blur();
    await expect(page.getByRole("heading", { level: 3 })).toHaveCount(1);
    await expect(toast(page, "牛乳を使い切りました")).toBeVisible();
  });

  test("品物名は空にできない(前の名前のまま)。名前の変更はフォーカスが外れたとき反映", async ({ page }) => {
    await openMock(page, "mock/item-edit/");
    const name = page.getByRole("textbox", { name: "品物名" });
    await name.fill("");
    await name.blur();
    await expect(page.getByText("品物名を入れてください")).toBeVisible();
    await name.fill("低脂肪牛乳");
    await name.blur();
    await expect(page.getByText("品物名を入れてください")).toHaveCount(0);
    await page.getByRole("link", { name: "もどる" }).click();
    await expect(page.getByRole("link", { name: "低脂肪牛乳を編集" }).first()).toBeVisible();
  });

  test("いつもの を外すと、在庫の いつもの と買い物リストから消える", async ({ page }) => {
    await openMock(page, "mock/item-edit/");
    const regular = page.getByRole("checkbox", { name: /いつもの/ });
    await expect(regular).toBeChecked();
    await page.locator("label", { hasText: "いつもの" }).click();
    await expect(regular).not.toBeChecked();
    await page.getByRole("link", { name: "もどる" }).click();
    await expect(page.getByText("在庫 2本", { exact: true })).toHaveCount(0);
    await page.getByRole("navigation", { name: "倉庫の画面" }).getByRole("link", { name: "買い物リスト" }).click();
    await expect(page.getByRole("checkbox", { name: /牛乳/ })).toHaveCount(0);
  });
});

// ---- マスタ ----
test.describe("マスタ", () => {
  test("使用中は印だけ(削除なし)。使っていないものは削除でき、「元に戻す」で戻る", async ({ page }) => {
    await openMock(page, "mock/masters/");
    await expect(page.getByRole("button", { name: "肉を削除" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "魚を削除" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "mlを削除" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "冷蔵庫を削除" })).toHaveCount(0);
    await page.getByRole("button", { name: "魚を削除" }).click();
    await expect(toast(page, "魚を削除しました")).toBeVisible();
    await expect(page.getByRole("button", { name: "魚を変更" })).toHaveCount(0);
    await undoButton(page).click();
    await expect(page.getByRole("button", { name: "魚を変更" })).toHaveCount(1);
  });

  test("追加(同じ名前は誤り)・名前の変更・ジャンルの既定の場所(未選択で足して、あとで選ぶ)。同時に編集できる行は1つ", async ({ page }) => {
    await openMock(page, "mock/masters/");
    const genreCard = page.locator("section", { has: page.getByRole("heading", { level: 2, name: "ジャンル", exact: true }) });
    await page.getByRole("textbox", { name: "新しいジャンル" }).fill("肉");
    await genreCard.getByRole("button", { name: "追加" }).click();
    await expect(page.getByText("同じ名前があります")).toBeVisible();
    await page.getByRole("textbox", { name: "新しいジャンル" }).fill("パン");
    await genreCard.getByRole("button", { name: "追加" }).click();
    await expect(genreCard.getByText("既定の場所: 未選択")).toBeVisible();

    await page.getByRole("button", { name: "パンを変更" }).click();
    await page.getByRole("button", { name: "魚を変更" }).click();
    await expect(page.getByRole("textbox", { name: "パンの名前" })).toHaveCount(0); // 同時に1行だけ
    await page.getByRole("button", { name: "やめる" }).click();
    await page.getByRole("button", { name: "パンを変更" }).click();
    await page.getByRole("group", { name: "パンの既定の場所" }).getByRole("button", { name: "棚" }).click();
    await page.getByRole("button", { name: "保存" }).click();
    await expect(genreCard.getByText("既定の場所: 棚").first()).toBeVisible();

    await page.getByRole("button", { name: "野菜・果物を変更" }).click();
    await page.getByRole("textbox", { name: "野菜・果物の名前" }).fill("野菜");
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page.getByRole("button", { name: "野菜を変更" })).toBeVisible();
  });

  test("品物の一覧から編集へ。在庫が0件でも入口になる", async ({ page }) => {
    await openMock(page, "mock/masters/");
    await expect(page.getByRole("link", { name: "食パンを編集" })).toBeVisible();
    await page.getByRole("link", { name: "食パンを編集" }).click();
    await expect(page.getByText("在庫はありません")).toBeVisible();
  });
});

// ---- モックの設定 ----
test.describe("モックの設定", () => {
  test("「元に戻す」の秒数: 4秒で消え、10秒は6秒のあとも残る", async ({ page }, testInfo) => {
    test.skip(!isPhone(testInfo.project.name), "時間のかかる確認は iPhone 縦だけ");
    test.setTimeout(60_000);
    await openViaIndex(page, "4秒", "食材の在庫");
    await page.getByRole("button", { name: "牛乳を1減らす" }).first().click();
    await expect(toast(page, "牛乳を使い切りました")).toBeVisible();
    await expect(toast(page, "牛乳を使い切りました")).toBeHidden({ timeout: 8000 });

    await page.getByRole("navigation", { name: "倉庫の画面" }).getByRole("link", { name: "買い物リスト" }).click();
    await page.getByRole("link", { name: /^トップ$|トップ/ }).first().click();
    await page.getByRole("button", { name: "10秒", exact: true }).click();
    await page.getByRole("link", { name: "買い物リスト", exact: true }).click();
    await page.getByRole("button", { name: "卵を外す" }).click();
    await expect(toast(page, "卵を外しました")).toBeVisible();
    await page.waitForTimeout(7000);
    await expect(toast(page, "卵を外しました")).toBeVisible();
  });

  test("空のデータ: 目次の設定で、在庫・日用品・買い物リストが空になる。画面を移っても続く", async ({ page }) => {
    await openViaIndex(page, "空のデータ", "食材の在庫");
    await expect(page.getByRole("heading", { level: 2, name: "食材の在庫はありません" })).toBeVisible();
    await expect(page.getByText("「品物の登録」から追加できます。")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "いつもの" })).toHaveCount(0);
    await page.getByRole("navigation", { name: "倉庫の画面" }).getByRole("link", { name: "日用品" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "日用品はまだありません" })).toBeVisible();
    await page.getByRole("navigation", { name: "倉庫の画面" }).getByRole("link", { name: "買い物リスト" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "買い物リストは空です" })).toBeVisible();
  });
});

test("モックは保存も通信もしない。再読み込みで初期値に戻る", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.hostname !== "127.0.0.1") requests.push(r.url());
  });
  await openMock(page, "mock/shopping-list/");
  await listName(page).fill("りんご");
  await page.getByRole("button", { name: "追加", exact: true }).click();
  expect(requests).toEqual([]);
  const stored = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length, cookie: document.cookie }));
  expect(stored).toEqual({ local: 0, session: 0, cookie: "" });
  await page.reload();
  await expect(page.getByText("りんご", { exact: true })).toHaveCount(0);
});
