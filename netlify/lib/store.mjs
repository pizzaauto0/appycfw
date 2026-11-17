// Speicher-Schicht: Netlify Blobs in Produktion, Dateien im lokalen Test.
// Beide bieten dieselbe kleine Schnittstelle:
//   get(key)  -> { data: Uint8Array, etag, metadata } | null
//   set(key, bytes, { metadata, onlyIfMatch, onlyIfNew }) -> { modified, etag }
//   delete(key)
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

function fileStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const f = (k) => path.join(dir, encodeURIComponent(k));
  const etagOf = (b) => createHash("sha1").update(b).digest("hex");
  return {
    async get(key) {
      try {
        const data = new Uint8Array(fs.readFileSync(f(key)));
        let metadata = {};
        try { metadata = JSON.parse(fs.readFileSync(f(key) + ".meta", "utf8")); } catch {}
        return { data, etag: etagOf(data), metadata };
      } catch { return null; }
    },
    async set(key, bytes, opts = {}) {
      const cur = await this.get(key);
      if (opts.onlyIfNew && cur) return { modified: false };
      if (opts.onlyIfMatch && (!cur || cur.etag !== opts.onlyIfMatch)) return { modified: false };
      fs.writeFileSync(f(key), bytes);
      fs.writeFileSync(f(key) + ".meta", JSON.stringify(opts.metadata || {}));
      return { modified: true, etag: etagOf(bytes) };
    },
    async delete(key) {
      try { fs.unlinkSync(f(key)); } catch {}
      try { fs.unlinkSync(f(key) + ".meta"); } catch {}
    }
  };
}

async function blobStore(name) {
  const { getStore } = await import("@netlify/blobs");
  const s = getStore({ name, consistency: "strong" });
  return {
    async get(key) {
      const r = await s.getWithMetadata(key, { type: "arrayBuffer", consistency: "strong" });
      return r ? { data: new Uint8Array(r.data), etag: r.etag, metadata: r.metadata || {} } : null;
    },
    async set(key, bytes, opts = {}) {
      const o = { metadata: opts.metadata || {} };
      if (opts.onlyIfMatch) o.onlyIfMatch = opts.onlyIfMatch;
      if (opts.onlyIfNew) o.onlyIfNew = true;
      const r = await s.set(key, bytes, o);
      return { modified: r.modified !== false, etag: r.etag };
    },
    async delete(key) { await s.delete(key); }
  };
}

export async function openStore(name) {
  const local = process.env.VEXORA_LOCAL_STORE;
  return local ? fileStore(path.join(local, name)) : blobStore(name);
}
