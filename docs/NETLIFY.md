# AppyHacking auf Netlify

Der frühere Cloudflare-Server (`server/worker.js`) läuft hier als Netlify Function
(`netlify/functions/vexora.mjs`). Statt D1/R2 werden genutzt:

- **Datenbank:** SQLite (sql.js) als eine Datei in Netlify Blobs. Jede Anfrage lädt sie, schreibt nur bei
  Änderungen zurück und prüft dabei die Version (ETag); bei Kollision läuft die Anfrage erneut.
- **Bilder (Community, Avatare):** Netlify Blobs.
- **Seiten & Firmware-Basen:** liegen im Funktions-Paket (`protected/`), `cfw/bases` ist nie öffentlich.
- **Skripte, Bilder, Schriften:** liefert das Netlify-CDN direkt aus (`dist/`).

## Einrichten

1. Netlify → *Add new site* → *Import from Git* → Repo `appycfw`, Branch wählen.
   Build-Einstellungen kommen aus `netlify.toml` (Node 22).
2. *Site configuration → Environment variables*:

| Variable | Zweck |
|---|---|
| `ADMIN_PASSWORD` | Passwort für `/admin.html` (Pflicht) |
| `BOT_SECRET` | Geheimnis für den Discord-Bot |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `SUPPORT_GUILD_ID`, `SUPPORT_ROLE_ID`, `FOUNDER_ROLE_ID` | Discord-Login (optional) |
| `RESEND_API_KEY` | Mailversand (`test-key` = Testmodus) |
| `GROQ_API_KEY` | KI-Übersetzung/Support (optional) |
| `ACCESS_VERIFY_URL` | Code-Prüfung gegen die Zugangsseite (Standard `https://appycodeee.netlify.app/api/verify-access`) |
| `FEEDBACK_SECRET` | Gemeinsames Geheimnis (gleicher Wert wie `APP_FEEDBACK_SECRET` auf der Zugangsseite): damit kommt ALLES Feedback in Discord an, nicht nur das mit Shop-Code |
| `REVENUE_URL` | Quelle für den bestätigten Umsatz im Admin-Panel (Standard `https://appycodeee.netlify.app/api/app-revenue`; nutzt `FEEDBACK_SECRET`) |
| `FEEDBACK_FORWARD_URL` | Feedback-Weiterleitung an Discord/Seite (Standard `https://appycodeee.netlify.app/api/app-feedback`) |

3. Nach dem ersten Deploy: `/admin.html` öffnen, anmelden, **Maintenance ausschalten**.
   Das ist nach jedem neuen Deploy nötig (Wartungsmodus startet immer an).

## Lokal testen

```
npm install
node build-protect.js && node scripts/netlify-build.js
node scripts/local-netlify.mjs      # http://127.0.0.1:8789 (Admin-Passwort: dev-admin)
```

## Grenzen

- Netlify-Funktionen haben 125.000 Aufrufe/Monat im Gratis-Tarif; Seiten und API zählen, Skripte/Bilder nicht.
- Sehr viele gleichzeitige Schreibvorgänge können kurz mit 503 "Server busy" antworten (der Client versucht es erneut).
- IP-Sperren gelten für Seiten und API, nicht für statische Dateien (Skripte, Bilder).
