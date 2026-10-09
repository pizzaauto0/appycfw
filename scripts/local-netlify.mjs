// Lokaler Test der Netlify-Variante ohne Netlify-Konto:
//   node build-protect.js && node scripts/netlify-build.js
//   node scripts/local-netlify.mjs      -> http://127.0.0.1:8789
// Ahmt Netlify nach: statische Dateien aus dist/ zuerst, sonst die Funktion.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.VEXORA_LOCAL_STORE = process.env.VEXORA_LOCAL_STORE || path.join(root, ".local-store");
for (const [k, v] of Object.entries({ ADMIN_PASSWORD: "dev-admin", BOT_SECRET: "dev-bot", RESEND_API_KEY: "test-key", GROQ_API_KEY: "test" })) {
  process.env[k] = process.env[k] || v;
}
const { default: handler } = await import("../netlify/functions/vexora.mjs");
const MIME = { ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json", ".webmanifest": "application/manifest+json" };
const port = Number(process.env.PORT || 8789);

http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, `http://127.0.0.1:${port}`);
    const f = path.join(root, "dist", decodeURIComponent(u.pathname));
    if (u.pathname !== "/" && f.startsWith(path.join(root, "dist")) && fs.existsSync(f) && fs.statSync(f).isFile()) {
      res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" });
      return res.end(fs.readFileSync(f));
    }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const r = new Request(u, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body });
    const out = await handler(r, { ip: req.headers["cf-connecting-ip"] || req.socket.remoteAddress, geo: { country: { code: req.headers["cf-ipcountry"] || "" } }, deploy: { id: "local" } });
    res.writeHead(out.status, Object.fromEntries(out.headers));
    res.end(Buffer.from(await out.arrayBuffer()));
  } catch (e) {
    res.writeHead(500); res.end(String(e && e.stack || e));
  }
}).listen(port, "127.0.0.1", () => console.log("http://127.0.0.1:" + port));
