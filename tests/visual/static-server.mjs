// Minimal dependency-free static file server used to serve the vendored
// visual-regression reference (tests/visual/reference) for both
// `pnpm goldens` (capture-goldens.mjs) and playwright.config.ts's webServer
// entries — both webServer entries (the reference AND the
// real implementation's `dist/`, per the comment above `serveStatic`
// below) use it. No third-party static-server package is added so the pinned
// dependency set in package.json stays exactly the intended "exact stack"
// list.
//
// This also replaces `astro preview` as the impl-preview
// webServer command. Astro 7.2.2's `astro preview` daemonizes (it forks a
// detached background process and the launching process exits within
// ~1s), which Playwright's `webServer` cannot use — it monitors the
// *launching* process and treats that early exit as a crash ("Process from
// config.webServer exited early"). Since the build output is fully static,
// a plain file server needs no proxying/SSR behavior `astro preview`
// provides; only directory→index.html resolution had to be added below.
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
      const pathname = decodeURIComponent(url.pathname);
      let filePath = normalize(join(root, pathname));
      if (!filePath.startsWith(root + sep) && filePath !== root) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      let st = await stat(filePath).catch(() => null);
      if (st?.isDirectory()) {
        // Astro static output: "/", "/builds", etc. each resolve to their
        // own "<dir>/index.html" (used when serving `dist/`).
        filePath = join(filePath, "index.html");
        st = await stat(filePath).catch(() => null);
      }
      if (!st && pathname === "/") {
        // The vendored reference's entry point isn't named index.html.
        filePath = join(root, "Homepage.dc.html");
        st = await stat(filePath).catch(() => null);
      }
      if (!st) {
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
