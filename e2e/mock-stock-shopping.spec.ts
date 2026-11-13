import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { findBottomOverlap, findHorizontalOverflow, findSmallInputs, findSmallTapTargets } from "./checks";

// stock-shopping(3b)の差分のモックの画面ごとのスクリーンショットと検査(40_design_brief.md「撮るスクリーンショット」)。モックと一緒に消える。
// 出力先は E2E_SCREENSHOT_DIR/<プロジェクト名>/。時計は 2026-10-23(金)正午に固定する。
// ページ全体の撮影(fullPage)は使わない。見える範囲(開いた直後、上から)と、ページの一番下までスクロールして撮る -scrolled。
// 通知が出る状態は、通知つきの見える範囲に加えて、通知を閉じた見える範囲(-notoast)と、閉じたあとの -scrolled も撮る
// (通知の下に隠れる行を、人間が確かめられるように)。-scrolled は、ページがスクロールできるときだけ撮る(1画面に収まれば同じ絵)。
const dir = path.resolve(process.env.E2E_SCREENSHOT_DIR ?? "e2e-artifacts/mock-screenshots");

type Shot = { file: string; url: string; toast?: boolean };
const s = (file: string, url: string, toast = false): Shot => ({ file: `${file}.png`, url: `mock/${url}`, toast });

const shots: Shot[] = [
  s("mock-stock", "stock/"),
  s("mock-stock-offline-launch", "stock/?state=offline-launch"),
  s("mock-supply", "supply/"),
  s("mock-shopping-list", "shopping-list/"),
  s("mock-shopping-list-offline", "shopping-list/?state=offline"),
  s("mock-shopping-list-pending", "shopping-list/?state=pending"),
  s("mock-shopping-list-offline-empty", "shopping-list/?state=offline-empty"),
  s("mock-shopping-list-error", "shopping-list/?state=error"),
  s("mock-shopping-list-duplicate", "shopping-list/?state=duplicate", true),
  s("mock-shopping-list-typing", "shopping-list/?state=typing"),
  s("mock-shopping-list-save-failed", "shopping-list/?state=save-failed", true),
  s("mock-shopping-memo", "shopping-memo/"),
  s("mock-shopping-memo-offline", "shopping-memo/?state=offline"),
  s("mock-check-in", "check-in/"),
  s("mock-check-in-offline", "check-in/?state=offline", true),
  s("mock-check-in-offline-nodata", "check-in/?state=offline-nodata"),
  s("mock-check-in-partial-failed", "check-in/?state=partial-failed", true),
  s("mock-item-new-restock", "item-new/?state=restock"),
  s("mock-item-new-supply-restock", "item-new/?from=supply&state=restock"),
  s("mock-item-edit-natto", "item-edit/?id=natto"),
  s("mock-item-edit-natto-panel", "item-edit/?id=natto&state=panel"),
  s("mock-items-food", "items/?kind=food"),
  s("mock-items-supply", "items/?kind=supply"),
];

async function runChecks(page: Page) {
  expect(await findHorizontalOverflow(page)).toBeNull();
  expect(await findSmallInputs(page)).toEqual([]);
  expect(await findSmallTapTargets(page)).toEqual([]);
  expect(await findBottomOverlap(page)).toBeNull(); // 一番下までスクロールして測る
}

for (const shot of shots) {
  test(shot.file, async ({ page }, info) => {
    await page.clock.setFixedTime(new Date("2026-10-23T12:00:00+09:00"));
    const response = await page.goto(shot.url);
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
    await page.waitForTimeout(700); // 通知の出入りと描画が落ち着くまで
    const out = path.join(dir, info.project.name);
    fs.mkdirSync(out, { recursive: true });
    const name = shot.file.replace(/\.png$/, "");
    await page.screenshot({ path: path.join(out, shot.file) });
    await runChecks(page); // 一番下までスクロールする。あとで撮り直すので、上へ戻す
    if (shot.toast) {
      await expect(page.locator("[data-sonner-toast]")).toHaveCount(1);
      await page.evaluate(() => (window as unknown as { __mockDismissToast?: () => void }).__mockDismissToast?.());
      await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(out, `${name}-notoast.png`) });
    }
    const scrollable = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 4);
    if (scrollable) {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(out, `${name}-scrolled.png`) });
      await runChecks(page); // scrolled の画面でも同じ検査
    }
  });
}
