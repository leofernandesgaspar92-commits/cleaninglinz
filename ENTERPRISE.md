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

### 6. Performance
- Zusätzliche Indizes für schnelle Abfragen bei großen Datenmengen
  (Jobs nach Kunde/Mitarbeiter, auslaufende Verträge)

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
- **Redis-Caching** + **Load Balancing** (horizontale Skalierung)
- **Prometheus + Grafana** (Server-Metriken: CPU/RAM/Antwortzeiten)
- **Datev-/Buchhaltungs-API**, **Outlook/Exchange-Kalender**, **Slack/Teams**
- **Asynchrone Verarbeitung** (Job-Queue für PDF-Export etc.)
- **CI/CD** (GitHub Actions, Staging/Prod), **Swagger/OpenAPI**-Doku
- **Native Windows-Paketierung** (Electron/MSIX) bzw. PWA-Installierbarkeit
- **KI-Vertragsanalyse** (Kündigungsfristen/Preise automatisch extrahieren) im Merger-Modul
```
