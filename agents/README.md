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

Plus `agi.approvals` (Human-in-the-Loop) und `agi.agent_runs` (Audit + Reflexion).

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
