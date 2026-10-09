// Kleiner Ersatz fuer Cloudflare D1 auf Basis von sql.js (SQLite als WASM).
// Die ganze Datenbank liegt als eine Datei in Netlify Blobs. Pro Anfrage wird
// sie geladen, die Anfrage laeuft gegen den Speicher, und nur wenn sich etwas
// geaendert hat, wird sie zurueckgeschrieben - mit Versionspruefung (ETag).
// Kollidieren zwei gleichzeitige Schreibvorgaenge, laeuft die Anfrage erneut.
import fs from "node:fs";
import path from "node:path";
import initSqlJs from "sql.js";

let SQLP = null;
function loadSql() {
  if (SQLP) return SQLP;
  const roots = [process.env.LAMBDA_TASK_ROOT, process.cwd(), path.resolve(import.meta.dirname || ".", "../..")].filter(Boolean);
  let wasm = null;
  for (const r of roots) {
    const p = path.join(r, "node_modules/sql.js/dist/sql-wasm.wasm");
    if (fs.existsSync(p)) { wasm = fs.readFileSync(p); break; }
  }
  SQLP = initSqlJs(wasm ? { wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) } : {});
  return SQLP;
}

const isRead = (sql) => /^\s*(select|with|pragma)\b/i.test(sql);
const clean = (v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v);

class Stmt {
  constructor(d1, sql, params = []) { this.d1 = d1; this.sql = sql; this.params = params; }
  bind(...p) { return new Stmt(this.d1, this.sql, p.map(clean)); }
  _rows() {
    const st = this.d1.db.prepare(this.sql);
    try {
      if (this.params.length) st.bind(this.params);
      const rows = [];
      while (st.step()) rows.push(st.getAsObject());
      return rows;
    } finally { st.free(); }
  }
  _exec() {
    const db = this.d1.db;
    const rows = this._rows();
    let changes = 0, last = 0;
    if (!isRead(this.sql)) {
      changes = db.getRowsModified();
      const r = db.exec("SELECT last_insert_rowid()");
      last = r[0] ? r[0].values[0][0] : 0;
    }
    return { results: rows, success: true, meta: { changes, last_row_id: last, rows_read: rows.length, rows_written: changes } };
  }
  async all() { return this._exec(); }
  async run() { return this._exec(); }
  async first(col) {
    const r = this._rows()[0];
    if (!r) return null;
    return col ? (r[col] === undefined ? null : r[col]) : r;
  }
  async raw() { return this._rows().map((r) => Object.values(r)); }
}

class D1 {
  constructor(db) { this.db = db; }
  prepare(sql) { return new Stmt(this, sql); }
  async exec(sql) { this.db.exec(sql); return { count: 1, duration: 0 }; }
  async batch(stmts) {
    const out = [];
    this.db.exec("SAVEPOINT vx_batch");
    try {
      for (const s of stmts) out.push(s._exec());
      this.db.exec("RELEASE vx_batch");
    } catch (e) {
      this.db.exec("ROLLBACK TO vx_batch");
      this.db.exec("RELEASE vx_batch");
      throw e;
    }
    return out;
  }
}

function fingerprint(db) {
  const a = db.exec("SELECT total_changes()")[0].values[0][0];
  const b = db.exec("PRAGMA schema_version")[0].values[0][0];
  return a + ":" + b;
}

// Fuehrt fn(d1) aus und speichert die Datenbank, falls sie sich geaendert hat.
// fn darf mehrfach laufen (bei Schreibkonflikt), muss also wiederholbar sein.
export async function withDatabase(store, key, fn, attempts = 5) {
  const SQL = await loadSql();
  for (let i = 0; i < attempts; i++) {
    const cur = await store.get(key);
    const db = cur ? new SQL.Database(cur.data) : new SQL.Database();
    const before = fingerprint(db);
    let out;
    try {
      out = await fn(new D1(db));
      if (fingerprint(db) === before) return out;
      const bytes = db.export();
      const res = cur
        ? await store.set(key, bytes, { onlyIfMatch: cur.etag })
        : await store.set(key, bytes, { onlyIfNew: true });
      if (res.modified) return out;
    } finally {
      try { db.close(); } catch {}
    }
    await new Promise((r) => setTimeout(r, 40 + Math.random() * 120));
  }
  throw new Error("database busy");
}

export function r2Like(store) {
  return {
    async put(key, bytes, opts = {}) {
      const ct = opts.httpMetadata && opts.httpMetadata.contentType;
      await store.set(key, bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), { metadata: { contentType: ct || "application/octet-stream" } });
    },
    async get(key) {
      const r = await store.get(key);
      if (!r) return null;
      return { body: r.data, httpMetadata: { contentType: r.metadata && r.metadata.contentType } };
    },
    async delete(key) { await store.delete(key); }
  };
}
