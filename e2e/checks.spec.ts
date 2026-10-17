import { expect, test } from "@playwright/test";
import { findHorizontalOverflow, findSmallInputs, findSmallTapTargets } from "./checks";

// 検査そのものの自己テスト。入力欄が1つも無い今でも、検査が空振りしていないことを示す。
test.describe("検査の自己テスト", () => {
  test("16px 未満の入力欄を検出する", async ({ page }) => {
    await page.setContent(
      '<input style="font-size:15px"><textarea style="font-size:12px"></textarea><select style="font-size:16px"></select>',
    );
    const small = await findSmallInputs(page);
    expect(small.map((x) => x.tag).sort()).toEqual(["input", "textarea"]);
  });

  test("16px 以上の入力欄は検出しない", async ({ page }) => {
    await page.setContent('<input style="font-size:16px"><textarea style="font-size:18px"></textarea>');
    expect(await findSmallInputs(page)).toEqual([]);
  });

  test("横スクロールを検出する", async ({ page }) => {
    await page.setContent('<div style="width:120vw;height:10px"></div>');
    expect(await findHorizontalOverflow(page)).not.toBeNull();
  });

  test("横スクロールが無いときは検出しない", async ({ page }) => {
    await page.setContent('<div style="width:50vw;height:10px"></div>');
    expect(await findHorizontalOverflow(page)).toBeNull();
  });

  test("44px 未満の押せる範囲を検出する", async ({ page }) => {
    await page.setContent(
      '<a href="#" style="display:inline-block;width:20px;height:20px">a</a><a href="#" style="display:inline-block;width:44px;height:44px">b</a>',
    );
    const small = await findSmallTapTargets(page);
    expect(small.map((x) => x.text)).toEqual(["a"]);
  });
});
