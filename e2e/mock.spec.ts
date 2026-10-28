import fs from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { findBottomOverlap, findHorizontalOverflow, findSmallInputs, findSmallTapTargets } from "./checks";

// モック 3巡目(src/app/mock/)の検査とスクリーンショット(30_architecture.md §5、40_design_brief.md rev3「撮るスクリーンショット」)。
// モックと一緒に消える。出力先は E2E_SCREENSHOT_DIR(無ければ e2e-artifacts/screenshots/mock)。
// 時計は固定する(D-11)。固定する日は 2026-10-23(金)の正午(日本時間)。金曜を選ぶ理由: OD-stock-uiux-08 B の境目(にんじん +7)が写る。

const FIXED_NOW = new Date("2026-10-23T12:00:00+09:00");
const screenshotDir = path.resolve(process.env.E2E_SCREENSHOT_DIR ?? "e2e-artifacts/screenshots/mock");

const pages = [
  { name: "index", path: "mock/", h1: "デザインの見本(モック)", title: "モックの目次 | モック" },
  { name: "stock", path: "mock/stock/", h1: "もっちり倉庫", title: "食材の在庫 | モック" },
  { name: "supply", path: "mock/supply/", h1: "日用品", title: "日用品 | モック" },
  { name: "shopping-list", path: "mock/shopping-list/", h1: "買い物リスト", title: "買い物リスト | モック" },
  { name: "shopping-memo", path: "mock/shopping-memo/", h1: "買い物メモ", title: "買い物メモ | モック" },
  { name: "check-in", path: "mock/check-in/", h1: "在庫に登録", title: "在庫登録 | モック" },
  { name: "item-new", path: "mock/item-new/", h1: "品物の登録", title: "品物の登録 | モック" },
  { name: "item-edit", path: "mock/item-edit/", h1: "品物の編集", title: "品物の編集 | モック" },
  { name: "items", path: "mock/items/", h1: "品物の一覧", title: "品物の一覧 | モック" },
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


// チップの文字(選ばれているときだけ見える先頭の ✓ は除く)
const chipTexts = (group: Locator) => group.getByRole("button").evaluateAll((els) => els.map((e) => (e as HTMLElement).innerText.replace("✓", "").trim()));
const tabs = (page: Page) => page.getByRole("navigation", { name: "倉庫の画面" });
// 品物名のリンク(品物の編集へ)
const editLink = (page: Page, name: string) => page.getByRole("link", { name: `${name}を編集` }).first();
// 画面の「品物」への入口(スマホ・iPad 縦はヘッダーの右、iPad 横はサイドバー)
const goItems = (page: Page) => page.getByRole("link", { name: "品物", exact: true }).click();

// ---- ページの検査とスクリーンショット(見える範囲 + ページ全体。pwa は検査だけで撮らない) ----
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
    if (p.name !== "pwa") {
      await shot(page, testInfo.project.name, p.name);
      await shot(page, testInfo.project.name, p.name, { fullPage: true });
    }
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

  test("日用品: 検索「洗」/ チップ「紙類」/ 検索「ふとん」で0件", async ({ page }, testInfo) => {
    await openMock(page, "mock/supply/");
    await page.getByRole("searchbox", { name: "品物名で探す" }).fill("洗");
    await expect(page.getByText("2件 / 9件")).toBeVisible();
    await settle(page);
    await shot(page, testInfo.project.name, "supply-search");

    await openMock(page, "mock/supply/");
    await page.getByRole("group", { name: "ジャンルで絞り込む" }).getByRole("button", { name: "紙類" }).click();
    await expect(page.getByText("2件 / 9件")).toBeVisible();
    await settle(page);
    await shot(page, testInfo.project.name, "supply-chip");

    await openMock(page, "mock/supply/");
    await page.getByRole("searchbox", { name: "品物名で探す" }).fill("ふとん");
    await expect(page.getByText("「ふとん」に合う日用品はありません")).toBeVisible();
    await settle(page);
    await shot(page, testInfo.project.name, "supply-search-empty");
  });

  test("在庫登録: しょうゆ にもチェック(残量で管理の欄)/ バナナを空のまま確定(誤り)", async ({ page }, testInfo) => {
    await openMock(page, "mock/shopping-list/");
    await page.locator("label", { hasText: "しょうゆ" }).click();
    await page.getByRole("link", { name: "在庫に登録(4件)" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "残量で管理する品物" })).toBeVisible();
    await settle(page);
    await shot(page, testInfo.project.name, "check-in-level");

    await openMock(page, "mock/shopping-list/");
    await page.getByRole("link", { name: "在庫に登録(3件)" }).click();
    await page.getByRole("button", { name: "3件を在庫に登録する" }).click();
    await expect(page.getByText("ジャンルを選んでください")).toBeVisible();
    await settle(page);
    await shot(page, testInfo.project.name, "check-in-error");
  });

  test("品物の登録: 食材 + 残量 / 日用品 + 数(本)/ 何も入れずに登録 / 個数 1.25 / 日用品の候補", async ({ page }, testInfo) => {
    await openMock(page, "mock/item-new/");
    await expect(page.getByLabel("購入日")).toHaveValue("2026-10-23");
    await page.getByRole("button", { name: "残量で管理", exact: true }).click();
    await expect(page.getByRole("button", { name: "残量 ○" })).toHaveAttribute("aria-pressed", "true");
    await settle(page);
    await shot(page, testInfo.project.name, "item-new-food-level");

    await openMock(page, "mock/item-new/");
    await expect(page.getByLabel("購入日")).toHaveValue("2026-10-23");
    await page.getByRole("button", { name: "日用品", exact: true }).click();
    await page.getByRole("button", { name: "数で管理", exact: true }).click();
    await page.getByRole("group", { name: "単位" }).getByRole("button", { name: "本", exact: true }).click();
    await settle(page);
    await shot(page, testInfo.project.name, "item-new-supply-count");

    await openMock(page, "mock/item-new/");
    await expect(page.getByLabel("購入日")).toHaveValue("2026-10-23");
    await registerButton(page).click();
    await expect(page.getByText("品物名を入れてください")).toBeVisible();
    await settle(page);
    await shot(page, testInfo.project.name, "item-new-error");

    await openMock(page, "mock/item-new/");
    await expect(page.getByLabel("購入日")).toHaveValue("2026-10-23");
    await page.getByRole("textbox", { name: "個数", exact: true }).fill("1.25");
    await page.getByRole("textbox", { name: "個数", exact: true }).blur();
    await expect(page.getByText("小数は第一位までです")).toBeVisible();
    await settle(page);
    await shot(page, testInfo.project.name, "item-new-qty-error");

    await openMock(page, "mock/item-new/");
    await expect(page.getByLabel("購入日")).toHaveValue("2026-10-23");
    await page.getByRole("button", { name: "日用品", exact: true }).click();
    await itemName(page).fill("シャン");
    await expect(page.getByRole("button", { name: /シャンプーの詰め替え/ })).toBeVisible();
    await settle(page);
    await shot(page, testInfo.project.name, "item-new-suggest-supply");
  });

  test("品物の編集: しょうゆ(残量で管理)/ 牛乳で「残量で管理に変える」のパネル", async ({ page }, testInfo) => {
    await openMock(page, "mock/stock/");
    await editLink(page, "しょうゆ").click();
    await expect(page.getByText("いまは 残量で管理")).toBeVisible();
    await settle(page);
    await shot(page, testInfo.project.name, "item-edit-level");

    await openMock(page, "mock/item-edit/");
    await page.getByRole("button", { name: "残量で管理に変える" }).click();
    await expect(page.getByText("在庫 2件(合計 2 本)は消えて、残量になります。")).toBeVisible();
    await settle(page);
    await shot(page, testInfo.project.name, "item-edit-tracking");
  });

  test("品物の一覧: 牛乳を削除した直後 / 切り替えを日用品に", async ({ page }, testInfo) => {
    await openMock(page, "mock/items/");
    await page.getByRole("button", { name: "牛乳を削除" }).click();
    await expect(toast(page, "牛乳を削除しました。在庫と買い物リストからも消えました")).toBeVisible();
    await page.waitForTimeout(900);
    await shot(page, testInfo.project.name, "items-undo");

    await openMock(page, "mock/items/");
    await page.getByRole("button", { name: "日用品", exact: true }).click();
    await expect(page.getByRole("heading", { level: 2, name: "ジャンルなし" })).toBeVisible();
    await settle(page);
    await shot(page, testInfo.project.name, "items-supply");
  });

  // 設定「データ」= 空(目次で切り替えて、リンクで開く)
  for (const [name, link, h1] of [
    ["stock", "食材の在庫", "もっちり倉庫"],
    ["supply", "日用品", "日用品"],
    ["shopping-list", "買い物リスト", "買い物リスト"],
    ["check-in", "在庫登録", "在庫に登録"],
    ["items", "品物の一覧", "品物の一覧"],
  ] as const) {
    test(`空の状態: ${name}`, async ({ page }, testInfo) => {
      await openViaIndex(page, "空のデータ", link);
      await expect(page.locator("h1")).toHaveText(h1);
      await expect(page.locator("section", { hasText: /ありません|空です|まだありません/ }).first()).toBeVisible();
      await settle(page);
      await shot(page, testInfo.project.name, `${name}-empty`);
    });
  }

  test("フォーカスの輪(iPad 縦。日用品のジャンルのチップの1つ目へ Tab)", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "ipad-portrait", "フォーカスの輪は iPad 縦だけ");
    await openMock(page, "mock/supply/");
    let inChips = false;
    for (let i = 0; i < 20 && !inChips; i++) {
      await page.keyboard.press("Tab");
      inChips = await page.evaluate(() => document.activeElement?.closest('[aria-label="ジャンルで絞り込む"]') !== null && document.activeElement?.closest('[aria-label="ジャンルで絞り込む"]') !== undefined);
    }
    expect(inChips).toBe(true);
    await page.waitForTimeout(200);
    await shot(page, testInfo.project.name, "focus");
  });
});

