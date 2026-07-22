# Leco AGI Team – Multi-Agenten-System

Ein Team aus 10 spezialisierten KI-Agenten, das die Leco-Software und das
Reinigungs-Imperium in Linz kontinuierlich analysiert, verbessert und steuert –
mit **Human-in-the-Loop** an allen kritischen Punkten.

> **Sicherheitsprinzip:** Agenten *schlagen vor und bereiten vor*. Nichts
> Unumkehrbares (Code-Release, Firmen-Übernahme, Budget, Strategie) wird ohne
> deine ausdrückliche Freigabe ausgeführt. Genau die Kontrollpunkte deiner Vision.

## Läuft sofort – mit oder ohne KI

- **Ohne `ANTHROPIC_API_KEY`** → **Simulationsmodus**: die Agenten führen ihre
  echten Werkzeuge aus (lesen echte Leco-Daten/Code, schreiben Knowledge, legen
  Freigaben an) – nur die Textanalyse ist deterministisch statt LLM-generiert.
- **Mit `ANTHROPIC_API_KEY`** → **Live-Modus**: jeder Agent nutzt `claude-opus-4-8`
  mit adaptivem Thinking und echtem Tool-Use als kognitiven Kern.

## Die 10 Agenten

| Agent | Rolle | Freigabe nötig für |
|---|---|---|
| `ceo` | CEO / Orchestrator | Strategie |
| `architect` | Chief Software Architect | – |
| `developer` | Senior Developer | Code-Release |
| `qa` | QA & Testing | – |
| `analyst` | Business Intelligence / Markt Linz | – |
| `ma` | Merger & Acquisition Strategist | Übernahme |
| `finance` | Financial Controller | Budget |
| `operations` | Operations & Workflow Manager | – |
| `ux` | UX / Product Designer | – |
| `security` | Security & Compliance (DSGVO) | – |

## Die vier Kommunikationskanäle (Postgres-gestützt)

1. **Task Board** (`agi.task_board`) – zentrale Aufgabenliste
2. **Message Queue** (`agi.agent_messages`) – Nachrichten & Handoffs
3. **Knowledge Base** (`agi.knowledge_base`) – gemeinsames Lernen
4. **Event Bus** (`agi.agent_events`) – Ereignisse lösen Workflows aus

Plus `agi.approvals` (Human-in-the-Loop), `agi.agent_runs` (Audit + Reflexion)
und `agi.loop_cycles` (Zyklus-Protokoll der Verbesserungsschleife).

## Wirkungs-Metriken

`GET /api/stats` liefert die Wirkung der Schleife über die Zeit: Anzahl Zyklen,
ausgeführte vs. zurückgerollte Änderungen, offene/auto-genehmigte Freigaben,
Erkenntnisse und Agenten-Läufe – plus eine Zeitreihe je Zyklus. Im **KI-Team-Tab**
des Leco-Frontends erscheint daraus ein Kennzahlen-Panel mit Balkendiagramm
(ausgeführt grün / zurückgerollt rot je Zyklus).

## Orchestrierung

- **Sequenziell** – Agenten nacheinander, jeder erhält das Vorergebnis
- **Parallel** – mehrere Agenten gleichzeitig
- **Handoff** – ein Agent gibt per `send_message(kind:"handoff")` dynamisch weiter

## Die fünf autonomen Workflows

| Workflow | Zeitplan | Ablauf |
|---|---|---|
| `daily_standup` | täglich 06:00 | Analyst+Finance+Developer → CEO priorisiert |
| `continuous_improvement` | alle 30 Min | Architect → Developer → QA → Security |
| `merger_pipeline` | Mo 09:00 | Analyst → M&A → Finance → Operations |
| `bug_bounty` | alle 5 Min | reagiert auf `bug_detected`-Events → Developer → Security |
| `market_intelligence` | Mo 08:00 | Analyst+Finance → CEO-Bericht |

## Autonome Verbesserungs-Schleife ⭐

Der Kern des Dauerbetriebs: die Agenten überlegen **ständig**, was besser geht —
*analysieren → neue Lösungen finden → verbessern → ausführen → lernen → wiederholen.*

Jede Iteration (`src/loop.js`):
1. **ANALYZE** – Architect, QA, Security, UX, Analyst prüfen parallel Code & Daten
2. **IDEATE** – der CEO wählt die wirkungsvollste Verbesserung und legt eine Aufgabe an
3. **IMPROVE** – der Developer erzeugt einen konkreten Code-Vorschlag (Freigabe nötig)
4. **EXECUTE** – freigegebene Änderungen werden geschrieben, **verifiziert** und bei
   Fehler **automatisch zurückgerollt** (Selbstkorrektur; Backup unter `agents/.applied-backups/`)
5. **LEARN** – die Erkenntnis landet in der Knowledge Base und fließt in die nächste Runde

```bash
node src/cli.js loop 3          # 3 Iterationen
node src/cli.js loop 0 60       # unendlich, 60 s Abstand
npm run loop                    # Dauerbetrieb (unendlich, 60 s)
```

Der Ablauf: der Developer schlägt vor → du genehmigst im Dashboard →
die **nächste Iteration führt die Änderung aus** (schreibt die Datei). So bewirkt
die Schleife echte Verbesserungen, ohne die menschliche Kontrolle zu umgehen.
Der Scheduler fährt die Schleife zusätzlich alle 10 Minuten.

