-- ============================================================================
--  LECO ENTERPRISE – Sicherheits-, Audit- & Analytics-Erweiterungen
--  Additiv zum Basis-Schema (db/schema.sql). Idempotent (IF NOT EXISTS).
-- ============================================================================

-- --- Benutzer: MFA + Sicherheits-Felder ------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret     TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled    BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_logins  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until   TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at  TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider       TEXT NOT NULL DEFAULT 'local'; -- local|google|azure
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_sub   TEXT;                            -- SSO-Subjekt-ID

-- --- Audit-Log: jeder sicherheitsrelevante Vorgang -------------------------
CREATE TABLE IF NOT EXISTS audit_log (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_email TEXT,
    action      TEXT NOT NULL,          -- login_success, login_failed, mfa_enabled, data_change, ...
    entity      TEXT,                   -- z.B. 'customers'
    entity_id   TEXT,
    detail      JSONB,
    ip          TEXT,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);

-- --- Fehler-Log: für das Admin-Monitoring ----------------------------------
CREATE TABLE IF NOT EXISTS error_log (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    level       TEXT NOT NULL DEFAULT 'error',
    message     TEXT NOT NULL,
    stack       TEXT,
    method      TEXT,
    path        TEXT,
    status      INTEGER,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_error_created ON error_log(created_at DESC);

-- --- Analytics-Events: Funktionsnutzung (Heatmap) --------------------------
CREATE TABLE IF NOT EXISTS analytics_events (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    feature     TEXT NOT NULL,          -- z.B. 'dashboard.map', 'merger.step_done'
    action      TEXT,                   -- 'view','click','submit'
    meta        JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analytics_feature ON analytics_events(feature);
CREATE INDEX IF NOT EXISTS idx_analytics_created ON analytics_events(created_at DESC);

-- --- Benachrichtigungen (In-App-Feed + Slack/Teams-Versand) -----------------
CREATE TABLE IF NOT EXISTS notifications (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    level       TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info','success','warning','error')),
    title       TEXT NOT NULL,
    message     TEXT,
    meta        JSONB,
    sent_slack  BOOLEAN NOT NULL DEFAULT FALSE,
    sent_teams  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_created ON notifications(created_at DESC);

-- --- Asynchrone Job-Queue (Hintergrundverarbeitung, z.B. Exporte) -----------
CREATE TABLE IF NOT EXISTS job_queue (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type        TEXT NOT NULL,           -- z.B. 'export_customers'
    status      TEXT NOT NULL DEFAULT 'wartend'
                  CHECK (status IN ('wartend','laeuft','fertig','fehler')),
    params      JSONB,
    result      JSONB,
    error       TEXT,
    progress    INTEGER NOT NULL DEFAULT 0,
    created_by  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at  TIMESTAMPTZ,
    finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_jobq_status ON job_queue(status, created_at);

-- --- Performance: Indizes für schnelle Abfragen (Millionen Datensätze) ------
CREATE INDEX IF NOT EXISTS idx_jobs_customer ON jobs(customer_id);
CREATE INDEX IF NOT EXISTS idx_jobs_employee ON jobs(employee_id);
CREATE INDEX IF NOT EXISTS idx_contracts_end ON contracts(end_date) WHERE status <> 'beendet';
