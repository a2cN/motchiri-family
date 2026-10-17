import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStaticServer, resolveRequestPath } from "../scripts/serve-static.mjs";

// E2E のサーバーが、basePath の外と out/ の外を返さないことの確認(30_architecture.md §7)。
let dir: string;
let secretDir: string;
let server: ReturnType<typeof createStaticServer>;
let origin: string;

beforeAll(async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), "serve-static-"));
  dir = path.join(base, "out");
  secretDir = base;
  await mkdir(path.join(dir, "stock"), { recursive: true });
  await writeFile(path.join(dir, "index.html"), "top");
  await writeFile(path.join(dir, "404.html"), "notfound");
  await writeFile(path.join(dir, "stock", "index.html"), "stock");
  await writeFile(path.join(base, "secret.txt"), "SECRET");
  server = createStaticServer(dir);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.close();
  await rm(secretDir, { recursive: true, force: true });
});

const get = async (p: string) => {
  const r = await fetch(origin + p);
  return { status: r.status, body: await r.text() };
};

describe("serve-static", () => {
  it("basePath の下の / と /stock/ を配る", async () => {
    expect(await get("/motchiri-family/")).toEqual({ status: 200, body: "top" });
    expect(await get("/motchiri-family/stock/")).toEqual({ status: 200, body: "stock" });
  });

  it("存在しないパスは 404.html を 404 で返す", async () => {
    expect(await get("/motchiri-family/nai/")).toEqual({ status: 404, body: "notfound" });
  });

  it("basePath の外は 404.html ではなく素の 404", async () => {
    expect(await get("/")).toEqual({ status: 404, body: "Not Found" });
    expect(await get("/stock/")).toEqual({ status: 404, body: "Not Found" });
  });

  it("out/ の外へ出るパスを返さない", () => {
    expect(resolveRequestPath(dir, "/motchiri-family/../secret.txt")).toBeNull();
    expect(resolveRequestPath(dir, "/motchiri-family/%2e%2e/secret.txt")).toBeNull();
    expect(resolveRequestPath(dir, "/motchiri-family/..%2fsecret.txt")).toBeNull();
    expect(resolveRequestPath(dir, "/motchiri-family%2f..%2fsecret.txt")).toBeNull();
    expect(resolveRequestPath(dir, "/motchiri-familyX/")).toBeNull();
  });

  it("生の ../ を送っても secret.txt は返らない", async () => {
    const { connect } = await import("node:net");
    const port = (server.address() as AddressInfo).port;
    const raw = await new Promise<string>((resolve) => {
      const s = connect(port, "127.0.0.1", () => {
        s.write("GET /motchiri-family/../secret.txt HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n");
      });
      let data = "";
      s.on("data", (d) => (data += d));
      s.on("close", () => resolve(data));
    });
    expect(raw).not.toContain("SECRET");
  });
});
