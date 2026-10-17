import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { portalModules } from "./registry";

const appDir = path.resolve(__dirname, "..", "app");

describe("portalModules(PT-04)", () => {
  it("stock を含む", () => {
    expect(portalModules.map((m) => m.id)).toContain("stock");
  });

  it("id が重複しない", () => {
    const ids = portalModules.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(portalModules.map((m) => [m.id, m] as const))(
    "%s: id の形式と href の対応が正しい",
    (id, m) => {
      expect(id).toMatch(/^[a-z][a-z_]*$/);
      expect(m.href).toBe(`/${id}/`);
      expect(m.name.length).toBeGreaterThan(0);
    },
  );

  it.each(portalModules.map((m) => [m.id] as const))(
    "%s: src/app/<id>/page.tsx がある(一覧の1行と画面の2つで足せること)",
    (id) => {
      expect(existsSync(path.join(appDir, id, "page.tsx"))).toBe(true);
    },
  );
});
