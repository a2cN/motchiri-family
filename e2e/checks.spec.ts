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

  // ---- 30_architecture.md D-15: 部品(checkbox、role 付き、隠れた要素)に合わせた広げ方 ----

  test("20px の button[role=checkbox] を検出する", async ({ page }) => {
    await page.setContent('<button role="checkbox" aria-label="x" style="display:block;width:20px;height:20px"></button>');
    const small = await findSmallTapTargets(page);
    expect(small).toHaveLength(1);
  });

  test("同じ 20px のものを、48px の label で包むと検出しない", async ({ page }) => {
    await page.setContent(
      '<label style="display:flex;align-items:center;height:48px;width:200px"><button role="checkbox" aria-label="x" style="display:block;width:20px;height:20px"></button>牛乳</label>',
    );
    expect(await findSmallTapTargets(page)).toEqual([]);
  });

  test("label が 44px 未満なら、中の checkbox が大きくても検出する", async ({ page }) => {
    await page.setContent(
      '<label style="display:flex;align-items:center;height:30px;width:200px"><input type="checkbox" style="width:20px;height:20px;margin:0">牛乳</label>',
    );
    const small = await findSmallTapTargets(page);
    expect(small).toHaveLength(1);
    expect(small[0].height).toBeCloseTo(30, 1);
  });

  test("素の input[type=checkbox] と [role=button] と summary の 20px を検出する", async ({ page }) => {
    await page.setContent(
      '<input type="checkbox" style="display:block;width:20px;height:20px;margin:0"><div role="button" style="width:20px;height:20px"></div><details><summary style="display:block;height:20px">s</summary></details>',
    );
    expect(await findSmallTapTargets(page)).toHaveLength(3);
  });

  test("aria-hidden の中の小さな input・button は、押せる範囲も 16px も検出しない", async ({ page }) => {
    await page.setContent(
      '<span aria-hidden="true"><input type="checkbox" style="width:1px;height:1px;font-size:10px"><button style="width:1px;height:1px"></button></span>',
    );
    expect(await findSmallTapTargets(page)).toEqual([]);
    expect(await findSmallInputs(page)).toEqual([]);
  });

  test("描かれていない(display:none)・visibility:hidden の小さな要素は検出しない", async ({ page }) => {
    await page.setContent(
      '<button style="display:none;width:10px;height:10px"></button><button style="visibility:hidden;width:10px;height:10px"></button><input style="display:none;font-size:10px"><input style="visibility:hidden;font-size:10px">',
    );
    expect(await findSmallTapTargets(page)).toEqual([]);
    expect(await findSmallInputs(page)).toEqual([]);
  });

  test("44×44px ちょうどの role 付きの要素は検出しない(対照)", async ({ page }) => {
    await page.setContent(
      '<div role="tab" style="width:44px;height:44px"></div><div role="option" style="width:44px;height:44px"></div><div role="switch" style="width:44px;height:44px"></div>',
    );
    expect(await findSmallTapTargets(page)).toEqual([]);
  });
});
