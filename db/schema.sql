-- ============================================================================
--  LECO – Hyper-lokales Reinigungs-Imperium-Management für Linz
--  PostgreSQL Schema (v1)
--
--  Zwei Kern-Datenbanken in einem Schema abgebildet:
--    A) IMPERIUM  – Unternehmen, Übernahmen (Merger/Akquise), Dokumente
--    B) OPERATIV  – Kunden, Verträge, Mitarbeiter, Aufträge (Jobs), Fotos
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";      -- Volltext-/Fuzzy-Suche (Duplikaterkennung)

-- ---------------------------------------------------------------------------
--  ENUM-artige Wertebereiche (als CHECK gehalten, damit leicht erweiterbar)
-- ---------------------------------------------------------------------------

-- ===========================================================================
--  A) IMPERIUM – Unternehmens-Datenbank
-- ===========================================================================

-- Übernommene bzw. Ziel-Unternehmen (Reinigungsfirmen in/um Linz)
CREATE TABLE companies (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL,
    legal_name      TEXT,                         -- z.B. "Muster Reinigung GmbH"
    -- Übernahme-Status (Pipeline / Kanban)
    status          TEXT NOT NULL DEFAULT 'ziel'
                        CHECK (status IN ('ziel','due_diligence','verhandlung','vertrag','uebernommen','integriert','verworfen')),
    -- Standort (für die Linz-Karte)
    address         TEXT,
    city            TEXT DEFAULT 'Linz',
    postal_code     TEXT,
    district        TEXT,                          -- Linzer Stadtteil (Urfahr, Kleinmünchen, ...)
    lat             DOUBLE PRECISION,
    lng             DOUBLE PRECISION,
    -- Kontakt / Inhaber
    owner_name      TEXT,
    contact_email   TEXT,
    contact_phone   TEXT,
    -- Betriebskennzahlen (Due-Diligence-Basis)
    founded_year    INTEGER,
    employee_count  INTEGER,
    annual_revenue  NUMERIC(14,2),                 -- Jahresumsatz €
    ebitda          NUMERIC(14,2),                 -- EBITDA €
    -- Deal-Daten
    purchase_price  NUMERIC(14,2),
    acquisition_date DATE,
    brand_decision  TEXT CHECK (brand_decision IN ('behalten','umbenennen','offen')) DEFAULT 'offen',
    is_own          BOOLEAN NOT NULL DEFAULT FALSE, -- TRUE = eigenes Kern-Unternehmen (nicht übernommen)
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_companies_status ON companies(status);
CREATE INDEX idx_companies_name_trgm ON companies USING gin (name gin_trgm_ops);

-- Übernahme-Prozess (Rockefeller-/Integration-Modul) — 1 Zeile pro Unternehmen
CREATE TABLE acquisitions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    current_step    INTEGER NOT NULL DEFAULT 1,     -- 1..6
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ,
    UNIQUE (company_id)
);

-- Die 6 fixen Integrationsschritte je Übernahme
CREATE TABLE acquisition_steps (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    acquisition_id  UUID NOT NULL REFERENCES acquisitions(id) ON DELETE CASCADE,
    step_number     INTEGER NOT NULL CHECK (step_number BETWEEN 1 AND 6),
    step_key        TEXT NOT NULL,                  -- 'ziel','due_diligence','mitarbeiter','kunden','finanzen','marke'
    title           TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'offen'
                        CHECK (status IN ('offen','in_arbeit','erledigt')),
    completed_at    TIMESTAMPTZ,
    notes           TEXT,
    UNIQUE (acquisition_id, step_number)
);

-- Due-Diligence-Checkliste (inkl. Linz-spezifischer Punkte)
CREATE TABLE due_diligence_items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    category        TEXT NOT NULL,                  -- 'finanzen','rechtliches','personal','kunden','linz_lokal'
    label           TEXT NOT NULL,
    is_linz_specific BOOLEAN NOT NULL DEFAULT FALSE,
    status          TEXT NOT NULL DEFAULT 'offen'
                        CHECK (status IN ('offen','ok','risiko','n_a')),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_dd_company ON due_diligence_items(company_id);

-- Zentrale Dokumentenablage (Kaufverträge, Jahresabschlüsse, ...)
CREATE TABLE documents (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    doc_type        TEXT,                           -- 'kaufvertrag','jahresabschluss','mitarbeiterliste',...
    file_path       TEXT,                           -- Referenz (S3/Disk); Volltext optional in content
    content         TEXT,                           -- extrahierter Text für Volltextsuche
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_docs_content_trgm ON documents USING gin (content gin_trgm_ops);

-- ===========================================================================
--  B) OPERATIV – Kunden-Datenbank
-- ===========================================================================

-- Kunden (Gebäude / Objekte, die gereinigt werden)
CREATE TABLE customers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID REFERENCES companies(id) ON DELETE SET NULL, -- welches Imperium-Unternehmen betreut
    name            TEXT NOT NULL,
    building_type   TEXT CHECK (building_type IN ('buero','wohnhaus','industrie','handel','oeffentlich','sonstige'))
                        DEFAULT 'sonstige',
    -- Standort
    address         TEXT,
    city            TEXT DEFAULT 'Linz',
    postal_code     TEXT,
    district        TEXT,                           -- Linzer Bezirk/Stadtteil
    lat             DOUBLE PRECISION,
    lng             DOUBLE PRECISION,
    area_sqm        NUMERIC(10,2),                  -- Reinigungsfläche m²
    -- Kontakt
    contact_name    TEXT,
    contact_email   TEXT,
    contact_phone   TEXT,
    -- Eigentümer (für "Kunden-DNA": wem gehört welche Immobilie in Linz)
    owner_name      TEXT,
    source_company_id UUID REFERENCES companies(id) ON DELETE SET NULL, -- aus welcher Übernahme importiert
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_customers_company ON customers(company_id);
CREATE INDEX idx_customers_name_trgm ON customers USING gin (name gin_trgm_ops);
CREATE INDEX idx_customers_addr_trgm ON customers USING gin (address gin_trgm_ops);

