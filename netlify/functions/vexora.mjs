// AppyHacking auf Netlify: fuehrt den bisherigen Cloudflare-Server
// (server/worker.js) als Netlify Function aus. Datenbank = SQLite in Netlify
// Blobs (netlify/lib/d1.mjs), Bilder = Netlify Blobs, Seiten = Funktions-Paket.
import VexoraServer from "../../server/worker.js";
import { openStore } from "../lib/store.mjs";
import { withDatabase, r2Like } from "../lib/d1.mjs";
import { makeAssets } from "../lib/assets.mjs";

const ENV_NAMES = [
  "ADMIN_PASSWORD", "BOT_SECRET", "DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET",
  "SUPPORT_GUILD_ID", "SUPPORT_ROLE_ID", "FOUNDER_ROLE_ID", "RESEND_API_KEY",
  "GROQ_API_KEY", "MAIL_FROM", "ACCESS_VERIFY_URL", "FEEDBACK_FORWARD_URL"
];

function readEnv(name) {
  try { if (typeof Netlify !== "undefined" && Netlify.env) return Netlify.env.get(name); } catch {}
  return process.env[name];
}

let assets = null;

export default async (req, context) => {
  assets = assets || makeAssets("protected");
  const dbStore = await openStore("vexora-db");
  const mediaStore = await openStore("vexora-media");

  const baseEnv = { ASSETS: assets, BUCKET: r2Like(mediaStore) };
  for (const n of ENV_NAMES) { const v = readEnv(n); if (v) baseEnv[n] = v; }
  // Der Server oeffnet die App nach jedem neuen Deploy wieder im Wartungsmodus;
  // als Kennung dient die Deploy-ID (bei Cloudflare war es der Commit).
  baseEnv.CF_PAGES_COMMIT_SHA = (context && context.deploy && context.deploy.id) || readEnv("DEPLOY_ID") || "local";

  const body = ["GET", "HEAD"].includes(req.method) ? undefined : await req.arrayBuffer();
  const ip = (context && context.ip) || req.headers.get("x-nf-client-connection-ip") || "0.0.0.0";
  const country = (context && context.geo && context.geo.country && context.geo.country.code) || "";

  try {
    return await withDatabase(dbStore, "vexora.sqlite", async (d1) => {
      const pending = [];
      const ctx = { waitUntil: (p) => { pending.push(Promise.resolve(p).catch(() => {})); }, passThroughOnException() {} };
      const headers = new Headers(req.headers);
      headers.set("cf-connecting-ip", ip);
      if (country) headers.set("cf-ipcountry", country);
      const request = new Request(req.url, { method: req.method, headers, body: body ? body.slice(0) : undefined });
      const res = await VexoraServer.fetch(request, { ...baseEnv, DB: d1 }, ctx);
      // Hintergrundarbeit (z. B. Besuchs-Log) abwarten, bevor gespeichert wird
      while (pending.length) await pending.shift();
      return res;
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: "Server busy, please retry" }), {
      status: 503, headers: { "content-type": "application/json", "retry-after": "2" }
    });
  }
};

export const config = { path: "/*", preferStatic: true };
