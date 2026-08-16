// Minimal dependency-free static file server used to serve the vendored
// visual-regression reference (tests/visual/reference) for both
// `pnpm goldens` (capture-goldens.mjs) and playwright.config.ts's webServer
// entry for the reference. No third-party static-server package is added
// so the pinned dependency set in package.json stays exactly the plan's
// "exact stack" list.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".pdf": "application/pdf",
};

/**
 * @param {string} rootDir absolute path to the directory to serve
 * @param {number} port
 * @returns {Promise<import('node:http').Server>} resolves once listening
 */
export function serveStatic(rootDir, port) {
  const root = normalize(rootDir);
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === "/") pathname = "/Homepage.dc.html";
      const filePath = normalize(join(root, pathname));
      if (!filePath.startsWith(root + sep) && filePath !== root) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      const st = await stat(filePath);
      if (st.isDirectory()) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const body = await readFile(filePath);
      res.writeHead(200, {
        "Content-Type": MIME[extname(filePath)] || "application/octet-stream",
        "Content-Length": body.length,
      });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => resolve(server));
  });
}

// Allow `node tests/visual/static-server.mjs <rootDir> <port>` for use as a
// playwright.config.ts webServer `command`.
if (import.meta.url === `file://${process.argv[1]}`) {
  const [rootDir, portArg] = process.argv.slice(2);
  if (!rootDir || !portArg) {
    console.error("usage: static-server.mjs <rootDir> <port>");
    process.exit(1);
  }
  const port = Number(portArg);
  await serveStatic(rootDir, port);
  console.log(`serving ${rootDir} on http://localhost:${port}`);
}
