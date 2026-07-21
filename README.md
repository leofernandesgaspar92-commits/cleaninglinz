# Leco – Reinigungs-Imperium-Management für Linz

Hyper-lokale Software zum **Betrieb** und zur **Übernahme** von Reinigungsfirmen
in Linz. Diese v1 deckt das Kernziel ab: *die erste Übernahme + Integration einer
Linzer Reinigungsfirma produktiv durchführen* – vom Ziel über die Due Diligence
bis zum Ein-Klick-Datenimport ins eigene Imperium.

## Was in dieser Version enthalten ist

| Modul | Status |
|---|---|
| PostgreSQL-Schema (Imperium- + Kunden-DB) inkl. Views | ✅ |
| Backend-API (Node/Express, REST-CRUD) | ✅ |
| Dashboard mit Linz-Karte (OpenStreetMap/Leaflet) | ✅ |
| Unternehmens-Tracker (Kanban, Drag & Drop) | ✅ |
| Kundenliste mit Vertragsübersicht | ✅ |
| Mitarbeiterliste inkl. Linz-Skill-Matrix | ✅ |
| Merger-Workflow (6-Schritte-Assistent + Due Diligence) | ✅ |
| CSV-Import (Kunden/Mitarbeiter) mit Duplikaterkennung | ✅ |
| Finanz-/EBITDA-Explorer (Morgan-Modus) | ✅ |
| Mobile App (Expo): GPS-Check-in, Fotodoku, Offline-Queue | ✅ Scaffold |
| Dark Mode | ✅ |

Bewusst **noch nicht** enthalten (Roadmap): GraphQL, MongoDB/Redis, Auth/DSGVO-Rollen
scharf geschaltet, Verkehrs-/Wetter-API, KI-Reinigungsdauern, Datev/Bank-Integration,
Electron-Packaging, Push-Notifications. Die Architektur ist darauf vorbereitet.

## Architektur

```
db/         PostgreSQL-Schema (schema.sql) + Linz-Seed (seed.sql) + Beispiel-CSVs
backend/    Node/Express REST-API  (Port 4000)
frontend/   React + Vite + Leaflet (Port 5173)
mobile/     React Native / Expo    (Reinigungskräfte)
```

## Schnellstart

Voraussetzungen: Node 18+, PostgreSQL 14+ (lokal oder via Docker).

### 1. Datenbank

**Variante A – Docker:**
```bash
docker compose up -d db
```

**Variante B – vorhandenes PostgreSQL:** Rolle + DB anlegen:
```sql
CREATE ROLE leco LOGIN PASSWORD 'leco';
CREATE DATABASE leco OWNER leco;
```

### 2. Backend

```bash
cd backend
cp .env.example .env          # DATABASE_URL ggf. anpassen
npm install
node src/lib/migrate.js --reset --seed   # Schema + Linz-Beispieldaten
npm start                     # -> http://localhost:4000
```

`--reset` leert das Schema vorher (für einen sauberen Neustart). Ohne `--seed`
wird nur das Schema angelegt.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev                   # -> http://localhost:5173
```

Das Frontend proxyt `/api` automatisch ans Backend.

### 4. Mobile App (optional)

```bash
cd mobile
npm install
npm start                     # Expo – QR-Code mit Expo Go scannen
```
In `mobile/src/api.js` die `BASE`-URL auf die IP deines Backends setzen
(`10.0.2.2` = localhost im Android-Emulator).

## Das Linz-Szenario (Seed-Daten)

Nach dem Seed ist folgende Ausgangslage geladen:

- **Leco Cleaning** – dein Kern-Unternehmen (integriert)
- **Donau Sauber GmbH** – aktive Übernahme, mitten in der Due Diligence
- **Stahl & Glanz**, **Urfahr Reinigung** – weitere Ziele in der Pipeline

Durchspielen der ersten Übernahme:
1. **Übernahme** → *Donau Sauber* öffnen
2. Due-Diligence-Punkte abhaken (Linz-spezifische sind hervorgehoben)
3. Schritt *Mitarbeiter/Kunden* → **Import** öffnet sich vorbelegt
4. `db/samples/kunden_donau_sauber.csv` bzw. `mitarbeiter_donau_sauber.csv` hochladen
5. Marke behalten oder in Leco umbenennen → Firma wird *integriert*

## API-Überblick

| Methode | Pfad | Zweck |
|---|---|---|
| GET/POST/PATCH/DELETE | `/api/companies` | Unternehmen (Imperium) |
| GET/POST/PATCH/DELETE | `/api/customers` | Kunden |
| GET | `/api/customers/:id/contracts` | Verträge eines Kunden |
| GET/POST/PATCH/DELETE | `/api/contracts` | Verträge |
| GET/POST/PATCH/DELETE | `/api/employees` | Mitarbeiter |
| GET/POST/PATCH/DELETE | `/api/jobs` | Reinigungsaufträge |
| POST | `/api/jobs/:id/checkin` · `/checkout` | GPS-Check-in/out |
| GET | `/api/dashboard/map` | Kartenpunkte (Jobs + Ziele) |
| GET | `/api/dashboard/finance` | Imperium-Kennzahlen, EBITDA-Explorer |
| GET | `/api/dashboard/expiring-contracts` | auslaufende Verträge |
| GET | `/api/acquisitions/by-company/:id` | Übernahme-Workflow + Due Diligence |
| PATCH | `/api/acquisitions/steps/:id` · `/dd/:id` | Schritt / DD-Punkt aktualisieren |
| GET | `/api/acquisitions/by-company/:id/report` | Statusbericht |
| POST | `/api/import/customers` · `/employees` | CSV-Import (multipart, Feld `file`) |

## Datenmodell (Kurzform)

**Imperium:** `companies` → `acquisitions` → `acquisition_steps`,
`due_diligence_items`, `documents`.
**Operativ:** `customers` → `contracts`, `employees`, `jobs` → `job_photos`.
Auswertungs-Views: `v_company_financials` (EBITDA-Explorer),
`v_mrr_by_company` (wiederkehrender Umsatz).

Vollständiges Schema: [`db/schema.sql`](db/schema.sql).