// ---- 移動 ----
test.describe("画面の間の移動", () => {
  test("下のタブ(スマホ・iPad 縦)/ 左のサイドバー(iPad 横)。選ばれている項目は aria-current", async ({ page }, testInfo) => {
    await openMock(page, "mock/stock/");
    const nav = tabs(page);
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: "食材" })).toHaveAttribute("aria-current", "page");
    if (isLandscape(testInfo.project.name)) {
      await expect(nav.getByRole("link")).toHaveCount(5);
      await expect(nav.getByRole("link", { name: "品物" })).toBeVisible();
      await expect(nav.getByRole("link", { name: "マスタ" })).toBeVisible();
      await expect(page.getByRole("link", { name: "マスタ", exact: true })).toHaveCount(1);
      await expect(page.getByRole("link", { name: "品物", exact: true })).toHaveCount(1);
    } else {
      await expect(nav.getByRole("link")).toHaveCount(3);
      // ヘッダーの右に「品物」「マスタ」(OD-stock-uiux-12 A)
      await page.getByRole("link", { name: "マスタ", exact: true }).click();
      await expect(page.locator("h1")).toHaveText("マスタ");
      await page.getByRole("link", { name: "もどる" }).click();
      await expect(page.locator("h1")).toHaveText("もっちり倉庫");
    }
    await nav.getByRole("link", { name: "日用品" }).click();
    await expect(page.locator("h1")).toHaveText("日用品");
    await expect(nav.getByRole("link", { name: "日用品" })).toHaveAttribute("aria-current", "page");
    await nav.getByRole("link", { name: "買い物リスト" }).click();
    await expect(page.locator("h1")).toHaveText("買い物リスト");
  });

  test("食材 →「品物」→ 品物名 →「‹ もどる」で一覧 →「‹ もどる」で食材", async ({ page }) => {
    await openMock(page, "mock/stock/");
    await goItems(page);
    await expect(page.locator("h1")).toHaveText("品物の一覧");
    await page.getByRole("link", { name: "ヨーグルトを編集" }).click();
    await expect(page.locator("h1")).toHaveText("品物の編集");
    await expect(page.getByRole("textbox", { name: "品物名" })).toHaveValue("ヨーグルト");
    await page.getByRole("link", { name: "もどる" }).click();
    await expect(page.locator("h1")).toHaveText("品物の一覧");
    await page.getByRole("link", { name: "もどる" }).click();
    await expect(page.locator("h1")).toHaveText("もっちり倉庫");
  });

  test("日用品 →「品物」は日用品の一覧から始まる(スマホ・iPad 縦)。登録は日用品から。マスタに品物のカードは無い", async ({ page }, testInfo) => {
    await openMock(page, "mock/supply/");
    if (!isLandscape(testInfo.project.name)) {
      await goItems(page);
      await expect(page.getByRole("button", { name: "日用品", exact: true })).toHaveAttribute("aria-pressed", "true");
      await page.getByRole("link", { name: "もどる" }).click();
      await expect(page.locator("h1")).toHaveText("日用品");
    }
    await page.getByRole("link", { name: "品物の登録", exact: true }).first().click();
    await expect(page.locator("h1")).toHaveText("品物の登録");
    await expect(page.getByRole("button", { name: "日用品", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("link", { name: "もどる" }).click();
    await expect(page.locator("h1")).toHaveText("日用品");

    await openMock(page, "mock/masters/");
    await expect(page.getByRole("heading", { level: 2 })).toHaveText(["ジャンル", "場所", "単位"]);
  });
});

// ---- 食材の在庫 ----
test.describe("食材の在庫", () => {
  test("−で 0 になると行が消えて「元に戻す」、押すと同じ位置に戻る。いつもの は在庫の合計", async ({ page }) => {
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

  test("小数: キャベツ 0.5個 は − 1回で使い切り(OD-stock-uiux-46)", async ({ page }) => {
    await openMock(page, "mock/stock/");
    await expect(page.getByText("0.5個", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "キャベツを1減らす" }).click();
    await expect(toast(page, "キャベツを使い切りました")).toBeVisible();
    await expect(page.getByRole("link", { name: "キャベツを編集" })).toHaveCount(0);
    await undoButton(page).click();
    await expect(page.getByText("0.5個", { exact: true })).toBeVisible();
  });

  test("期限の印・+1/−1・場所別 / ジャンル別・g は +/− なし", async ({ page }) => {
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

  test("残量で管理の行: しょうゆ(棚)・マヨネーズ(冷蔵庫)は残量のボタンで、期限の行が無い。ジャンル別でも同じ", async ({ page }) => {
    await openMock(page, "mock/stock/");
    const rowOf = (name: string) => page.getByRole("link", { name: `${name}を編集` }).locator("xpath=ancestor::li").last();
    await expect(rowOf("しょうゆ")).toContainText("残量で管理");
    await expect(rowOf("しょうゆ")).not.toContainText("期限");
    await expect(page.getByRole("button", { name: /^しょうゆの残量 △/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^マヨネーズの残量 ○/ })).toBeVisible();
    // 棚のまとまりの末尾(パスタ・ポテトチップスのあと)
    const shelf = page.locator("section", { has: page.getByRole("heading", { level: 2, name: "棚" }) });
    await expect(shelf.locator("li").last()).toContainText("しょうゆ");
    await page.getByRole("button", { name: "ジャンル別" }).click();
    const seasoning = page.locator("section", { has: page.getByRole("heading", { level: 2, name: "調味料" }) });
    await expect(seasoning.locator("li")).toHaveCount(2);
    await expect(page.getByRole("button", { name: /^しょうゆの残量 △/ })).toBeVisible();
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

// ---- 日用品 ----
test.describe("日用品", () => {
  test("検索(部分一致・全角半角)とジャンルのチップは AND。件数。0件は「条件をクリア」", async ({ page }) => {
    await openMock(page, "mock/supply/");
    await expect(page.getByText("9件", { exact: true })).toBeVisible();
    const chips = page.getByRole("group", { name: "ジャンルで絞り込む" });
    expect(await chipTexts(chips)).toEqual(["すべて", "紙類", "洗剤", "キッチン", "お風呂", "洗面所"]);
    await expect(chips.getByRole("button", { name: "すべて" })).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("searchbox", { name: "品物名で探す" }).fill("洗");
    await expect(page.getByText("2件 / 9件")).toBeVisible();
    await chips.getByRole("button", { name: "洗剤" }).click();
    await expect(page.getByText("2件 / 9件")).toBeVisible(); // 食器用洗剤・洗濯用洗剤(歯みがき粉は洗面所)
    await page.getByRole("button", { name: "検索をクリア" }).click();
    await expect(page.getByText("2件 / 9件")).toBeVisible();
    // 選んでいるチップを押すと「すべて」に戻る
    await chips.getByRole("button", { name: "洗剤" }).click();
    await expect(chips.getByRole("button", { name: "すべて" })).toHaveAttribute("aria-pressed", "true");
    // ジャンルを持たない日用品は「すべて」でだけ出る
    await expect(page.getByRole("link", { name: "ハンドソープを編集" })).toBeVisible();
    await chips.getByRole("button", { name: "紙類" }).click();
    await expect(page.getByRole("link", { name: "ハンドソープを編集" })).toHaveCount(0);

    await page.getByRole("searchbox", { name: "品物名で探す" }).fill("ふとん");
    await expect(page.getByText("「紙類」で「ふとん」に合う日用品はありません")).toBeVisible();
    await page.getByRole("button", { name: "条件をクリア" }).click();
    await expect(page.getByText("9件", { exact: true })).toBeVisible();
    await expect(page.getByRole("searchbox", { name: "品物名で探す" })).toHaveValue("");
  });

  test("管理のしかたで振る舞う: 残量で管理は ○→△→×→○、数で管理は ± と数", async ({ page }) => {
    await openMock(page, "mock/supply/");
    await expect(page.getByRole("button", { name: /^トイレットペーパーの残量/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "トイレットペーパーを1減らす" })).toHaveCount(0);
    const rowOf = (name: string) => page.getByRole("link", { name: `${name}を編集` }).locator("xpath=ancestor::li");
    await expect(rowOf("シャンプーの詰め替え")).toContainText("1 本");
    await expect(rowOf("シャンプーの詰め替え")).toContainText("お風呂");
    await expect(rowOf("トイレットペーパー")).toContainText("紙類 · 12ロール");
    await page.getByRole("button", { name: "シャンプーの詰め替えを1増やす" }).click();
    await expect(rowOf("シャンプーの詰め替え")).toContainText("2 本");
  });

  test("数で管理の日用品: − で 0 にすると行は残り「使い切りました」+「元に戻す」。0 の − は何も起きない", async ({ page }) => {
    await openMock(page, "mock/supply/");
    const rowOf = (name: string) => page.getByRole("link", { name: `${name}を編集` }).locator("xpath=ancestor::li");
    const minus = page.getByRole("button", { name: "洗濯用洗剤を1減らす" });
    await minus.click();
    await expect(rowOf("洗濯用洗剤")).toContainText("1 本");
    await minus.click();
    await expect(toast(page, "洗濯用洗剤を使い切りました")).toBeVisible();
    await expect(rowOf("洗濯用洗剤")).toContainText("0 本");
    await expect(minus).toHaveAttribute("aria-disabled", "true");
    await minus.click({ force: true });
    await expect(rowOf("洗濯用洗剤")).toContainText("0 本");
    await undoButton(page).click();
    await expect(rowOf("洗濯用洗剤")).toContainText("1 本"); // 押す前の数に戻る
    // 補充の目安の無い品物は 0 になっても買い物リストに載らない
    await minus.click();
    await tabs(page).getByRole("link", { name: "買い物リスト" }).click();
    await expect(page.getByRole("checkbox", { name: /洗濯用洗剤/ })).toHaveCount(0);
    await expect(page.locator("label", { hasText: "ボディソープの詰め替え" })).toContainText("切れた");
  });
});

// ---- 買い物リスト ----
test.describe("買い物リスト", () => {
  test("発生元の印は いつもの / 減った / 切れた / 手入力。チェックは牛乳・シャンプー・バナナ", async ({ page }) => {
    await openMock(page, "mock/shopping-list/");
    const rows = (await checkedNames(page)).map((r) => ({ checked: r.checked, text: r.text.replace(/\s+/g, "") }));
    expect(rows).toEqual([
      { checked: true, text: "牛乳いつもの" },
      { checked: false, text: "卵いつもの" },
      { checked: false, text: "食パンいつもの" },
      { checked: false, text: "納豆減った" },
      { checked: false, text: "しょうゆ減った" },
      { checked: false, text: "食器用洗剤減った" },
      { checked: false, text: "ティッシュペーパー切れた" },
      { checked: true, text: "シャンプーの詰め替え減った" },
      { checked: false, text: "ボディソープの詰め替え切れた" },
      { checked: true, text: "バナナ手入力" },
      { checked: false, text: "豆腐手入力" },
    ]);
  });

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

  test("残量で管理の品物(しょうゆ)をチェックすると残量は ○、外すとチェックする前の △ に戻る", async ({ page }) => {
    await openMock(page, "mock/shopping-list/");
    await page.locator("label", { hasText: "しょうゆ" }).click();
    await tabs(page).getByRole("link", { name: "食材" }).click();
    await expect(page.getByRole("button", { name: /^しょうゆの残量 ○/ })).toBeVisible();
    await tabs(page).getByRole("link", { name: "買い物リスト" }).click();
    await page.locator("label", { hasText: "しょうゆ" }).click();
    await tabs(page).getByRole("link", { name: "食材" }).click();
    await expect(page.getByRole("button", { name: /^しょうゆの残量 △/ })).toBeVisible();
  });

  test("残量・数の変更で自動の行が載る / 消える: しょうゆを ×→○、納豆を +1、シャンプー(いつもの でない)は減った", async ({ page }) => {
    await openMock(page, "mock/stock/");
    const sh = page.getByRole("button", { name: /^しょうゆの残量/ });
    await sh.click(); // △ → ×
    await tabs(page).getByRole("link", { name: "買い物リスト" }).click();
    await expect(page.locator("label", { hasText: "しょうゆ" })).toContainText("切れた");
    await tabs(page).getByRole("link", { name: "食材" }).click();
    await sh.click(); // × → ○
    await tabs(page).getByRole("link", { name: "買い物リスト" }).click();
    await expect(page.getByRole("checkbox", { name: /しょうゆ/ })).toHaveCount(0);

    await tabs(page).getByRole("link", { name: "食材" }).click();
    await page.getByRole("button", { name: "納豆を1増やす" }).click(); // 1 → 2 パック(目安 1 より上)
    await tabs(page).getByRole("link", { name: "買い物リスト" }).click();
    await expect(page.getByRole("checkbox", { name: /納豆/ })).toHaveCount(0);
    await expect(page.locator("label", { hasText: "シャンプーの詰め替え" })).toContainText("減った");
  });

  test("外した自動の行は、他の操作では戻らず、在庫登録の確定で(条件を満たしていれば)未チェックで戻る", async ({ page }) => {
    await openMock(page, "mock/shopping-list/");
    await page.getByRole("button", { name: "ティッシュペーパーを外す" }).click();
    await tabs(page).getByRole("link", { name: "日用品" }).click();
    // 残量を一巡して × に戻しても、外したまま
    const tissue = page.getByRole("button", { name: /^ティッシュペーパーの残量/ });
    await tissue.click(); // × → ○
    await tissue.click(); // ○ → △
    await tissue.click(); // △ → ×
    await tabs(page).getByRole("link", { name: "買い物リスト" }).click();
    await expect(page.getByRole("checkbox", { name: /ティッシュペーパー/ })).toHaveCount(0);
    // 確定(牛乳・シャンプー・バナナ)。バナナのジャンルと単位を入れる
    await page.getByRole("button", { name: "バナナを外す" }).click();
    await page.getByRole("link", { name: "在庫に登録(2件)" }).click();
    await page.getByRole("button", { name: "2件を在庫に登録する" }).click();
    await expect(page.locator("h1")).toHaveText("買い物リスト");
    await expect(page.locator("label", { hasText: "ティッシュペーパー" })).toContainText("切れた");
    expect((await checkedNames(page)).some((r) => r.checked)).toBe(false);
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

    await listName(page).fill("にん");
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
    for (const name of [
      "牛乳",
      "卵",
      "食パン",
      "納豆",
      "しょうゆ",
      "食器用洗剤",
      "ティッシュペーパー",
      "シャンプーの詰め替え",
      "ボディソープの詰め替え",
      "バナナ",
      "豆腐",
    ]) {
      await page.getByRole("button", { name: `${name}を外す` }).click();
    }
    await expect(page.getByRole("heading", { level: 2, name: "買い物リストは空です" })).toBeVisible();
    await expect(page.getByText("入力欄から品物を追加できます。")).toBeVisible();
    await expect(page.getByRole("link", { name: /^在庫に登録/ })).toHaveCount(0);
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
  test("数で管理の品物(食材・日用品)と新しい品物のカード。新しい品物はジャンルと単位が必須。確定で在庫・数が増え、リストから消え、外していた自動の行が戻る", async ({ page }) => {
    await openMock(page, "mock/shopping-list/");
    await page.getByRole("link", { name: "在庫に登録(3件)" }).click();
    await expect(page.locator("h1")).toHaveText("在庫に登録");
    await expect(page.getByRole("heading", { level: 3 })).toHaveCount(3);
    await expect(page.getByText("新しい品物", { exact: true })).toHaveCount(1);
    await expect(page.locator('[data-slot="badge"]', { hasText: "日用品" })).toHaveCount(1); // シャンプーの詰め替えの印
    // 牛乳は既存: 場所は前回の冷蔵庫、期限は提案(10日後 = 11/02)
    await expect(page.locator("#ci-exp-l1")).toHaveValue("2026-11-02");
    await expect(page.getByRole("group", { name: "牛乳の場所" }).getByRole("button", { name: "冷蔵庫" })).toHaveAttribute("aria-pressed", "true");
    // 数で管理の日用品は個数だけ(期限・場所なし)
    await expect(page.getByRole("group", { name: "シャンプーの詰め替えの場所" })).toHaveCount(0);
    await expect(page.locator("#ci-exp-l8")).toHaveCount(0);

    await page.getByRole("button", { name: "3件を在庫に登録する" }).click();
    await expect(page.getByText("ジャンルを選んでください")).toBeVisible();
    await expect(page.getByText("単位を選んでください")).toBeVisible();
    await expect(page.locator("#ci-l10-genre")).toBeFocused();
    await expect(page.locator("h1")).toHaveText("在庫に登録"); // 何も登録しない

    await page.locator("#ci-l10-genre").selectOption("野菜・果物");
    await expect(page.getByRole("group", { name: "バナナの場所" }).getByRole("button", { name: "冷蔵庫" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("group", { name: "バナナの単位" }).getByRole("button", { name: "個", exact: true }).click();
    await page.getByRole("button", { name: "シャンプーの詰め替えの個数を1増やす" }).click();
    await page.getByRole("button", { name: "3件を在庫に登録する" }).click();

    await expect(page.locator("h1")).toHaveText("買い物リスト");
    await expect(toast(page, "3件を在庫に登録しました")).toBeVisible();
    // 元に戻すは出さない(UX-04 の対象に在庫登録は無い)
    await expect(undoButton(page)).toHaveCount(0);
    const rows = await checkedNames(page);
    expect(rows.some((r) => r.checked)).toBe(false);
    expect(rows.some((r) => r.text.includes("バナナ"))).toBe(false);
    expect(rows.some((r) => r.text.includes("牛乳"))).toBe(true); // いつもの は未チェックで戻る
    expect(rows.some((r) => r.text.includes("シャンプー"))).toBe(false); // 1 + 2 = 3 本 > 目安 1 本

    await tabs(page).getByRole("link", { name: "食材" }).click();
    await expect(page.getByRole("link", { name: "バナナを編集" })).toBeVisible();
    await expect(page.getByText("在庫 3本", { exact: true })).toBeVisible();
    await tabs(page).getByRole("link", { name: "日用品" }).click();
    await expect(page.getByRole("link", { name: "シャンプーの詰め替えを編集" }).locator("xpath=ancestor::li")).toContainText("3 本");
  });

  test("残量で管理の品物は「残量で管理する品物」の欄に名前だけ並び、確定でリストから消える(残量は ○ のまま)", async ({ page }) => {
    await openMock(page, "mock/shopping-list/");
    for (const name of ["牛乳", "シャンプーの詰め替え", "バナナ"]) await page.locator("label", { hasText: name }).click();
    await page.locator("label", { hasText: "しょうゆ" }).click();
    await page.getByRole("link", { name: "在庫に登録(1件)" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "残量で管理する品物" })).toBeVisible();
    await expect(page.getByText("在庫には数えません。残量はチェックしたときに ○ になっています。確定するとリストから消えます。")).toBeVisible();
    await expect(page.getByRole("heading", { level: 3 })).toHaveCount(0);
    // 数で管理の品物が0件のときは「リストから消す」
    await page.getByRole("button", { name: "リストから消す" }).click();
    await expect(page.locator("h1")).toHaveText("買い物リスト");
    await expect(page.getByRole("checkbox", { name: /しょうゆ/ })).toHaveCount(0);
    await tabs(page).getByRole("link", { name: "食材" }).click();
    await expect(page.getByRole("button", { name: /^しょうゆの残量 ○/ })).toBeVisible();
  });

  test("新しい品物: 種別と管理のしかたを選べる(日用品は残量が既定)。個数の誤り。バナナを食材・残量にして確定すると残量のボタンの行になる", async ({ page }) => {
    await openMock(page, "mock/shopping-list/");
    await page.getByRole("link", { name: "在庫に登録(3件)" }).click();
    const qty = page.getByRole("textbox", { name: "バナナの個数" });
    await qty.fill("1.25");
    await qty.blur();
    await expect(page.getByText("小数は第一位までです")).toBeVisible();
    await page.getByRole("group", { name: "バナナの種別" }).getByRole("button", { name: "日用品" }).click();
    await expect(page.getByRole("button", { name: "残量で管理", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("textbox", { name: "ジャンル" })).toBeVisible();
    await page.getByRole("group", { name: "バナナの種別" }).getByRole("button", { name: "食材" }).click();
    await expect(page.getByRole("button", { name: "数で管理", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "残量で管理", exact: true }).click();
    await page.locator("#ci-l10-genre").selectOption("野菜・果物");
    await page.getByRole("group", { name: "バナナの管理のしかた" }).getByRole("button", { name: "残量で管理" }).click();
    await expect(page.getByRole("button", { name: "2件を在庫に登録する" })).toBeVisible();
    await page.getByRole("button", { name: "2件を在庫に登録する" }).click();
    await expect(page.locator("h1")).toHaveText("買い物リスト");
    await tabs(page).getByRole("link", { name: "食材" }).click();
    await expect(page.getByRole("button", { name: /^バナナの残量 ○/ })).toBeVisible();
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
    await tap(page.getByRole("link", { name: "在庫に登録(2件)" }));
    await tap(page.getByRole("button", { name: "2件を在庫に登録する" }));
    await expect(toast(page, "2件を在庫に登録しました")).toBeVisible();
    counts["④買い物リストから在庫登録"] = taps;

    // ⑤(参考)残量で管理の食材(しょうゆ)を候補から: 前回の値(残量で管理・目安 △)で入るので「登録する」の1タップ
    await prepare();
    await itemName(page).fill("しょう");
    await page.getByRole("button", { name: "しょうゆ" }).click();
    await expect(page.getByRole("button", { name: "残量で管理", exact: true })).toHaveAttribute("aria-pressed", "true");
    taps = 0;
    await tap(registerButton(page));
    await expect(toast(page, "しょうゆを登録しました")).toBeVisible();
    counts["⑤残量で管理の品物を候補から"] = taps;

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
  test("初期値は単位・ジャンル・場所が未選択、食材は数で管理・補充の目安は なし。必須が空だと欄ごとに誤りが出て、最初の誤りの欄へフォーカス", async ({ page }) => {
    await openMock(page, "mock/item-new/");
    await expect(page.getByLabel("購入日")).toHaveValue("2026-10-23");
    await expect(page.getByRole("button", { name: "食材", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "数で管理", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("ジャンル")).toHaveValue("");
    await expect(page.getByRole("group", { name: "単位" }).locator('[aria-pressed="true"]')).toHaveCount(0);
    await expect(page.getByRole("group", { name: "場所" }).locator('[aria-pressed="true"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "なし", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("textbox", { name: "個数", exact: true })).toHaveValue("1");

    // 個数 1 のときの「−」は薄くしない。押しても何も起きず、誤りも出ない
    const minus = page.getByRole("button", { name: "個数を1減らす" });
    await expect(minus).toHaveAttribute("aria-disabled", "true");
    await expect(minus).toHaveCSS("opacity", "1");
    await minus.click({ force: true });
    await expect(page.getByRole("textbox", { name: "個数", exact: true })).toHaveValue("1");

    await registerButton(page).click();
    await expect(page.getByText("品物名を入れてください")).toBeVisible();
    await expect(page.getByText("ジャンルを選んでください")).toBeVisible();
    await expect(page.getByText("単位を選んでください")).toBeVisible();
    await expect(itemName(page)).toBeFocused();
    await expect(itemName(page)).toHaveAttribute("aria-invalid", "true");
  });

  test("個数は文字で打ち込める。全角は半角に直し、小数第二位以下・数でない・空・0 は誤り(丸めない)。数える単位は ± が残り、g には無い", async ({ page }) => {
    await openMock(page, "mock/item-new/");
    const qty = page.getByRole("textbox", { name: "個数", exact: true });
    await qty.fill("500");
    await qty.blur();
    await expect(qty).toHaveValue("500");
    await qty.fill("１.５");
    await qty.blur();
    await expect(qty).toHaveValue("1.5");
    await expect(page.getByText("小数は第一位までです")).toHaveCount(0);
    await qty.fill("1.25");
    await qty.blur();
    await expect(page.getByText("小数は第一位までです")).toBeVisible();
    await expect(qty).toHaveValue("1.25"); // 勝手に丸めない
    await expect(qty).toHaveAttribute("aria-invalid", "true");
    await qty.fill("あ");
    await qty.blur();
    await expect(page.getByText("数を入れてください")).toBeVisible();
    await qty.fill("0");
    await qty.blur();
    await expect(page.getByText("0 より大きい数を入れてください")).toBeVisible();
    await qty.fill("");
    await qty.blur();
    await expect(page.getByText("個数を入れてください")).toBeVisible();
    await qty.fill("2");
    await qty.blur();
    await page.getByRole("button", { name: "個数を1増やす" }).click();
    await expect(qty).toHaveValue("3");
    await page.getByRole("button", { name: "個数を1減らす" }).click();
    await expect(qty).toHaveValue("2");

    // 単位で ± の有無が変わる(マスタの「±で数える」)
    const units = page.getByRole("group", { name: "単位" });
    await units.getByRole("button", { name: "g", exact: true }).click();
    await expect(page.getByRole("button", { name: "個数を1増やす" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "個数を1減らす" })).toHaveCount(0);
    await units.getByRole("button", { name: "個", exact: true }).click();
    await expect(page.getByRole("button", { name: "個数を1増やす" })).toBeVisible();
  });

  test("候補を選ぶと前回の値(管理のしかた・ジャンル・単位・場所・補充の目安・期限)が入り、フォーカスが外れる。登録すると食材の在庫に1件増える", async ({ page }) => {
    await openMock(page, "mock/item-new/");
    await expect(page.getByLabel("購入日")).toHaveValue("2026-10-23");
    await itemName(page).fill("ほげ");
    await expect(page.getByText("候補はありません。このまま新しい品物として登録できます。")).toBeVisible();
    await itemName(page).fill("納");
    await page.getByRole("button", { name: "納豆" }).click();
    await expect(itemName(page)).not.toBeFocused();
    await expect(page.getByLabel("ジャンル")).toHaveValue("その他");
    await expect(page.getByRole("group", { name: "単位" }).getByRole("button", { name: "パック", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("group", { name: "場所" }).getByRole("button", { name: "冷蔵庫" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "数で決める", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("textbox", { name: "補充の目安の数" })).toHaveValue("1");
    await expect(page.getByLabel("期限")).toHaveValue("2026-10-30");
    await expect(page.getByText("前回から 7日後を提案")).toBeVisible();
    await registerButton(page).click();
    await expect(toast(page, "納豆を登録しました")).toBeVisible();
    await expect(itemName(page)).toHaveValue("");
    await page.getByRole("link", { name: "もどる" }).click();
    await expect(page.getByRole("link", { name: "納豆を編集" })).toHaveCount(2);
  });

  test("補充の目安: 数は 切れたら / 数で決める / なし、残量は △で / ×で / なし(既定 △で)。「数で決める」の数の誤り", async ({ page }) => {
    await openMock(page, "mock/item-new/");
    for (const label of ["切れたら", "数で決める", "なし"]) await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "数で決める", exact: true }).click();
    const n = page.getByRole("textbox", { name: "補充の目安の数" });
    await n.fill("0");
    await n.blur();
    await expect(page.getByText("0 より大きい数を入れてください")).toBeVisible();
    await page.getByRole("button", { name: "残量で管理", exact: true }).click();
    for (const label of ["△で", "×で", "なし"]) await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "△で", exact: true })).toHaveAttribute("aria-pressed", "true");
  });

  test("日用品: 既定は残量で管理。ジャンルは自由入力 + 使っている語の候補(打った文字で絞る)。品物名の候補にも前回の値", async ({ page }) => {
    await openMock(page, "mock/item-new/");
    await page.getByRole("button", { name: "日用品", exact: true }).click();
    await expect(page.getByRole("button", { name: "残量で管理", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "残量 ○" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("備考")).toBeVisible();
    const genre = page.getByRole("textbox", { name: "ジャンル" });
    await expect(genre).toHaveValue("");
    await expect(page.getByText("空でもかまいません")).toBeVisible();
    const cands = page.getByRole("group", { name: "ジャンルの候補" });
    expect(await chipTexts(cands)).toEqual(["紙類", "洗剤", "キッチン", "お風呂", "洗面所"]);
    await genre.fill("洗");
    await expect.poll(() => chipTexts(cands)).toEqual(["洗剤", "洗面所"]);
    await cands.getByRole("button", { name: "洗剤" }).click();
    await expect(genre).toHaveValue("洗剤");

    await itemName(page).fill("シャン");
    await page.getByRole("button", { name: /シャンプーの詰め替え/ }).click();
    await expect(page.getByRole("button", { name: "数で管理", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(genre).toHaveValue("お風呂");
    await expect(page.getByRole("group", { name: "単位" }).getByRole("button", { name: "本", exact: true })).toHaveAttribute("aria-pressed", "true");
    await registerButton(page).click();
    await expect(toast(page, "シャンプーの詰め替えを登録しました")).toBeVisible();
  });

  test("品物名は世帯の中で1つ。候補は両方の種別で、違う種別には印。選ぶと種別が変わる。別の種別にある名前で登録すると誤り", async ({ page }) => {
    await openMock(page, "mock/item-new/");
    await page.getByRole("button", { name: "日用品", exact: true }).click();
    await itemName(page).fill("しょう");
    const cand = page.getByRole("button", { name: /しょうゆ/ });
    await expect(cand).toContainText("食材");
    await cand.click();
    await expect(page.getByRole("button", { name: "食材", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("ジャンル")).toHaveValue("調味料");
    await expect(page.getByRole("button", { name: "残量で管理", exact: true })).toHaveAttribute("aria-pressed", "true");

    await openMock(page, "mock/item-new/");
    await page.getByRole("button", { name: "日用品", exact: true }).click();
    await itemName(page).fill("しょうゆ");
    await registerButton(page).click();
    await expect(page.getByText("「しょうゆ」は食材にあります。候補から選んでください。")).toBeVisible();
    await expect(itemName(page)).toBeFocused();
  });

  test("新しい食材(残量で管理)と新しい日用品(数で管理)を登録すると、食材の画面・日用品・買い物リスト(目安で載る)に反映される", async ({ page }) => {
    await openMock(page, "mock/item-new/");
    await itemName(page).fill("みりん");
    await page.getByLabel("ジャンル").selectOption("調味料");
    await page.getByRole("button", { name: "残量で管理", exact: true }).click();
    await page.getByRole("button", { name: "残量 △" }).click();
    await registerButton(page).click();
    await expect(toast(page, "みりんを登録しました")).toBeVisible();

    await page.getByRole("button", { name: "日用品", exact: true }).click();
    await page.getByRole("button", { name: "数で管理", exact: true }).click();
    await itemName(page).fill("ラップ");
    await page.getByRole("group", { name: "単位" }).getByRole("button", { name: "本", exact: true }).click();
    await page.getByRole("button", { name: "切れたら", exact: true }).click();
    await page.getByRole("textbox", { name: "個数", exact: true }).fill("0.5");
    await registerButton(page).click();
    await expect(toast(page, "ラップを登録しました")).toBeVisible();

    await page.getByRole("link", { name: "もどる" }).click();
    await expect(page.getByRole("button", { name: /^みりんの残量 △/ })).toBeVisible();
    await tabs(page).getByRole("link", { name: "日用品" }).click();
    await expect(page.getByRole("link", { name: "ラップを編集" }).locator("xpath=ancestor::li")).toContainText("0.5 本");
    await tabs(page).getByRole("link", { name: "買い物リスト" }).click();
    await expect(page.getByRole("checkbox", { name: /ラップ/ })).toHaveCount(0); // 0.5 > 0。「切れたら」は 0 のとき
    await expect(page.locator("label", { hasText: "みりん" })).toContainText("減った");
  });
});

// ---- 品物の編集 ----
test.describe("品物の編集", () => {
  test("直接開くと牛乳(数で管理)。在庫は2ブロック。使い切りで消えて「元に戻す」。数を 0 にしても消える", async ({ page }) => {
    await openMock(page, "mock/item-edit/");
    await expect(page.getByRole("textbox", { name: "品物名" })).toHaveValue("牛乳");
    await expect(page.getByText("いまは 数で管理")).toBeVisible();
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

  test("数の入力は小数第一位まで。誤りは欄の下に出て反映しない", async ({ page }) => {
    await openMock(page, "mock/item-edit/");
    const qty = page.getByRole("textbox", { name: "牛乳の数" }).first();
    await qty.fill("1.25");
    await qty.blur();
    await expect(page.getByText("小数は第一位までです")).toBeVisible();
    await qty.fill("1.5");
    await qty.blur();
    await expect(qty).toHaveValue("1.5");
    await page.getByRole("link", { name: "もどる" }).click();
    await expect(page.getByText("1.5本", { exact: true })).toBeVisible();
  });

  test("品物名は空・同じ名前にできない(前の名前のまま)。名前の変更はフォーカスが外れたとき反映", async ({ page }) => {
    await openMock(page, "mock/item-edit/");
    const name = page.getByRole("textbox", { name: "品物名" });
    await name.fill("");
    await name.blur();
    await expect(page.getByText("品物名を入れてください")).toBeVisible();
    await name.fill("卵");
    await name.blur();
    await expect(page.getByText("同じ名前の品物があります")).toBeVisible();
    await name.fill("低脂肪牛乳");
    await name.blur();
    await expect(page.getByText("同じ名前の品物があります")).toHaveCount(0);
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
    await tabs(page).getByRole("link", { name: "買い物リスト" }).click();
    await expect(page.getByRole("checkbox", { name: /牛乳/ })).toHaveCount(0);
  });

  test("補充の目安をその場で変えると、買い物リストに載る(卵を「切れたら」、在庫を使い切り → 切れた)", async ({ page }) => {
    await openMock(page, "mock/stock/");
    await editLink(page, "卵").click();
    await page.getByRole("button", { name: "切れたら", exact: true }).click();
    await page.getByRole("button", { name: /^卵\(冷蔵庫\)を使い切り$/ }).click();
    await expect(page.getByText("在庫はありません")).toBeVisible();
    await page.getByRole("link", { name: "もどる" }).click();
    await tabs(page).getByRole("link", { name: "買い物リスト" }).click();
    await expect(page.locator("label", { hasText: "卵" })).toContainText("切れた");
  });

  test("数 → 残量(牛乳): 何が起きるかを書き、残量の初期値で「変える」。消えた在庫は「元に戻す」で戻る", async ({ page }) => {
    await openMock(page, "mock/item-edit/");
    const open = page.getByRole("button", { name: "残量で管理に変える" });
    await open.click();
    await expect(page.getByText("在庫 2件(合計 2 本)は消えて、残量になります。")).toBeFocused();
    await expect(page.getByRole("button", { name: "残量 ○" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "△で", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "やめる" }).click();
    await expect(open).toBeVisible();
    await open.click();
    await page.getByRole("button", { name: "変える", exact: true }).click();
    await expect(toast(page, "牛乳を残量で管理に変えました")).toBeVisible();
    await expect(page.getByText("いまは 残量で管理")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "残量" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3 })).toHaveCount(0);
    await undoButton(page).click();
    await expect(page.getByText("いまは 数で管理")).toBeVisible();
    await expect(page.getByRole("heading", { level: 3 })).toHaveCount(2);
  });

  test("残量 → 数(しょうゆ): 単位が必須、個数の初期値は 1(△)。変えると食材の画面で ± の行になる", async ({ page }) => {
    await openMock(page, "mock/stock/");
    await editLink(page, "しょうゆ").click();
    await expect(page.getByText("いまは 残量で管理")).toBeVisible();
    await page.getByRole("button", { name: "数で管理に変える" }).click();
    await expect(page.getByText("今の残量(△)の代わりに、数を入れます。")).toBeFocused();
    await expect(page.getByRole("textbox", { name: "個数", exact: true })).toHaveValue("1");
    await page.getByRole("button", { name: "変える", exact: true }).click();
    await expect(page.getByText("単位を選んでください")).toBeVisible();
    await page.getByRole("group", { name: "パネルの単位" }).getByRole("button", { name: "本", exact: true }).click();
    await page.getByRole("button", { name: "変える", exact: true }).click();
    await expect(toast(page, "しょうゆを数で管理に変えました")).toBeVisible();
    await expect(page.getByText("いまは 数で管理")).toBeVisible();
    await expect(page.getByRole("heading", { level: 3 })).toHaveCount(1);
    await page.getByRole("link", { name: "もどる" }).click();
    await expect(page.getByRole("button", { name: "しょうゆを1増やす" })).toBeVisible();
  });

  test("残量で管理の品物(しょうゆ)は残量を ○ / △ / × から選ぶ。場所の変更もその場で", async ({ page }) => {
    await openMock(page, "mock/stock/");
    await editLink(page, "しょうゆ").click();
    await expect(page.getByRole("button", { name: "残量 △" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "残量 ×" }).click();
    await page.getByRole("group", { name: "しょうゆの場所" }).getByRole("button", { name: "冷蔵庫" }).click();
    await page.getByRole("link", { name: "もどる" }).click();
    await expect(page.getByRole("button", { name: /^しょうゆの残量 ×/ })).toBeVisible();
    const fridge = page.locator("section", { has: page.getByRole("heading", { level: 2, name: "冷蔵庫" }) });
    await expect(fridge).toContainText("しょうゆ");
  });

  test("数で管理の日用品(シャンプーの詰め替え)は数だけ。0 でもブロックが残る", async ({ page }) => {
    await openMock(page, "mock/supply/");
    await editLink(page, "シャンプーの詰め替え").click();
    await expect(page.getByRole("heading", { level: 3 })).toHaveCount(1);
    await expect(page.getByRole("button", { name: /使い切り$/ })).toHaveCount(0);
    await expect(page.getByRole("group", { name: "シャンプーの詰め替えの場所" })).toHaveCount(0);
    await page.getByRole("button", { name: "シャンプーの詰め替えの数を1減らす" }).click();
    await expect(toast(page, "シャンプーの詰め替えを使い切りました")).toBeVisible();
    await expect(page.getByRole("heading", { level: 3 })).toHaveCount(1);
    await expect(page.getByRole("textbox", { name: "シャンプーの詰め替えの数" })).toHaveValue("0");
  });

  test("品物を削除: 来た元の画面(食材)へ戻り、在庫・買い物リストの行も消える。「元に戻す」で全部戻る", async ({ page }) => {
    await openMock(page, "mock/stock/");
    await editLink(page, "納豆").click();
    await expect(page.getByText("在庫と買い物リストの項目も消えます。")).toBeVisible();
    await page.getByRole("button", { name: "品物を削除" }).click();
    await expect(page.locator("h1")).toHaveText("もっちり倉庫");
    await expect(toast(page, "納豆を削除しました。在庫と買い物リストからも消えました")).toBeVisible();
    await expect(page.getByRole("link", { name: "納豆を編集" })).toHaveCount(0);
    await undoButton(page).click();
    await expect(page.getByRole("link", { name: "納豆を編集" })).toHaveCount(1);
    await tabs(page).getByRole("link", { name: "買い物リスト" }).click();
    await expect(page.locator("label", { hasText: "納豆" })).toContainText("減った");
  });
});

// ---- 品物の一覧 ----
test.describe("品物の一覧", () => {
  test("食材 15件 / 日用品 9件。ジャンルごとのカード。行は管理のしかたと目安の補足", async ({ page }) => {
    await openMock(page, "mock/items/");
    await expect(page.getByRole("button", { name: "食材", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("15件", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2 })).toHaveText(["野菜・果物", "肉", "卵・乳製品", "冷凍食品", "主食(米・パン・麺)", "調味料", "お菓子", "その他"]);
    const rowOf = (name: string) => page.getByRole("link", { name: `${name}を編集` }).locator("xpath=ancestor::li");
    await expect(rowOf("納豆")).toContainText("数で管理 · 目安 1 パック以下");
    await expect(rowOf("しょうゆ")).toContainText("残量で管理 · 目安 △");
    await expect(rowOf("牛乳")).toContainText("目安なし");
    await page.getByRole("button", { name: "日用品", exact: true }).click();
    await expect(page.getByText("9件", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2 })).toHaveText(["紙類", "洗剤", "キッチン", "お風呂", "洗面所", "ジャンルなし"]);
    await expect(rowOf("ボディソープの詰め替え")).toContainText("目安 切れたら");
    await expect(rowOf("歯みがき粉")).toContainText("目安 ×");
  });

  test("いつもの の切り替えはその場で、食材の いつもの のカードと買い物リストに反映される", async ({ page }) => {
    await openMock(page, "mock/items/");
    const toggle = page.getByRole("button", { name: "ヨーグルトをいつものにする" });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("link", { name: "もどる" }).click();
    const regular = page.locator("section", { has: page.getByRole("heading", { level: 2, name: "いつもの" }) });
    await expect(regular).toContainText("ヨーグルト");
    await tabs(page).getByRole("link", { name: "買い物リスト" }).click();
    await expect(page.locator("label", { hasText: "ヨーグルト" })).toContainText("いつもの");
  });

  test("削除: その場で行が消え、在庫と買い物リストからも消える。6秒の間に「元に戻す」で全部(チェックの状態も)戻る", async ({ page }) => {
    await openMock(page, "mock/items/");
    await page.getByRole("button", { name: "牛乳を削除" }).click();
    await expect(toast(page, "牛乳を削除しました。在庫と買い物リストからも消えました")).toBeVisible();
    await expect(page.getByRole("link", { name: "牛乳を編集" })).toHaveCount(0);
    await page.getByRole("link", { name: "もどる" }).click();
    await expect(page.getByRole("link", { name: "牛乳を編集" })).toHaveCount(0);
    await tabs(page).getByRole("link", { name: "買い物リスト" }).click();
    await expect(page.getByRole("checkbox", { name: /牛乳/ })).toHaveCount(0);
    await undoButton(page).click();
    await expect(page.locator("label", { hasText: "牛乳" })).toContainText("いつもの");
    expect((await checkedNames(page))[0]).toMatchObject({ checked: true });
    await tabs(page).getByRole("link", { name: "食材" }).click();
    await expect(page.getByRole("button", { name: "牛乳を1減らす" })).toHaveCount(2);
  });

  test("在庫も行も無い品物は通知に「在庫と買い物リストからも消えました」を付けない", async ({ page }) => {
    await openMock(page, "mock/items/");
    await page.getByRole("button", { name: "日用品", exact: true }).click();
    await page.getByRole("button", { name: "ハンドソープを削除" }).click();
    await expect(toast(page, "ハンドソープを削除しました")).toBeVisible();
  });

  test("日用品のジャンルの候補は、いま使っている語だけ(OD-stock-uiux-45 A)。歯みがき粉を消すと「洗面所」が消え、元に戻すと戻る", async ({ page }) => {
    await openMock(page, "mock/items/");
    await page.getByRole("button", { name: "日用品", exact: true }).click();
    await page.getByRole("button", { name: "歯みがき粉を削除" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "洗面所" })).toHaveCount(0);
    await undoButton(page).click();
    await expect(page.getByRole("heading", { level: 2, name: "洗面所" })).toBeVisible();

    // ハンドソープに「洗面所」と入れると、歯みがき粉を消しても残る
    await editLink(page, "ハンドソープ").click();
    const genre = page.getByRole("textbox", { name: "ジャンル" });
    await genre.fill("洗面所");
    await genre.blur();
    await page.getByRole("link", { name: "もどる" }).click();
    await page.getByRole("button", { name: "歯みがき粉を削除" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "洗面所" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "ジャンルなし" })).toHaveCount(0);
  });

  test("選んでいる種別は編集から戻っても続く", async ({ page }) => {
    await openMock(page, "mock/items/");
    await page.getByRole("button", { name: "日用品", exact: true }).click();
    await editLink(page, "ゴミ袋").click();
    await expect(page.getByRole("textbox", { name: "品物名" })).toHaveValue("ゴミ袋");
    await page.getByRole("link", { name: "もどる" }).click();
    await expect(page.getByRole("button", { name: "日用品", exact: true })).toHaveAttribute("aria-pressed", "true");
  });
});

// ---- マスタ ----
test.describe("マスタ", () => {
  test("使用中は印だけ(削除なし)。使っていないものは削除でき、「元に戻す」で戻る", async ({ page }) => {
    await openMock(page, "mock/masters/");
    await expect(page.getByRole("button", { name: "肉を削除" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "魚を削除" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "飲み物を削除" })).toHaveCount(1);
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

  test("単位の「±で数える」: 個・本・パック・袋・枚 は入、g・ml は切。切り替えが品物の登録の ± に効く。足した単位の既定は入", async ({ page }) => {
    await openMock(page, "mock/masters/");
    const unitCard = page.locator("section", { has: page.getByRole("heading", { level: 2, name: "単位", exact: true }) });
    for (const u of ["個", "本", "パック", "袋", "枚"]) await expect(unitCard.locator("li", { hasText: new RegExp(`^${u}`) }).first()).toContainText("±で数える");
    await expect(unitCard.locator("li", { hasText: /^g/ }).first()).toContainText("打ち込む");
    await expect(unitCard.locator("li", { hasText: /^ml/ }).first()).toContainText("打ち込む");
    await page.getByRole("button", { name: "gを変更" }).click();
    await page.getByRole("button", { name: "gを±で数える" }).click();
    await page.getByRole("button", { name: "保存" }).click();
    await expect(unitCard.locator("li", { hasText: /^g/ }).first()).toContainText("±で数える");
    await page.getByRole("textbox", { name: "新しい単位" }).fill("缶");
    await unitCard.getByRole("button", { name: "追加" }).click();
    await expect(unitCard.locator("li", { hasText: /^缶/ }).first()).toContainText("±で数える");
  });
});

// ---- モックの設定 ----
test.describe("モックの設定", () => {
  test("設定は「データ」だけ(「元に戻す」の秒数・チェック済みの行は外した)", async ({ page }) => {
    await openMock(page, "mock/");
    await expect(page.getByRole("button", { name: "初期のデータ" })).toBeVisible();
    await expect(page.getByRole("button", { name: "空のデータ" })).toBeVisible();
    await expect(page.getByRole("button", { name: /秒$/ })).toHaveCount(0);
    await expect(page.getByText("チェック済みの行")).toHaveCount(0);
    await expect(page.getByText("さくらもち(3巡目)。9つの画面を触って確かめてください。")).toBeVisible();
  });

  test("「元に戻す」は 6秒: 4.5秒のあいだは残り、そのあと消える", async ({ page }, testInfo) => {
    test.skip(!isPhone(testInfo.project.name), "時間のかかる確認は iPhone 縦だけ");
    test.setTimeout(60_000);
    await openMock(page, "mock/stock/");
    await page.getByRole("button", { name: "牛乳を1減らす" }).first().click();
    await expect(toast(page, "牛乳を使い切りました")).toBeVisible();
    await page.waitForTimeout(4500);
    await expect(toast(page, "牛乳を使い切りました")).toBeVisible();
    await expect(toast(page, "牛乳を使い切りました")).toBeHidden({ timeout: 6000 });
  });

  test("空のデータ: 目次の設定で、在庫・日用品・買い物リスト・品物の一覧が空になる。画面を移っても続く", async ({ page }) => {
    await openViaIndex(page, "空のデータ", "食材の在庫");
    await expect(page.getByRole("heading", { level: 2, name: "食材の在庫はありません" })).toBeVisible();
    await expect(page.getByText("「品物の登録」から追加できます。")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "いつもの" })).toHaveCount(0);
    await tabs(page).getByRole("link", { name: "日用品" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "日用品はまだありません" })).toBeVisible();
    await expect(page.getByRole("searchbox")).toHaveCount(0);
    await expect(page.getByRole("group", { name: "ジャンルで絞り込む" })).toHaveCount(0);
    await tabs(page).getByRole("link", { name: "買い物リスト" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "買い物リストは空です" })).toBeVisible();
    await tabs(page).getByRole("link", { name: "食材" }).click();
    await goItems(page);
    await expect(page.getByRole("heading", { level: 2, name: "品物はありません" })).toBeVisible();
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
