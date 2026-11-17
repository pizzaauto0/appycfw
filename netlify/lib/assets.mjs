// Ersatz fuer das ASSETS-Binding von Cloudflare: liest die Seiten (HTML) und
// die geschuetzten Firmware-Basen aus dem Funktions-Paket. Statische Dateien
// wie Skripte und Bilder liefert Netlify selbst direkt aus.
import fs from "node:fs";
import path from "node:path";

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".apk": "application/vnd.android.package-archive"
};

function findRoot(dirName) {
  const roots = [process.env.LAMBDA_TASK_ROOT, process.cwd(), path.resolve(import.meta.dirname || ".", "../..")].filter(Boolean);
  for (const r of roots) if (fs.existsSync(path.join(r, dirName))) return path.join(r, dirName);
  return path.join(roots[0] || ".", dirName);
}

export function makeAssets(dirName = "protected") {
  const root = findRoot(dirName);
  const resolve = (p) => {
    const rel = decodeURIComponent(p).replace(/^\/+/, "");
    const abs = path.join(root, rel);
    if (!abs.startsWith(root)) return null;
    const tries = [abs, abs + ".html", path.join(abs, "index.html")];
    for (const t of tries) if (fs.existsSync(t) && fs.statSync(t).isFile()) return t;
    return null;
  };
  return {
    async fetch(request) {
      const url = new URL(typeof request === "string" ? request : request.url);
      const file = resolve(url.pathname);
      if (!file) {
        const nf = path.join(root, "404.html");
        const body = fs.existsSync(nf) ? fs.readFileSync(nf) : "Not found";
        return new Response(body, { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
      }
      return new Response(fs.readFileSync(file), {
        status: 200,
        headers: { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" }
      });
    }
  };
}
