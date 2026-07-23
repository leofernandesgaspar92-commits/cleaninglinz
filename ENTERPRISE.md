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

### 1b. Sicherheits-Härtung (ISO-27001-Richtung)
- **HTTP-Sicherheits-Header** (`lib/hardening.js`): `X-Content-Type-Options`,
  `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS;
  `X-Powered-By` entfernt
- **Rate-Limiting** (Brute-Force-Schutz): 30 Anfragen/Min auf `/api/auth`,
  600/Min generell; `429` + `Retry-After` bei Überschreitung
- **Readiness-Probe** `GET /api/ready` (prüft DB) neben `GET /api/health`
  (Liveness) – für Kubernetes/Load-Balancer
- Verifiziert: Header gesetzt, Readiness `db:ok`, Rate-Limit greift (30 → 429)

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

### 12. DATEV-Export (Buchhaltung)
- `lib/datev.js` + `routes/datev.js`: `GET /api/datev/buchungsstapel.csv` erzeugt
  einen **DATEV-Buchungsstapel im EXTF-Format** (Kernfelder) aus den aktiven
  Verträgen (Monatsumsätze): EXTF-Kopfzeile, Spaltenüberschriften, Buchungssätze
  (Umsatz, S/H, Konto/Gegenkonto, Belegdatum, Buchungstext), Windows-1252, CRLF
- Konfiguration via Umgebung: `DATEV_BERATER`, `DATEV_MANDANT`,
  `DATEV_KONTO_ERLOES` (Std. 8400), `DATEV_GEGENKONTO` (Std. 10000, SKR03)
- Frontend: „⬇ DATEV-Export" im Admin-Dashboard
- Verifiziert: gültige EXTF-Struktur (Format 700/v13), Buchungszeilen korrekt
  formatiert. Import in DATEV nach Konfiguration von Berater/Mandant/Konten

### 11. Globale Volltextsuche
- `routes/search.js`: `GET /api/search?q=` durchsucht Kunden, Unternehmen und
  Verträge per **PostgreSQL-FTS** (deutsche `tsvector`-Indizes) + Teilwort-Fallback,
  relevanzsortiert, gecacht
- In die **Command Palette (Strg+K)** integriert – global suchen und direkt zum
  Treffer springen
- ES-Upgradepfad: bei Millionen Dokumenten auf Elasticsearch spiegeln, Route bleibt
- Verifiziert: Treffer über alle Entitäten inkl. Teilwort (Donau, Ars, Stiege, Urfahr)

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

### 13. Load-Balancing & Production-Deployment
- **nginx als Reverse Proxy + Load Balancer** (`deploy/nginx.conf`): verteilt `/api`
  per `least_conn` auf mehrere Backend-Instanzen (127.0.0.1:4000/4001/4002),
  liefert das gebaute Frontend (`dist`) statisch aus (SPA-Fallback), proxyt
  `/agi` (AGI-Team) und `/metrics`; gzip, Asset-Caching (1 Jahr, immutable),
  Sicherheits-Header, nginx-seitiges Rate-Limit (`limit_req` api 20r/s, auth 1r/s
  – Defense in Depth), `/healthz` + `/readyz` für den LB, HTTPS-Vorlage kommentiert
- **Container-Image** (`backend/Dockerfile`): `node:20-alpine`, `npm ci --omit=dev`,
  eigener HEALTHCHECK auf `/api/health`
- **Ein-Kommando-Deployment** (`deploy/docker-compose.yml`): PostgreSQL + einmaliger
  `migrate`-Service + skalierbare Backend-Replicas + Redis + nginx. Horizontal
  skalieren mit `docker compose -f deploy/docker-compose.yml up -d --build --scale backend=3`;
  `deploy/nginx-docker.conf` nutzt Dockers internes DNS (`server backend:4000`),
  das die Last automatisch über alle Replicas verteilt
- Verifiziert: nginx-Konfigurationen strukturell geprüft (Klammern balanciert,
  Kern-Direktiven vorhanden), docker-compose als gültiges YAML geparst

### 14. Native Windows-Desktop-App (Electron / MSIX)
- **Echte Windows-App** unter `desktop/` (Electron): Doppelklick startet Leco –
  kein Terminal, keine Node-Installation beim Endnutzer. Der Hauptprozess
  (`main.js`) startet das Backend als Kindprozess (Port 4137, `SERVE_FRONTEND=1`),
  wartet auf `/api/health` und öffnet die Oberfläche im nativen Fenster
- Weil das **Backend das gebaute Frontend selbst ausliefert**
  (`SERVE_FRONTEND=1` → `express.static` + SPA-Fallback in `server.js`),
  funktioniert der relative API-Pfad `/api` ohne CORS/Proxy – **dieselbe
  Codebasis wie im Web**
- Sicherheit nach Electron-Best-Practice: `contextIsolation`, `sandbox`,
  kein `nodeIntegration`, schmale `preload.cjs`-Brücke, Single-Instance-Lock,
  externe Links im Standardbrowser; natives Menü mit Tastenkürzeln (Strg+R,
  F12, Zoom, Vollbild)
- **Paketierung** via electron-builder (`package.json`): NSIS-Installer (.exe,
  deutsch, Desktop-/Startmenü-Verknüpfung), **Portable-.exe** und **MSIX/appx**
  (Microsoft Store / Intune). `scripts/prepack.mjs` baut vorher das Frontend und
  installiert die Backend-Prod-Abhängigkeiten; Backend+Frontend werden als
  `extraResources` gebündelt
- Marken-Icon (`build/icon.png`, 512×512) abhängigkeitsfrei per `make-icon.mjs`
  erzeugt; electron-builder leitet daraus `.ico` und MSIX-Kacheln ab
- Verifiziert: `main.js`/`preload.cjs`/`prepack.mjs` syntaxgeprüft, `package.json`
  valides JSON, `server.js` (mit Static-Serving) syntaxgeprüft, Icon als gültiges
  512×512-PNG erzeugt

### 15. Selbstgenügsame, gehärtete Außengrenze (autonome Agenten-Entscheidung)
- **Vom AGI-Team entschieden & umgesetzt**: Die Analyse (5 Perspektiven) priorisierte
  die externe CDN-Abhängigkeit als wichtigste Schwachstelle. Umgesetzt:
  - **Leaflet-CSS lokal gebündelt** (`import 'leaflet/dist/leaflet.css'`) statt vom
    unpkg-CDN → **offline-tauglich** (wichtig für die Electron-Desktop-App),
    **CSP-konform** und ohne Dritt-Request (DSGVO/Angriffsfläche). Verifiziert:
    Build enthält keine CDN-Referenz mehr, Karte rendert offline korrekt
  - **Graceful Offline-Fallback der Karte**: fallen die OSM-Kacheln aus, erscheint
    ein dezenter Hinweis, während Marker & Standorte sichtbar bleiben (`tileerror`)
  - **CORS-Allowlist** statt „alle Origins erlauben": Same-Origin (Desktop, statisch
    ausgeliefertes Frontend) und Tools ohne Origin bleiben erlaubt, Dev-Ports
    voreingestellt, weitere über `CORS_ORIGINS`. Fremde Origins erhalten keinen
    ACAO-Header (Browser blockt, kein Log-Rauschen). Verifiziert: Dev erlaubt,
    `evil.com` blockiert, Health/curl unverändert
- Die Entscheidung + Erkenntnis wurde in die **Knowledge Base** des AGI-Teams
  geschrieben (fließt in die nächste Verbesserungsrunde ein)

### 16. Regressionsnetz für die Geschäftslogik (autonome Agenten-Entscheidung)
- **Vom AGI-Team entschieden & umgesetzt**: Die QA-Perspektive priorisierte die
  fehlende Testabdeckung (nur Auth war getestet, 17 Routen ohne Netz).
- **`scripts/test-api.mjs`** (21 Checks, `npm run test:api`): End-to-End gegen den
  laufenden Server – CRUD für **Unternehmen/Kunden/Verträge/Mitarbeiter**,
  **Dashboard-Kennzahlen** (`/map`, `/finance`, `/expiring-contracts`), der
  **Übernahme-Workflow** (legt Akquise + 6 Schritte an) sowie
  **Validierung/Fehlerpfade** (400 bei leeren Feldern, 404 bei unbekannter ID).
  Der Test **räumt seine Testdaten selbst wieder auf** (FK-Reihenfolge).
- **In die CI verdrahtet** (`.github/workflows/ci.yml`): läuft bei jedem Push/PR
  direkt nach den Auth-Tests. Verifiziert: **21/21 grün**.

### 17. Zugriffsschutz der Geschäftsdaten – Login-Gate (autonome Agenten-Entscheidung)
- **Vom AGI-Team entschieden & umgesetzt** (durch `test-api.mjs` belegt): Business-CRUD,
  Dashboard, Übernahme etc. waren **ohne Login** erreichbar (Kunden-PII, Umsätze,
  anonyme Schreibzugriffe) — das größte offene Sicherheits-/DSGVO-Risiko.
- **Backend**: `requireAuth` (JWT-Bearer) auf allen Geschäftsrouten (`companies`,
  `customers`, `contracts`, `employees`, `jobs`, `dashboard`, `acquisitions`,
  `search`, `queue`, `contract-ai`, `datev`, `admin`). **Öffentlich bleiben bewusst
  nur**: Anmeldung (`auth`/`sso`), anonyme Analytics (`/track` für die Heatmap) und
  die **Outlook-`.ics`-Feeds** (`calendar`, werden ohne Bearer abonniert).
- **Frontend**: `lib/api.js` sendet den Bearer-Token und fängt `401` ab (Token
  verwerfen → Anmeldung). `App.jsx` rendert ohne gültigen Login **nur die
  Anmeldeseite** – geschützte Seiten werden gar nicht erst erzeugt.
- **Tests**: `test-api.mjs` meldet sich jetzt an und prüft zusätzlich, dass die
  Geschäfts-API ohne Token `401` liefert. Verifiziert: **23/23 grün**,
  `/companies` & `/dashboard` ohne Token = 401, `.ics` weiterhin 200, eingeloggt
  volle App (Screenshots geprüft). CI setzt vor den API-Tests die DB frisch auf.

### 18. AGI-Schema unabhängig von der public-Extension (autonome Agenten-Entscheidung)
- **Architect-Befund (mehrfach reproduziert)**: Die `agi.*`-Tabellen nutzten
  `uuid_generate_v4()` aus der **uuid-ossp-Extension im `public`-Schema**. Ein
  Reset der App-DB (`DROP SCHEMA public CASCADE`) riss die Spalten-Defaults mit –
  danach schlugen AGI-Inserts mit „null id" fehl (stiller Ausfall des Agenten-Logs).
- **Fix**: Umstellung des AGI-Schemas auf das **eingebaute `gen_random_uuid()`**
  (PostgreSQL 13+) – keine Extension-Abhängigkeit mehr, keine Kopplung ans
  `public`-Schema. Deployment-/Migrations-robust.
- Verifiziert: AGI-Schema neu aufgebaut, dann `backend --reset --seed` (droppt
  `public` + uuid-ossp), **danach AGI-Insert erfolgreich** (ID automatisch erzeugt) –
  genau die Sequenz, die vorher fehlschlug.

### 19. Proaktive Vertragsauslauf-Warnung – Umsatzsicherung (autonome Agenten-Entscheidung)
- **Analyst-Chance**: auslaufende Verträge sind das größte planbare Umsatzrisiko.
  Umgesetzt auf der vorhandenen Benachrichtigungs-Infrastruktur (`notify.js`).
- **`lib/contractWatch.js`**: findet Verträge, die in ≤ N Tagen auslaufen (Standard 30),
  und warnt **je Vertrag genau einmal** (In-App-Feed **+ Slack/Teams**). Schweregrad
  eskaliert automatisch (**≤ 14 Tage → `error`/rot**, sonst `warning`/orange).
  **Dedupliziert** pro Vertrag + Enddatum, damit wiederholte Läufe nicht spammen.
- **Endpunkte** (Admin): `GET /api/admin/contract-watch/preview?days=` (Vorschau
  ohne Benachrichtigung) und `POST /api/admin/contract-watch` (führt aus, meldet
  `checked/alerted/skipped`).
- **Täglicher Cron** `src/contract-watch-cron.js` (08:00, `npm run watch:contracts`,
  Fenster via `CONTRACT_WATCH_DAYS`) + **Button „⏰ Vertrags-Watch"** im Admin-Dashboard.
- Verifiziert: **26/26 API-Checks** (warnt bei Auslauf, dedupliziert im 2. Lauf);
  Live-Demo erzeugt zwei Warnungen im Feed (9 Tage → error, 25 Tage → warning).

### 20. RBAC-Feinschliff – Least-Privilege für Stammdaten (autonome Agenten-Entscheidung)
- **Security-Befund**: Nach dem Login durfte **jede** Rolle alle Geschäftsdaten
  nicht nur lesen, sondern auch anlegen/ändern/löschen.
- **Methodenbasiertes RBAC** (`server.js`): **Lesen** (GET) für jede angemeldete
  Rolle, **Schreiben** (POST/PATCH/PUT) **ab „manager"**, **Löschen** (DELETE)
  **nur „admin"** – angewandt auf `companies`, `customers`, `contracts`,
  `employees`, `jobs`, `acquisitions`. **Stammdaten-Import** ab „manager".
  (`dashboard` ist ohnehin nur lesend; `admin` gatet intern per `requireRole('admin')`.)
- Verifiziert: **30/30 API-Checks** – `mitarbeiter` liest `200`, Schreiben/Löschen
  `403`; admin/manager unverändert.

### 21. Rollenbewusste UI – Frontend-Abschluss zum RBAC (autonome Agenten-Entscheidung)
- **UX-Befund**: Seit dem RBAC liefert das Backend `403`, aber die Oberfläche zeigte
  weiter Schreib-Controls → rohe Fehlermeldungen.
- **Rollenerkennung** (`lib/auth.js`): `getRole()` liest die Rolle aus dem JWT
  (`getRole`/`canWrite`/`canDelete` – reine UI-Steuerung, Autorität bleibt der Server).
- **Freundliche 403-Meldung**: `lib/api.js` und `lib/auth.js` feuern bei `403` ein
  `leco:forbidden`-Event; `App.jsx` zeigt dafür einen Toast „Keine Berechtigung"
  (statt eines rohen Fehlers) – **global** für jede blockierte Aktion.
- **Rollenabhängige Navigation/Controls**: „Import" nur ab „manager"; im
  Unternehmens-Tracker sind **Drag & Drop** und „⚡ Neue Übernahme" nur ab „manager"
  aktiv, sonst erscheint ein **Nur-Lese-Hinweis**.
- Verifiziert: Frontend-Build grün; als „mitarbeiter" live geprüft – kein Import in
  der Navigation, kein „Neue Übernahme"-Button, Nur-Lese-Hinweis, Karten nicht ziehbar.

### 22. Serverseitige Passwort-Richtlinie (autonome Agenten-Entscheidung)
- **Security-Befund**: `/auth/register` akzeptierte beliebig schwache Passwörter.
- **`validatePassword()`** (`lib/auth.js`): erzwingt **mind. 10 Zeichen**,
  **Buchstaben + Ziffern**, keine **gebräuchlichen** Passwörter und keinen
  **E-Mail-Namensstamm** im Passwort. In der Register-Route durchgesetzt
  (`400` mit konkreter Begründung). Login-Seite nennt die Anforderungen.
- Verifiziert: **16/16 Auth-Checks** inkl. 4 neuer Richtlinien-Fälle (zu kurz /
  ohne Ziffer / zu gebräuchlich / enthält E-Mail-Name); **30/30 API-Checks**.
  Beide Test-Suites lesen jetzt `API_BASE` (einheitlich konfigurierbar).

### 23. Team-Auslastung – operative Analyst-Chance (autonome Agenten-Entscheidung)
- **Analyst-Perspektive** (Wechsel von Security zu Business-Value): Über-/Unter-
  auslastung des Reinigungsteams sichtbar machen und Arbeit besser verteilen.
- **`GET /api/dashboard/workload`**: zählt **offene/erledigte Jobs je aktivem
  Mitarbeiter**, meldet **unbesetzte offene Jobs** und Kennzahlen (aktive MA,
  Ø offen/Person, Anzahl unterausgelastet).
- **Frontend**: Panel **„📊 Team-Auslastung"** auf der Mitarbeiter-Seite –
  Karten je Person (offen/erledigt), Hervorhebung **Unterausgelasteter**
  („frei für neue Aufträge"), Badges für „unbesetzt"/„unterausgelastet".
- Verifiziert: **31/31 API-Checks** (neuer Workload-Check); Live-Demo mit 3 aktiven
  Mitarbeitern, davon 1 unterausgelastet.

### 24. Übernahme-ROI- & Synergie-Rechner – Kern-Business (autonome Agenten-Entscheidung)
- **Analyst-Perspektive, zurück zum Kern (M&A)**: Welche Ziel-Firma lohnt sich am
  meisten? `GET /api/dashboard/merger-roi` bewertet jedes Nicht-eigene Ziel:
  **EBITDA-Multiple, ROI, Amortisationsdauer**. Wo **kein Kaufpreis** hinterlegt
  ist, wird er aus einem **EBITDA-Multiple geschätzt** (Standard 4×). **Synergie**
  = Anteil des Zielumsatzes als EBITDA-Uplift nach Integration (Standard 5%);
  Sortierung nach **ROI inkl. Synergien**. Konfigurierbar via
  `MERGER_ASK_MULTIPLE` / `MERGER_SYNERGY_RATE`.
- **Frontend**: Panel **„💰 Übernahme-ROI & Synergien"** auf der Unternehmen-Seite
  (Ranking-Tabelle, Top-Ziel mit 🏆, geschätzte Preise mit „*", Annahmen sichtbar).
- Verifiziert: **32/32 API-Checks** (Sortierung geprüft); Seed-Ranking:
  Stahl & Glanz **34,4 %** (Top, 2,9 J.), Urfahr 29,1 %, Donau Sauber 26,8 %.

### 25. MRR-Entwicklung – Umsatz-Zeitreihe (autonome Agenten-Entscheidung)
- **Analyst-Perspektive**: den monatlich wiederkehrenden Umsatz (MRR) über die Zeit
  sichtbar machen. `GET /api/dashboard/mrr-trend?months=N` berechnet die MRR je
  Monat **direkt aus den Vertragslaufzeiten** (`start_date`/`end_date`), plus
  `current_mrr` und **YoY-Wachstum**.
- **Frontend**: **abhängigkeitsfreies SVG-Balkendiagramm** auf dem Dashboard
  (Theme-konform, letzter Monat hervorgehoben, YoY-Badge, Tooltips je Monat).
- Verifiziert: **33/33 API-Checks**; Seed zeigt den Abfall **14.700 € → 9.800 €**
  (−33,3 % YoY), weil Verträge auslaufen – untermauert die Umsatzsicherung (Nr. 19).

### 26. MFA-Selbstverwaltung im Frontend (autonome Agenten-Entscheidung)
- **Lücke**: Das RFC-6238-MFA-Backend war vollständig, aber nur **per curl** nutzbar.
- **Seite `/sicherheit`** (`Security.jsx`): **Einrichten** (Base32-Schlüssel + `otpauth`-
  Link zur manuellen Eingabe in Google/Microsoft Authenticator, 1Password …),
  **Aktivieren** (6-stelliger Code) und **Deaktivieren**. Erreichbar über den
  Sidebar-Link „🔐 MFA einrichten / Sicherheit"; Status-Badge (aktiv/inaktiv).
- Verifiziert: kompletter **UI-Round-Trip** (Setup → Code → aktiv); danach Login
  ohne Code = **206** (MFA verlangt), `me.mfa_enabled=true`. Damit ist das schon
  vorhandene, gegen RFC-Testvektoren geprüfte TOTP-Backend endlich bedienbar.

### 27. MFA-Pflicht für Admins – konfigurierbare Richtlinie (autonome Agenten-Entscheidung)
- **Jetzt sicher möglich**, da die MFA-Selbstverwaltung (Nr. 26) existiert.
- **`REQUIRE_ADMIN_MFA`** (Env, Standard aus): schaltet die Richtlinie scharf.
  Aktiv sind **privilegierte Admin-Aktionen (Schreibzugriffe) nur mit aktiver MFA**
  – sonst `403 { code: 'admin_mfa_required' }`. **Lesen bleibt erlaubt**, damit der
  betroffene Admin die Warnung sieht und MFA über `/sicherheit` aktivieren kann
  (kein Lockout).
- **Frontend**: Warnbanner im Admin-Dashboard („MFA nicht aktiv … je nach Richtlinie
  gesperrt") mit Button „Jetzt einrichten" → `/sicherheit`.
- Verifiziert: Richtlinie **AN 19/19** (Admin ohne MFA → 403, mit MFA erlaubt,
  Lesen ok), **AUS 16/16** (Checks übersprungen), **API 33/33** unverändert.
  Prüfbar mit `REQUIRE_ADMIN_MFA=1 npm run test:auth` gegen einen entsprechend
  gestarteten Server.

### 28. CSV-Report-Exports + Fix authentifizierter Downloads (autonome Agenten-Entscheidung)
- **Business-Wunsch**: Analytics nach Excel/Board. **Dabei latenter Bug entdeckt**:
  seit dem Login-Gate sind Datei-Downloads geschützt, aber ein `<a href>` sendet
  **keinen** Bearer-Token → der DATEV-Export lieferte `401`.
- **CSV-Exporte**: `GET /api/dashboard/merger-roi.csv` und `/mrr-trend.csv`
  (gemeinsame Compute-Funktionen mit den JSON-Endpunkten; **Excel-tauglich**:
  UTF-8-BOM, CRLF, Semikolon-getrennt).
- **`downloadAuthed()`** (`lib/api.js`): lädt Dateien **per fetch mit Bearer-Token**
  und speichert sie als Blob – korrekt auch bei gated Routen. Buttons „⬇ CSV" an
  ROI-Panel (Unternehmen) und MRR-Panel (Dashboard); der **DATEV-Button** nutzt
  jetzt ebenfalls `downloadAuthed` (**401-Bug behoben**).
- Verifiziert: **36/36 API-Checks** (inkl. „CSV ohne Login → 401"), DATEV mit Token
  → 200, und der **Browser-Download** wurde per Playwright real ausgelöst
  (`uebernahme-roi.csv`, Header + Zeilen).

### 29. Audit-Log-CSV-Export für Compliance (autonome Agenten-Entscheidung)
- **Compliance/DSGVO**: Der Audit-Trail war im Dashboard sichtbar, aber **nicht
  exportierbar**. `GET /api/admin/audit.csv` (Admin-only, optional `?action=`/`?limit=`)
  exportiert das Audit-Log (Zeitpunkt, Akteur, Aktion, Entität, ID, IP, Detail).
- **Refactoring**: CSV-Helfer nach **`lib/csv.js`** ausgelagert und in `dashboard.js`
  + `admin.js` wiederverwendet (DRY).
- **Frontend**: Button „⬇ Audit-Log (CSV)" am Login-Protokoll (via `downloadAuthed`).
- Verifiziert: **18/18 Auth-Checks** (CSV-Kopfzeile + `text/csv`, ohne Token → 401);
  **36/36 API-Checks** nach dem Refactoring unverändert; CSV-Inhalt korrekt escaped
  (JSON-Detail, BOM).

### 30. Due-Diligence-Reife im ROI-Ranking (autonome Agenten-Entscheidung)
- **M&A-Kern**: Das ROI-Ranking (Nr. 24) zeigte nur Rendite, **nicht das Prüf-Risiko**.
  Ein Ziel mit Top-ROI, aber offenen DD-Risiken ist riskanter als die Zahl suggeriert.
- **`computeMergerRoi()`** aggregiert nun je Ziel die **`due_diligence_items`**
  (ok/risiko/offen, **Reife-Prozent**, `dd_risk`-Flagge bei bekanntem Risiko).
- **Frontend**: ROI-Panel um Spalte **„DD-Reife"** erweitert (Prozent + Badge
  „⚠ n Risiko" / „n offen" / „bereit"). **CSV-Export** um DD-Spalten ergänzt.
- Zeigt **Rendite vs. Reife/Risiko**: höchste ROI (Stahl & Glanz 34,4 %) noch
  ungeprüft, Donau Sauber 26,8 % mit **43 % Reife und 1 bekanntem Risiko**.
- Verifiziert: **37/37 API-Checks**; live Donau Sauber 3/7 ok, 1 Risiko, 3 offen.

### 31. Übernahme-Readiness-Score – Capstone der M&A-Analytik (autonome Agenten-Entscheidung)
- **Synthese** aus ROI (Nr. 24), DD-Reife (Nr. 30) und **Pipeline-Status** zu **einer
  Empfehlung** „welchen Deal zuerst?". Score = `0.5·ROI + 0.3·DD + 0.2·Pipeline-Stufe`
  (0–100). DD ohne Prüfung zählt neutral (50), jedes bekannte Risiko senkt (−15).
- Ranking jetzt **nach Score**; genau **eine Empfehlung** markiert (`recommended`);
  `score_parts` als Breakdown (Tooltip); CSV um **Rang/Score/Empfehlung** ergänzt.
- **Ergebnis kippt sinnvoll**: die reine ROI-Spitze Stahl & Glanz (ROI-Teil 98, aber
  Stufe „Ziel" = 20) fällt hinter **Urfahr Reinigung** (Score 71, „Verhandlung")
  zurück; Donau Sauber 56 wegen DD-Risiko. Genau die „Rendite × Reife × Nähe"-Abwägung.
- Verifiziert: **37/37 API-Checks** (Score-Sortierung + genau 1 Empfehlung).

### 32. Kunden-Umsatzkonzentration (Klumpenrisiko) + Bugfix Hintergrund-Export
- **Analyst/Risiko**: Hängt der Umsatz an einem Großkunden? `GET /api/dashboard/
  customer-concentration` liefert je Kunde den **vertraglichen Monatswert + Anteil**,
  den **Top-Kunden-Anteil**, den **Herfindahl-Index (HHI)** und eine **Risikostufe**
  (hoch/mittel/niedrig); dazu CSV-Export.
- **Frontend**: Panel „📊 Umsatzkonzentration" auf der Kunden-Seite (Balken je Kunde,
  Risiko-Badge, CSV). Seed: **Risiko hoch** – Ars Electronica Center **66,7 %**, HHI 4871.
- **Bugfix**: Der Hintergrund-Export rief `/api/queue` per `fetch` **ohne** Bearer-Token
  (seit dem Login-Gate → 401); auf `api.post` umgestellt (authentifiziert).
- Verifiziert: **38/38 API-Checks**; Queue-Export mit Token → 202, ohne → 401.

### 33. Auth-Konsistenz-Audit des Frontends (3. Login-Gate-Bug behoben)
- Nach zwei 401-Bugs (DATEV, Queue-Export) **systematisch alle direkten API-Zugriffe**
  im Frontend geprüft (`fetch`/`href`/`location`). **Genau ein weiterer echter Bug**:
  die **Command-Palette-Volltextsuche** rief `/api/search` per `fetch` ohne Bearer-Token
  (seit dem Login-Gate → 401) → auf `api.get` umgestellt.
- Alle übrigen ungeschützten Zugriffe sind **korrekt public**: `calendar` `.ics`-Feeds
  (Outlook), SSO-Login-Redirect, `analytics/track`, `sso/status` (vor dem Login).
- Verifiziert: Suche ohne Token → 401, mit Token liefert „Donau Sauber" (Firma),
  „Wohnanlage Donaupark" (Kunde), „Stiegenhausreinigung" (Vertrag); Command Palette
  zeigt die Treffer live (Screenshot).

### 34. Einsatzplanung – operative Job-Verwaltung (autonome Agenten-Entscheidung)
- **Größte operative Lücke**: Jobs existierten in den Daten (Karte, Team-Auslastung),
  aber es fehlte eine Seite zum **Zuweisen/Steuern**.
- **`GET /api/dashboard/jobs`**: angereicherte Job-Liste (Kunden- + Mitarbeitername,
  Termin, Status).
- **Neue Seite `/einsaetze`**: Tabelle Termin/Kunde/Auftrag mit **Mitarbeiter-** und
  **Status-Dropdown** (speichert per `PATCH /jobs/:id`), „unbesetzt"-Zähler.
  **RBAC**: Zuweisung/Statusänderung ab „manager", sonst Nur-Lese-Ansicht.
  Nav-Eintrag „🧹 Einsätze".
- Verifiziert: **39/39 API-Checks**; Umbuchung persistiert end-to-end
  (Elena Popescu → Marko Novak, Status „unterwegs").

### 35. Geschäftsbericht (Executive Summary, druckbar) + CSS-Variablen-Fix
- **Capstone-Deliverable**: Seite `/bericht` („📄 Bericht") bündelt die Kern-Analytik
  auf **einer board-tauglichen Seite** — Kennzahlen (Unternehmen, Umsatz, EBITDA,
  MRR inkl. YoY), **Übernahme-Empfehlung** (Score/ROI/DD), **Kundenkonzentration**
  (Risiko) und **Team-Auslastung**. Reine Frontend-Aggregation vorhandener Endpunkte.
- **Drucken/PDF**: Button `window.print()` + `@media print` (Sidebar/Buttons aus,
  weißes Papier, druck-eigener Titel + „vertraulich"-Fußzeile). Per Browser als PDF
  speicherbar.
- **Qualitäts-Fix**: 5 Stellen nutzten die **undefinierte** CSS-Variable
  `var(--warning)` statt `var(--warn)` → Warn-Farben (Rahmen/Balken) rendern jetzt
  korrekt orange.
- Verifiziert: Bildschirm- **und** Druckansicht per Playwright (`media=print`).

### 36. AGI-Reaktor an echte Leco-Betriebssignale angebunden (Kern der Vision)
- **Bisher** reagierte die autonome Schleife nur auf simulierte Events. Jetzt speist
  ein **Signal-Scanner** (`agents/src/signals.js`) reale Betriebsdaten aus der
  (gemeinsamen) Leco-DB in den Event Bus ein:
  **`errors_spike`** (≥ 5 Fehler/24 h), **`contract_expiring`** (≤ 30 Tage),
  **`revenue_concentration`** (größter Kunde > 40 %), **`jobs_unassigned`**.
  **Dedup** über `SIGNAL_DEDUP_HOURS` (Standard 12 h) verhindert Spam bei
  dauerhaften Zuständen.
- **Reaktor-Trigger** (`reactor.js`) für die neuen Typen: developer/qa, finance/
  operations, analyst, operations. **`loop.js`** ruft `scanSignals()` **vor**
  `reactToEvents()` und protokolliert die Signale in der Zyklus-Erkenntnis.
- Verifiziert: Seed → **`revenue_concentration`** (Ars Electronica Center 66,7 %)
  emittiert, **analyst reagiert** (`reaktion:revenue_concentration`), Dedup greift;
  volle Loop-Iteration meldet „1 Betriebssignal + 1 Event-Reaktion" (AGI-Dashboard).

### 37. Funktionstests der AGI-Signal-Pipeline + CI-Anbindung
- Das AGI-System wurde in der CI bisher **nur syntaktisch** geprüft. Neu:
  **`agents/scripts/test-signals.mjs`** (`npm run test:signals`) stellt vier
  auslösende Zustände her (5 Fehler/24 h, auslaufender Vertrag, Klumpenrisiko,
  unbesetzter Job) und prüft, dass `scanSignals()` **alle vier emittiert**, der
  **Dedup** beim 2. Scan greift, der **Reaktor** jedes Signal den passenden
  Agenten zuweist (Klumpenrisiko → analyst) und alle Events als bearbeitet
  markiert werden. **12/12 grün**.
- **CI-Erweiterung**: Der Agents-Job „AGI-Team (Syntax + Signal-Tests)" bekommt
  einen **PostgreSQL-Service**, migriert **Leco (Schema+Seed) + AGI-Schema** und
  führt den Signal-Test aus – bei jedem Push/PR.

### 7. Observability, API-Dokumentation & CI/CD
- **Prometheus-Metriken** unter `GET /metrics`: Betrieb (Request-Zähler,
  Latenz-Histogramm, RSS, Uptime) **und Geschäft** (`leco_revenue_eur`,
  `leco_ebitda_eur`, `leco_mrr_eur`, `leco_active_contracts`,
  `leco_companies_pipeline`, `leco_jobs{status}`) – gecacht
- **Grafana + Prometheus-Stack** unter `monitoring/` (Docker-Compose mit
  auto-provisioniertem Dashboard „Leco – Betrieb & Geschäft", 9 Panels)
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

- **Elasticsearch** als Skalierung der bereits vorhandenen Volltextsuche
  (für Millionen Dokumente; PostgreSQL-FTS ist implementiert)
- **Live-Datev-API-Anbindung** (der DATEV-EXTF-Export ist vorhanden)
- **Live-CD-Pipeline** (automatischer Push nach Staging/Prod – das
  Deployment-Setup mit nginx-Load-Balancing/Docker-Compose ist bereits vorhanden,
  CI läuft)
- **Code-Signing / Store-Veröffentlichung** der Windows-App (die Electron/MSIX-
  Paketierung ist vorhanden; für den Store fehlt nur ein Signaturzertifikat)
