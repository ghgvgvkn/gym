// Static server for the whole repo. `npm run app`:
//   /            → marketing website  (web/index.html)
//   /app/        → the app prototype  (app/index.html)
//   /examples/…  → generated sample-program report
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, extname, normalize } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml" };
const PORT = 4173;

createServer(async (req, res) => {
  try {
    let url = decodeURIComponent(req.url.split("?")[0]);
    if (url === "/") url = "/web/index.html";
    else if (url === "/app" || url === "/app/") url = "/app/index.html";
    else if (url.endsWith("/")) url += "index.html";
    const path = join(ROOT, normalize(url));
    if (!path.startsWith(ROOT)) { res.writeHead(403); return res.end("forbidden"); }
    const buf = await readFile(path);
    res.writeHead(200, { "content-type": TYPES[extname(path)] || "application/octet-stream", "cache-control": "no-cache" });
    res.end(buf);
  } catch { res.writeHead(404); res.end("not found"); }
}).listen(PORT, () => {
  console.log(`IRONMAP → http://localhost:${PORT}          (marketing site)`);
  console.log(`          http://localhost:${PORT}/app/      (app prototype)`);
  console.log(`          http://localhost:${PORT}/examples/sample-program.html`);
});