### Event-reaktiv (Echtzeit)

Vor jedem Zyklus – und im Scheduler alle 2 Minuten – reagiert der **Reaktor**
(`src/reactor.js`) sofort auf offene kritische Ereignisse:

| Event | Reaktion |
|---|---|
| `bug_detected` | Developer erstellt Fix-Vorschlag → Security prüft |
| `security_issue` | Security bewertet Schwere & Gegenmaßnahme |
| `new_target` | M&A bewertet & legt Kaufentscheidung vor |

```bash
node src/cli.js react            # einmal auf offene Events reagieren
```

### Sichere Auto-Freigabe (optional)

Mit `AGI_AUTOAPPROVE=true` genehmigt die Schleife **nachweislich harmlose**
Vorschläge selbst und führt sie aus – dann läuft der komplette Zyklus voll
autonom. Die Policy (`src/core/policy.js`) ist bewusst eng:

- ✅ auto-ok: nur `code_release` auf einer Allowlist (Doku/Notiz-Dateien wie
  `agents/IMPROVEMENTS.md`, `docs/**.md`, `*NOTES.md`), Volltext, < 20 KB
- 🔒 immer Mensch: echter Quellcode (`backend/`, `frontend/`, `.js`, `.sql`),
  sowie **Budget, Übernahmen, Strategie** – ausnahmslos

Standard ist `false` (jede Änderung braucht den Menschen).

### Selbstkorrektur (Verifikation + Rollback)

Nach dem Schreiben verifiziert der Executor jede Änderung (`src/core/verify.js`):
`.js` per `node --check`, `.json` per Parse. Schlägt sie fehl, wird die Datei
**automatisch zurückgerollt** (Backup zurück bzw. neue Datei gelöscht) und ein
`execute_reverted`-Event ausgelöst – worauf der Developer die Ursache analysiert
und einen korrigierten Vorschlag erstellt. Optional entscheidet ein projektweiter
Testbefehl (`AGI_VERIFY_CMD`, z.B. `npm run build --prefix frontend`) mit über
Erfolg oder Rollback.

| Event (neu) | Reaktion |
|---|---|
| `execute_reverted` | Developer analysiert Fehlerursache → korrigierter Vorschlag |

## Meta-Architektur

- **Selbstreflexion** – jeder Lauf endet mit einer `REFLEXION`, gespeichert in `agi.agent_runs`
- **Inter-Agenten-Learning** – Erkenntnisse landen in der Knowledge Base und fließen
  in spätere Läufe ein
- **Human-in-the-Loop** – Freigaben blockieren die Ausführung bis zur Entscheidung

## Schnellstart

Voraussetzung: die Leco-Datenbank läuft (siehe `../README.md`).

```bash
cd agents
cp .env.example .env          # optional ANTHROPIC_API_KEY setzen für Live-Modus
npm install
npm run migrate               # legt das agi-Schema an

# Einen Workflow einmal ausführen
node src/cli.js daily_standup

# Offene Freigaben ansehen und entscheiden
node src/cli.js approvals
node src/cli.js approve <id>
node src/cli.js reject  <id>

# 24/7-Betrieb (Scheduler mit allen Zeitplänen)
npm start

# Dashboard (Task Board, Freigaben, Knowledge, Läufe) – http://localhost:4100
npm run dashboard
```

## CLI-Übersicht

| Befehl | Zweck |
|---|---|
| `node src/cli.js list` | Workflows + Modus anzeigen |
| `node src/cli.js <workflow>` | Workflow einmal ausführen |
| `node src/cli.js status` | Task Board anzeigen |
| `node src/cli.js approvals` | offene Freigaben |
| `node src/cli.js approve\|reject <id>` | Freigabe entscheiden |
| `node src/cli.js loop [n] [sek]` | Verbesserungs-Schleife n-mal (0 = unendlich) |
| `node src/cli.js react` | einmal auf offene kritische Events reagieren |

## Architektur

```
agents/
  db/schema.sql              agi-Schema (4 Kanäle + Approvals + Run-Log)
  src/
    config/agents.js         die 10 Agenten-Definitionen
    tools/lecoTools.js       Werkzeuge (Leco-DB/Code lesen, Aktionen vorschlagen)
    core/
      comms.js               TaskBoard, MessageQueue, Knowledge, EventBus, Approvals
      llm.js                 Claude-Tool-Loop + Simulationsmodus
      agent-runner.js        ein Agenten-Lauf inkl. Reflexion & Audit
      orchestrator.js        sequenziell / parallel / handoff
    workflows/index.js       die 5 Workflows
    cli.js                   Kommandozeile
    scheduler.js             24/7-Cron-Betrieb
    server.js                Dashboard + API
```

## Bewusste Grenzen (Roadmap)

Ehrlich abgegrenzt – bewusst **nicht** enthalten: automatisches Schreiben/Deployen
von KI-Code ohne Review (per Design ausgeschlossen), Web-Scraping externer Linzer
Firmendaten, echte Bank-/Datev-Anbindung, verteilte Message-Queue (Redis/Kafka),
Vektor-Memory. Die Architektur ist darauf vorbereitet; der sichere Kern steht.
