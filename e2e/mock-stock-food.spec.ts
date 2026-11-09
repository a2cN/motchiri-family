import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { findBottomOverlap, findHorizontalOverflow, findSmallInputs, findSmallTapTargets } from "./checks";

// stock-food のモックの画面ごとのスクリーンショットと検査(40_design_brief.md「撮るスクリーンショット」)。
// 出力先は E2E_SCREENSHOT_DIR/<プロジェクト名>/。時計は 2026-10-23(金)正午に固定する。モックと一緒に消える。
const dir = path.resolve(process.env.E2E_SCREENSHOT_DIR ?? "e2e-artifacts/mock-screenshots");

type Shot = { page: string; name: string; url: string; full?: boolean; prepare?: (p: Page) => Promise<void> };
const stock = (state: string, name = state): Shot => ({ page: "stock", name, url: `mock/stock/?state=${state}` });
const newItem = (state: string): Shot => ({ page: "item-new", name: state, url: `mock/item-new/?state=${state}` });
const edit = (name: string, query: string): Shot => ({ page: "item-edit", name, url: `mock/item-edit/?${query}` });

const shots: Shot[] = [
  { page: "stock", name: "", url: "mock/stock/" },
  { page: "stock", name: "full", url: "mock/stock/", full: true },
  ...["genre", "empty", "loading", "error", "offline-error", "offline", "offline-tap", "undo", "save-failed", "gone"].map((s) => stock(s)),
  { page: "item-new", name: "", url: "mock/item-new/" },
  { page: "item-new", name: "full", url: "mock/item-new/", full: true },
  ...["level", "suggest", "error", "unit-error", "tracking-error", "register-failed", "typing", "offline"].map(newItem),
  edit("", "id=milk"),
  { ...edit("full", "id=milk"), full: true },
  edit("soy", "id=soy"),
  edit("bread", "id=bread"),
  edit("none", "id=none"),
  edit("offline", "id=milk&state=offline"),
];

for (const s of shots) {
  const file = `mock-${s.page}${s.name ? `-${s.name}` : ""}.png`;
  test(file, async ({ page }, info) => {
    await page.clock.setFixedTime(new Date("2026-10-23T12:00:00+09:00"));
    const response = await page.goto(s.url);
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
    await page.waitForTimeout(700); // 通知の出入りと描画が落ち着くまで
    const out = path.join(dir, info.project.name);
    fs.mkdirSync(out, { recursive: true });
    await page.screenshot({ path: path.join(out, file), fullPage: !!s.full });
    expect(await findHorizontalOverflow(page)).toBeNull();
    expect(await findSmallInputs(page)).toEqual([]);
    expect(await findSmallTapTargets(page)).toEqual([]);
    if (!s.full) expect(await findBottomOverlap(page)).toBeNull();
  });
}

test("mock-focus.png", async ({ page }, info) => {
  test.skip(info.project.name !== "ipad-portrait", "iPad 縦だけ");
  await page.clock.setFixedTime(new Date("2026-10-23T12:00:00+09:00"));
  await page.goto("mock/stock/");
  await expect(page.locator("h1").first()).toBeVisible();
  await page.keyboard.press("Tab");
  for (let i = 0; i < 8; i++) {
    if (await page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute("aria-label")?.endsWith("を1増やす"))) break;
    await page.keyboard.press("Tab");
  }
  const out = path.join(dir, info.project.name);
  fs.mkdirSync(out, { recursive: true });
  await page.screenshot({ path: path.join(out, "mock-focus.png") });
});