-- Verträge je Kunde
CREATE TABLE contracts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'aktiv'
                        CHECK (status IN ('aktiv','laeuft_aus','gekuendigt','beendet')),
    start_date      DATE,
    end_date        DATE,
    auto_renew      BOOLEAN NOT NULL DEFAULT FALSE,
    frequency       TEXT,                           -- 'taeglich','woechentlich','2x_woche','monatlich'
    value_monthly   NUMERIC(12,2),                  -- Monatswert €
    price_per_sqm   NUMERIC(8,2),                   -- Preis-Benchmarking €/m²
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_contracts_customer ON contracts(customer_id);
CREATE INDEX idx_contracts_status ON contracts(status);
CREATE INDEX idx_contracts_end_date ON contracts(end_date);

-- Mitarbeiter (Reinigungskräfte + Verwaltung)
CREATE TABLE employees (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID REFERENCES companies(id) ON DELETE SET NULL,
    first_name      TEXT NOT NULL,
    last_name       TEXT NOT NULL,
    role            TEXT DEFAULT 'reinigungskraft',
    email           TEXT,
    phone           TEXT,
    hire_date       DATE,
    hourly_wage     NUMERIC(8,2),
    status          TEXT NOT NULL DEFAULT 'aktiv'
                        CHECK (status IN ('aktiv','inaktiv','uebernommen')),
    qualifications  JSONB DEFAULT '[]'::jsonb,      -- ["Fensterreinigung","Industriereinigung"]
    certificates    JSONB DEFAULT '[]'::jsonb,      -- Zertifikate
    -- Linz-Skill-Matrix: welche Gebäude/Objekte kennt der MA
    known_buildings JSONB DEFAULT '[]'::jsonb,
    source_company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_employees_company ON employees(company_id);
CREATE INDEX idx_employees_name_trgm ON employees USING gin ((first_name || ' ' || last_name) gin_trgm_ops);

-- Aufträge / Reinigungsjobs (Live-Operations für das Dashboard)
CREATE TABLE jobs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    employee_id     UUID REFERENCES employees(id) ON DELETE SET NULL,
    title           TEXT,
    status          TEXT NOT NULL DEFAULT 'geplant'
                        CHECK (status IN ('geplant','unterwegs','in_arbeit','erledigt','abgebrochen')),
    scheduled_at    TIMESTAMPTZ,
    check_in_at     TIMESTAMPTZ,
    check_out_at    TIMESTAMPTZ,
    check_in_lat    DOUBLE PRECISION,               -- GPS beim Einchecken
    check_in_lng    DOUBLE PRECISION,
    duration_min    INTEGER,                         -- tatsächliche Dauer (für KI-Analyse)
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_scheduled ON jobs(scheduled_at);

-- Fotodokumentation vorher/nachher
CREATE TABLE job_photos (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    phase           TEXT NOT NULL CHECK (phase IN ('vorher','nachher')),
    file_path       TEXT NOT NULL,
    taken_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
--  Benutzer / rollenbasierter Zugriff (DSGVO-Grundlage)
-- ---------------------------------------------------------------------------
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           TEXT UNIQUE NOT NULL,
    full_name       TEXT,
    role            TEXT NOT NULL DEFAULT 'mitarbeiter'
                        CHECK (role IN ('admin','manager','mitarbeiter')),
    password_hash   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
--  updated_at Trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_companies_touch BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_customers_touch BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_employees_touch BEFORE UPDATE ON employees
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------------------------------------------------------------------------
--  Auswertungs-Views (Finanz-/Imperium-Dashboard)
-- ---------------------------------------------------------------------------

-- EBITDA-Explorer: Kennzahlen je Unternehmen
CREATE VIEW v_company_financials AS
SELECT
    c.id,
    c.name,
    c.status,
    c.annual_revenue,
    c.ebitda,
    CASE WHEN c.annual_revenue > 0
         THEN ROUND(c.ebitda / c.annual_revenue * 100, 1) END AS ebitda_margin_pct,
    c.purchase_price,
    CASE WHEN c.ebitda > 0
         THEN ROUND(c.purchase_price / c.ebitda, 1) END AS purchase_multiple
FROM companies c;

-- Vertrags-Pipeline: monatlich wiederkehrender Umsatz je Unternehmen
CREATE VIEW v_mrr_by_company AS
SELECT
    co.id  AS company_id,
    co.name AS company_name,
    COUNT(ct.id) FILTER (WHERE ct.status = 'aktiv') AS active_contracts,
    COALESCE(SUM(ct.value_monthly) FILTER (WHERE ct.status = 'aktiv'), 0) AS mrr
FROM companies co
LEFT JOIN customers cu ON cu.company_id = co.id
LEFT JOIN contracts ct ON ct.customer_id = cu.id
GROUP BY co.id, co.name;
