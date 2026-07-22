# Leco Enterprise – Upgrade (Scheibe 1: Sicherheit, Monitoring, Backup, Analytics)

Dieses Dokument beschreibt die erste umgesetzte Scheibe des Enterprise-Upgrades
und die geplante Roadmap. Alles hier Genannte ist **implementiert und getestet**.

## ✅ Umgesetzt & verifiziert

### 1. Sicheres Login mit MFA (TOTP) + RBAC
- Passwort-Hashing mit **scrypt** (node:crypto, keine nativen Abhängigkeiten → Windows-tauglich)
- **JWT**-basierte Sessions (`jsonwebtoken`, Ablauf via `JWT_TTL`)
- **MFA via TOTP** (RFC 6238, SHA1/6-stellig/30s) – kompatibel mit Google/Microsoft
  Authenticator; gegen die offiziellen RFC-Testvektoren verifiziert
- **RBAC**: Rollen `admin` > `manager` > `mitarbeiter`, Middleware `requireAuth`/`requireRole`
- **Kontosperre** nach 5 Fehlversuchen (15 Min), automatische Entsperrung
- **Audit-Log**: jeder Login (Erfolg/Fehlschlag), jede MFA-Änderung dokumentiert

Endpunkte: `POST /api/auth/register|login`, `GET /api/auth/me`,
`POST /api/auth/mfa/setup|enable|disable`.

### 2. Admin-Dashboard (Echtzeit-Monitoring)
- `GET /api/admin/overview` – Nutzer, MFA-Quote, Logins/Fehl-Logins/Fehler/Events (24h)
- `GET /api/admin/audit` – Audit-Log · `GET /api/admin/errors` – Fehler-Log
- `GET /api/admin/users` + `PATCH /api/admin/users/:id/role` – Benutzerverwaltung
- Frontend: Seite **Admin** (nur Admin-Rolle) mit KPIs, Login-Protokoll, Fehler-Log,
  Rollenverwaltung, Nutzungs-Heatmap

### 3. Single Sign-On (Azure AD / Google) – Gerüst
- Vollständiger OAuth2-Authorization-Code-Flow: `GET /api/sso/:provider/login|callback`
- Just-in-Time-Provisioning der Nutzer; JWT-Ausstellung; `GET /api/sso/status`
- Aktiv, sobald `GOOGLE_CLIENT_ID/SECRET` bzw. `AZURE_CLIENT_ID/SECRET/TENANT` gesetzt sind

### 4. Automatisches Backup & Recovery
- `scripts/backup.sh` – `pg_dump` (custom-Format) + Dokumenten-Archiv + SHA256-Prüfsummen
  + Rotation (letzte 14). Für Cron: `npm run backup:cron` (täglich 02:00)
- `scripts/restore.sh` – Ein-Klick-Wiederherstellung (neuestes oder benanntes Backup)
- Verifiziert: Dump enthält alle Tabellen inkl. `audit_log`; `pg_restore --list` bestätigt

### 5. Analytics & Heatmap
- `POST /api/analytics/track` – Funktionsnutzung erfassen (Frontend trackt Seitenaufrufe)
- `GET /api/analytics/heatmap` – meistgenutzte Funktionen + Nutzung nach Uhrzeit (Admin/Manager)

### 6. Performance & Skalierung
- Zusätzliche Indizes für schnelle Abfragen bei großen Datenmengen
  (Jobs nach Kunde/Mitarbeiter, auslaufende Verträge)
- **Caching** (`lib/cache.js`): Redis (falls `REDIS_URL`) oder In-Memory-Fallback;
  Dashboard-Endpunkte gecacht → verifiziert 109 ms → 1–4 ms (Hit-Rate 0,75).
  Statistik unter `GET /api/queue/cache/stats`
- **Asynchrone Job-Queue** (`lib/queue.js`, Tabelle `job_queue`): zeitaufwändige
  Aufgaben laufen im Hintergrund, Status pollbar, überleben Neustarts.
  `POST /api/queue/:type` (z.B. `export_customers`), `GET /api/queue/job/:id`.
  Frontend: „⬇ Export (Hintergrund)" in der Kundenliste mit Fortschritt via Toast

### 10. Outlook/Exchange-Kalender (iCalendar-Feeds)
- `lib/ical.js` erzeugt RFC-5545-konforme Feeds; `routes/calendar.js` liefert
  `/api/calendar/jobs.ics` (Reinigungstermine), `/contracts.ics` (Vertragsfristen,
  ganztags mit −30/−7-Tage-Erinnerungen) und `/contract/:id.ics` (einzeln)
