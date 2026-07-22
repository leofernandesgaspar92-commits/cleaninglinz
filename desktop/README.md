# Leco Desktop (Windows)

Native Windows-App für Leco – doppelklicken, fertig. Kein Terminal, keine
Node-Installation beim Endnutzer. Electron startet das Leco-Backend im
Hintergrund (das zugleich das gebaute Frontend ausliefert) und zeigt die
Oberfläche in einem nativen Fenster.

## Architektur

```
Leco.exe (Electron)
 ├─ Hauptprozess (main.js)
 │   ├─ startet backend/src/server.js  (PORT=4137, SERVE_FRONTEND=1)
 │   ├─ wartet auf /api/health
 │   └─ öffnet Fenster auf http://127.0.0.1:4137
 └─ Renderer  →  React-Frontend (frontend/dist), API über relatives /api
```

Weil das Backend das Frontend selbst ausliefert, funktioniert der relative
API-Pfad `/api` ohne CORS/Proxy – dieselbe Codebasis wie im Web.

## Entwicklung (App lokal starten)

```bash
# 1) Frontend einmalig bauen (liefert frontend/dist)
cd ../frontend && npm install && npm run build

# 2) Desktop-App starten
cd ../desktop && npm install && npm start
```

## Windows-Installer / MSIX bauen

```bash
cd desktop
npm install
npm run dist          # NSIS-Installer (.exe) + Portable + MSIX (appx), x64
# oder gezielt:
npm run dist:portable # nur portable .exe (ohne Installation lauffähig)
npm run dist:msix     # nur MSIX/appx (für den Microsoft Store / Intune)
```

`npm run dist` ruft zuerst `scripts/prepack.mjs` auf: baut das Frontend frisch
und installiert die Backend-Produktionsabhängigkeiten. Anschließend bündelt
`electron-builder` Backend + Frontend als `extraResources`. Die fertigen
Artefakte liegen in `desktop/release/`.

### Voraussetzungen fürs Bauen

- Node.js 20+
- Zum Signieren von MSIX/NSIS: ein Code-Signing-Zertifikat
  (`CSC_LINK` / `CSC_KEY_PASSWORD` als Umgebungsvariablen). Ohne Zertifikat
  entstehen unsignierte Builds (für Tests ok, für den Store nicht).

## Icon

`build/icon.png` (512×512) ist das Quell-Icon; electron-builder leitet daraus
die Windows-`.ico` sowie die MSIX-Kacheln ab. Neu erzeugen:

```bash
node build/make-icon.mjs
```

## Konfiguration

- `LECO_PORT` – interner Backend-Port (Standard 4137)
- Alle Backend-Variablen (`DATABASE_URL`, `JWT_SECRET`, `REDIS_URL`, …) werden
  an den Backend-Kindprozess durchgereicht. In Produktion `DATABASE_URL` auf den
  PostgreSQL-Server zeigen lassen.
