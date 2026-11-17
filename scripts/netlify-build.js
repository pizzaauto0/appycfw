#!/usr/bin/env node
// Baut den Netlify-Ordner "dist/" aus protected/ (siehe build-protect.js):
// nur statische Dateien (Skripte, Bilder, Schriften ...). Die HTML-Seiten und
// die Firmware-Basen (cfw/bases) bleiben bewusst draussen - sie liefert die
// Funktion aus, damit Wartungsmodus und Zugriffsschutz greifen.
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "protected");
const DST = path.join(__dirname, "..", "dist");

fs.rmSync(DST, { recursive: true, force: true });

function copy(rel) {
  const from = path.join(SRC, rel);
  const st = fs.statSync(from);
  if (st.isDirectory()) {
    if (rel === path.join("cfw", "bases")) return;
    fs.mkdirSync(path.join(DST, rel), { recursive: true });
    for (const n of fs.readdirSync(from)) copy(path.join(rel, n));
    return;
  }
  if (/\.html$/i.test(rel) || rel === "_worker.js") return;
  fs.mkdirSync(path.dirname(path.join(DST, rel)), { recursive: true });
  fs.copyFileSync(from, path.join(DST, rel));
}

fs.mkdirSync(DST, { recursive: true });
for (const n of fs.readdirSync(SRC)) copy(n);
console.log("OK · dist/ erzeugt");
