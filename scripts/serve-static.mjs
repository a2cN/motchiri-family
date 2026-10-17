// out/ を /motchiri-family/ の下で配る、依存の無い小さなサーバー(E2E 用。30_architecture.md D-08)。
// GitHub Pages に近い挙動: ディレクトリは index.html、見つからなければ 404.html を 404 で返す。
// 127.0.0.1 だけで待ち受け、out/ の外のファイルは返さない。
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const BASE_PATH = "/motchiri-family";
const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT ?? 4173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

// URL のパスから、outDir の中のファイルの絶対パスを決める。範囲外・basePath の外は null。
export function resolveRequestPath(outDir, rawUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(rawUrl, "http://localhost").pathname);
  } catch {
    return null;
  }
  if (pathname.includes("\0")) return null;
  if (pathname !== BASE_PATH && !pathname.startsWith(`${BASE_PATH}/`)) return null;
  const relative = pathname.slice(BASE_PATH.length).replace(/^\/+/, "");
  const root = path.resolve(outDir);
  const target = path.resolve(root, relative);
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  return target;
}

async function isFile(p) {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

export function createStaticServer(outDir) {
  const root = path.resolve(outDir);
  const send = async (res, status, file) => {
    const body = await readFile(file);
    res.writeHead(status, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    res.end(body);
  };
  return createServer(async (req, res) => {
    try {
      const target = resolveRequestPath(root, req.url ?? "/");
      if (target !== null) {
        for (const candidate of [target, path.join(target, "index.html")]) {
          if (await isFile(candidate)) return await send(res, 200, candidate);
        }
        const notFound = path.join(root, "404.html");
        if (await isFile(notFound)) return await send(res, 404, notFound);
      }
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not Found");
    } catch {
      res.writeHead(500);
      res.end("Internal Server Error");
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "out");
  createStaticServer(outDir).listen(PORT, HOST, () => {
    console.log(`serving ${outDir} at http://${HOST}:${PORT}${BASE_PATH}/`);
  });
}
