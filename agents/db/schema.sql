-- ============================================================================
--  LECO AGI TEAM – Kommunikations- & Koordinations-Schema (PostgreSQL)
--
--  Vier Kommunikationskanäle (wie in der Vision):
--    1. Task Board       (task_board)      – zentrale Aufgabenliste (JIRA-artig)
--    2. Message Queue    (agent_messages)  – Nachrichten zwischen Agenten
--    3. Knowledge Base   (knowledge_base)  – gemeinsame Entscheidungen / Learnings
--    4. Event Bus        (agent_events)    – Ereignisse, die Aktionen auslösen
--
--  Plus: Approvals (Human-in-the-Loop) und Agent-Run-Log (Reflexion/Audit).
--  Nutzt dieselbe Postgres-Instanz wie die Leco-App (Schema: agi).
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS agi;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- 1) TASK BOARD – zentrale Aufgabenliste
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agi.task_board (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title         TEXT NOT NULL,
    description   TEXT,
    status        TEXT NOT NULL DEFAULT 'backlog'
                    CHECK (status IN ('backlog','geplant','in_arbeit','review','blockiert','erledigt','abgebrochen')),
    priority      TEXT NOT NULL DEFAULT 'normal'
                    CHECK (priority IN ('niedrig','normal','hoch','kritisch')),
    assigned_to   TEXT,                    -- Agent-Key (z.B. 'developer')
    created_by    TEXT,                    -- Agent-Key oder 'human'
    workflow      TEXT,                    -- z.B. 'continuous_improvement'
    parent_id     UUID REFERENCES agi.task_board(id) ON DELETE SET NULL,
    result        JSONB,                   -- Ergebnis des Agenten
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON agi.task_board(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON agi.task_board(assigned_to);

-- ---------------------------------------------------------------------------
-- 2) MESSAGE QUEUE – Nachrichten zwischen Agenten (inkl. Handoffs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agi.agent_messages (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_agent    TEXT NOT NULL,
    to_agent      TEXT NOT NULL,           -- Agent-Key oder 'broadcast'
    kind          TEXT NOT NULL DEFAULT 'info'
                    CHECK (kind IN ('info','handoff','request','result','reflection')),
    task_id       UUID REFERENCES agi.task_board(id) ON DELETE SET NULL,
    content       TEXT NOT NULL,
    payload       JSONB,
    consumed      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_msgs_to ON agi.agent_messages(to_agent, consumed);

-- ---------------------------------------------------------------------------
-- 3) KNOWLEDGE BASE – gemeinsame Entscheidungen & Learnings (Inter-Agenten-Learning)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agi.knowledge_base (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author        TEXT NOT NULL,           -- Agent-Key
    topic         TEXT NOT NULL,           -- z.B. 'architektur','markt_linz','finanzen'
    title         TEXT NOT NULL,
    content       TEXT NOT NULL,
    tags          JSONB DEFAULT '[]'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kb_topic ON agi.knowledge_base(topic);

-- ---------------------------------------------------------------------------
-- 4) EVENT BUS – Ereignisse, die Aktionen/Workflows auslösen
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agi.agent_events (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type          TEXT NOT NULL,           -- z.B. 'bug_detected','new_target','deploy_ready'
    source        TEXT NOT NULL,           -- Agent-Key oder 'system'
    payload       JSONB,
    handled       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_unhandled ON agi.agent_events(handled, type);

-- ---------------------------------------------------------------------------
-- APPROVALS – Human-in-the-Loop-Kontrollpunkte (Agent schlägt vor, Mensch entscheidet)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agi.approvals (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category      TEXT NOT NULL
                    CHECK (category IN ('code_release','uebernahme','budget','strategie','sonstiges')),
    requested_by  TEXT NOT NULL,           -- Agent-Key
    task_id       UUID REFERENCES agi.task_board(id) ON DELETE SET NULL,
    summary       TEXT NOT NULL,
    detail        JSONB,
    status        TEXT NOT NULL DEFAULT 'offen'
                    CHECK (status IN ('offen','genehmigt','abgelehnt')),
    decided_by    TEXT,                    -- 'human' / Name
    decided_at    TIMESTAMPTZ,
    applied_at    TIMESTAMPTZ,             -- gesetzt, wenn die Schleife die Änderung ausgeführt hat
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON agi.approvals(status);
-- Migration für bestehende Installationen:
ALTER TABLE agi.approvals ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- LOOP CYCLES – Protokoll der autonomen Verbesserungsschleife
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agi.loop_cycles (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    iteration     INTEGER NOT NULL,
    phase_summary JSONB,                   -- {analyze, ideate, improve, execute}
    applied_count INTEGER NOT NULL DEFAULT 0,
    learning      TEXT,
    started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at   TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- AGENT RUN LOG – jeder Agenten-Lauf (Audit + Selbstreflexion, lesbar gespeichert)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agi.agent_runs (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_key     TEXT NOT NULL,
    task_id       UUID REFERENCES agi.task_board(id) ON DELETE SET NULL,
    workflow      TEXT,
    mode          TEXT NOT NULL DEFAULT 'live'  CHECK (mode IN ('live','simuliert')),
    input         TEXT,
    output        TEXT,
    reflection    TEXT,                    -- Selbstreflexion des Agenten
    tokens_in     INTEGER,
    tokens_out    INTEGER,
    tool_calls    JSONB DEFAULT '[]'::jsonb,
    started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_runs_agent ON agi.agent_runs(agent_key);

-- updated_at Trigger fürs Task Board
CREATE OR REPLACE FUNCTION agi.touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tasks_touch ON agi.task_board;
CREATE TRIGGER trg_tasks_touch BEFORE UPDATE ON agi.task_board
    FOR EACH ROW EXECUTE FUNCTION agi.touch_updated_at();