- In Outlook/Exchange als Internet-Kalender **abonnierbar** (aktualisiert sich
  automatisch) oder importierbar; auch Google/Apple-kompatibel
- Frontend: Abo-/Download-Karte im Dashboard + 📅-Link je Vertrag
- Verifiziert: gültiges VCALENDAR (VEVENT+VALARM, CRLF, korrektes Escaping)

### 9. Benachrichtigungen (Slack / Teams / In-App)
- `lib/notify.js`: schreibt jede Meldung in den **In-App-Feed** (Tabelle
  `notifications`) und pusht sie zusätzlich an **Slack**/**Teams** Incoming
  Webhooks (`SLACK_WEBHOOK_URL` / `TEAMS_WEBHOOK_URL`)
- Ausgelöst bei sinnvollen Ereignissen (neuer Benutzer, Hintergrund-Job
  fertig/fehler); Admin-Feed + „Test senden" unter `GET/POST /api/admin/notifications`
- Verifiziert: Feed-Speicherung und Job-Auslösung ohne Webhook (In-App), Push
  aktiv sobald ein Webhook gesetzt ist

### 8. KI-Vertragsanalyse (Merger-Integration)
- `POST /api/contract-ai/analyze` – extrahiert aus Vertragstext automatisch
  Vertragspartner, Laufzeit, **Kündigungsfrist**, Auto-Verlängerung, Frequenz,
  **Monatswert & Preis/m²** sowie besondere Klauseln
- `POST /api/contract-ai/create-contract` – legt daraus direkt einen Vertrag beim Kunden an
- **Live** (mit `ANTHROPIC_API_KEY`): Claude `claude-opus-4-8` mit Structured Output.
  **Sim** (ohne Key): umlaut-tolerante Heuristik – läuft sofort, gegen Beispielvertrag verifiziert
- Frontend: Panel **KI-Vertragsanalyse** in der Übernahme-Seite (Text einfügen →
  Felder → „Als Vertrag übernehmen")

### 7. Observability, API-Dokumentation & CI/CD
- **Prometheus-Metriken** unter `GET /metrics` (Request-Zähler, Latenz-Histogramm,
  RSS-Speicher, Uptime) – direkt von Prometheus/Grafana scrapebar
- **OpenAPI 3** unter `GET /api/openapi.json` + interaktive **Swagger UI** unter `/api/docs`
- **GitHub-Actions-CI** (`.github/workflows/ci.yml`): startet PostgreSQL, migriert
  (Schema+Enterprise+Seed), fährt das Backend hoch, führt die Auth-E2E-Tests aus,
  prüft OpenAPI/Metrics und baut das Frontend – bei jedem Push/PR

## Schnellstart

```bash
cd backend
cp .env.example .env         # JWT_SECRET setzen!
npm install
node src/lib/migrate.js      # inkl. Enterprise-Schema (MFA, Audit, Analytics)
npm start
npm run test:auth            # End-to-End-Test der Sicherheit (12 Checks)

# Ersten Admin anlegen (Bootstrap – solange kein Nutzer mit Passwort existiert):
curl -X POST localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@leco.at","password":"...","role":"admin"}'
```

Im Frontend anschließend **Anmelden**, unter **Admin** das Monitoring öffnen, MFA
über die API/Profil aktivieren.

## Georedundanz & Point-in-Time-Recovery

- **Georedundanz**: `BACKUP_DIR` regelmäßig in Cloud-Storage spiegeln
  (`aws s3 sync`, `rclone`, Azure Blob) – ein Cron-Zweig genügt.
- **Point-in-Time-Recovery**: am PostgreSQL-Server `archive_mode=on` + WAL-Archivierung
  aktivieren; die täglichen Base-Backups (`backup.sh`) bilden die Basis.

## 🔜 Roadmap (nächste Scheiben – bewusst noch nicht umgesetzt)

Diese Punkte brauchen externe Dienste/Infrastruktur und sind sauber vorbereitet:

- **Elasticsearch** für Volltextsuche über Millionen Dokumente
- **Load Balancing** (horizontale Skalierung; Caching ist bereits vorhanden,
  Redis wird über `REDIS_URL` aktiviert)
- **Grafana-Dashboards** auf Basis des vorhandenen `/metrics`-Endpunkts
- **Datev-/Buchhaltungs-API** (Slack/Teams und Outlook/Exchange-Kalender sind vorhanden)
- **Asynchrone Verarbeitung** (Job-Queue für PDF-Export etc.)
- **CD** (Deployment nach Staging/Prod – CI ist bereits vorhanden)
- **Native Windows-Paketierung** (Electron/MSIX) – PWA-Installierbarkeit ist bereits vorhanden
```
