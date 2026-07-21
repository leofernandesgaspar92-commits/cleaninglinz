-- ============================================================================
--  LECO – Seed-Daten (Linz-Szenario)
--  Ausgangslage: Dein Kern-Unternehmen "Leco Cleaning" übernimmt
--  "Donau Sauber GmbH" – gesamter Übernahme-Workflow zum Durchspielen.
-- ============================================================================

-- --- Eigenes Kern-Unternehmen -----------------------------------------------
INSERT INTO companies (id, name, legal_name, status, is_own, address, city, postal_code, district, lat, lng,
                       owner_name, contact_email, founded_year, employee_count, annual_revenue, ebitda, brand_decision)
VALUES
('11111111-1111-1111-1111-111111111111', 'Leco Cleaning', 'Leco Cleaning GmbH', 'integriert', TRUE,
 'Hauptplatz 1', 'Linz', '4020', 'Innere Stadt', 48.30639, 14.28611,
 'Du', 'office@leco.at', 2024, 12, 780000, 145000, 'behalten');

-- --- Ziel-Unternehmen (aktive Übernahme) ------------------------------------
INSERT INTO companies (id, name, legal_name, status, is_own, address, city, postal_code, district, lat, lng,
                       owner_name, contact_email, contact_phone, founded_year, employee_count,
                       annual_revenue, ebitda, purchase_price, brand_decision, notes)
VALUES
('22222222-2222-2222-2222-222222222222', 'Donau Sauber', 'Donau Sauber GmbH', 'due_diligence', FALSE,
 'Untere Donaulände 12', 'Linz', '4020', 'Innere Stadt', 48.31500, 14.29300,
 'Maria Huber', 'huber@donausauber.at', '+43 732 111222', 2011, 9,
 420000, 62000, 310000, 'offen', 'Solider Kundenstamm im Zentrum, Inhaberin geht in Pension.'),

-- --- Weitere Ziele in der Pipeline (für den Tracker) ------------------------
('33333333-3333-3333-3333-333333333333', 'Stahl & Glanz', 'Stahl & Glanz e.U.', 'ziel', FALSE,
 'Industriezeile 76', 'Linz', '4020', 'Kaplanhof', 48.28900, 14.31800,
 'Josef Berger', 'berger@stahlglanz.at', NULL, 2016, 5, 210000, 28000, NULL, 'offen',
 'Spezialisiert auf Industriereinigung (voestalpine-Umfeld).'),
('44444444-4444-4444-4444-444444444444', 'Urfahr Reinigung', 'Urfahr Reinigung GmbH', 'verhandlung', FALSE,
 'Hauptstraße 40', 'Linz', '4040', 'Urfahr', 48.31900, 14.28400,
 'Anna Mayr', 'mayr@urfahr-clean.at', '+43 732 333444', 2008, 14, 560000, 71000, 340000, 'umbenennen',
 'Starke Präsenz nördlich der Donau.');

-- --- Übernahme-Workflow für Donau Sauber -------------------------------------
INSERT INTO acquisitions (id, company_id, current_step)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 2);

INSERT INTO acquisition_steps (acquisition_id, step_number, step_key, title, status, completed_at) VALUES
('aaaaaaaa-0000-0000-0000-000000000001', 1, 'ziel',          'Ziel identifizieren',   'erledigt', now() - interval '20 days'),
('aaaaaaaa-0000-0000-0000-000000000001', 2, 'due_diligence', 'Due Diligence',         'in_arbeit', NULL),
('aaaaaaaa-0000-0000-0000-000000000001', 3, 'mitarbeiter',   'Mitarbeiter übernehmen','offen', NULL),
('aaaaaaaa-0000-0000-0000-000000000001', 4, 'kunden',        'Kunden integrieren',    'offen', NULL),
('aaaaaaaa-0000-0000-0000-000000000001', 5, 'finanzen',      'Finanzen zusammenführen','offen', NULL),
('aaaaaaaa-0000-0000-0000-000000000001', 6, 'marke',         'Marke/Name entscheiden','offen', NULL);

-- --- Due-Diligence-Checkliste (inkl. Linz-spezifisch) ------------------------
INSERT INTO due_diligence_items (company_id, category, label, is_linz_specific, status) VALUES
('22222222-2222-2222-2222-222222222222', 'finanzen',   'Jahresabschlüsse letzte 3 Jahre geprüft', FALSE, 'ok'),
('22222222-2222-2222-2222-222222222222', 'finanzen',   'Offene Forderungen / Debitoren geprüft',  FALSE, 'risiko'),
('22222222-2222-2222-2222-222222222222', 'rechtliches','Bestehende Kundenverträge übertragbar',   FALSE, 'offen'),
('22222222-2222-2222-2222-222222222222', 'personal',   'Dienstverträge & Kollektivvertrag geprüft',FALSE, 'ok'),
('22222222-2222-2222-2222-222222222222', 'linz_lokal', 'Lokalkenntnis Innenstadt & Parkzonen',    TRUE,  'ok'),
('22222222-2222-2222-2222-222222222222', 'linz_lokal', 'Kunden-Netzwerk in Linz überschneidet sich', TRUE, 'offen'),
('22222222-2222-2222-2222-222222222222', 'linz_lokal', 'Schlüssel-/Zugangsverwaltung Linzer Objekte',TRUE, 'offen');

-- --- Kunden (eigene + aus Donau Sauber importiert) --------------------------
INSERT INTO customers (id, company_id, name, building_type, address, city, postal_code, district, lat, lng, area_sqm, contact_name, owner_name, source_company_id) VALUES
('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Ars Electronica Center', 'oeffentlich', 'Ars-Electronica-Straße 1', 'Linz', '4040', 'Urfahr', 48.31083, 14.28444, 6500, 'Hr. Doktor', 'Stadt Linz', NULL),
('c0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Bürohaus Lentia City', 'buero', 'Blütenstraße 15', 'Linz', '4040', 'Urfahr', 48.31700, 14.28200, 3200, 'Fr. Wagner', 'Lentia Immobilien', NULL),
('c0000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'Wohnanlage Donaupark', 'wohnhaus', 'Untere Donaulände 40', 'Linz', '4020', 'Innere Stadt', 48.31400, 14.29800, 4100, 'Hausverwaltung Süd', 'ÖWG', '22222222-2222-2222-2222-222222222222'),
('c0000000-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', 'Ordination Dr. Steiner', 'buero', 'Landstraße 22', 'Linz', '4020', 'Innere Stadt', 48.30200, 14.28700, 180, 'Dr. Steiner', 'Dr. Steiner', '22222222-2222-2222-2222-222222222222'),
('c0000000-0000-0000-0000-000000000005', '33333333-3333-3333-3333-333333333333', 'Lagerhalle Industriezeile', 'industrie', 'Industriezeile 100', 'Linz', '4020', 'Kaplanhof', 48.28700, 14.32100, 8800, 'Hr. Fuchs', 'voest Logistik', '33333333-3333-3333-3333-333333333333');

-- --- Verträge ---------------------------------------------------------------
INSERT INTO contracts (customer_id, title, status, start_date, end_date, auto_renew, frequency, value_monthly, price_per_sqm) VALUES
('c0000000-0000-0000-0000-000000000001', 'Unterhaltsreinigung AEC', 'aktiv', '2024-01-01', '2026-12-31', TRUE, 'taeglich', 9800, 1.51),
('c0000000-0000-0000-0000-000000000002', 'Büroreinigung Lentia', 'aktiv', '2024-06-01', '2025-09-30', FALSE, '2x_woche', 2400, 0.75),
('c0000000-0000-0000-0000-000000000003', 'Stiegenhausreinigung', 'laeuft_aus', '2023-01-01', '2025-08-31', FALSE, 'woechentlich', 1600, 0.39),
('c0000000-0000-0000-0000-000000000004', 'Ordinationsreinigung', 'aktiv', '2024-03-01', '2026-02-28', TRUE, 'taeglich', 900, 5.00);

-- --- Mitarbeiter (eigene + zur Übernahme) -----------------------------------
INSERT INTO employees (company_id, first_name, last_name, role, phone, hire_date, hourly_wage, status, qualifications, known_buildings, source_company_id) VALUES
('11111111-1111-1111-1111-111111111111', 'Elena', 'Popescu', 'reinigungskraft', '+43 660 1111', '2024-02-01', 15.50, 'aktiv', '["Unterhaltsreinigung","Glasreinigung"]', '["Ars Electronica Center"]', NULL),
('11111111-1111-1111-1111-111111111111', 'Marko', 'Novak', 'teamleiter', '+43 660 2222', '2024-01-15', 18.00, 'aktiv', '["Industriereinigung","Führung"]', '["Bürohaus Lentia City"]', NULL),
('22222222-2222-2222-2222-222222222222', 'Fatima', 'Yilmaz', 'reinigungskraft', '+43 660 3333', '2019-05-01', 14.80, 'uebernommen', '["Unterhaltsreinigung"]', '["Wohnanlage Donaupark","Ordination Dr. Steiner"]', '22222222-2222-2222-2222-222222222222'),
('22222222-2222-2222-2222-222222222222', 'Petar', 'Ilic', 'reinigungskraft', '+43 660 4444', '2015-09-01', 15.20, 'uebernommen', '["Unterhaltsreinigung","Fensterreinigung"]', '["Wohnanlage Donaupark"]', '22222222-2222-2222-2222-222222222222');

-- --- Live-Jobs (für Dashboard-Karte) ----------------------------------------
INSERT INTO jobs (customer_id, employee_id, title, status, scheduled_at, check_in_at, check_in_lat, check_in_lng, duration_min)
SELECT c.id, e.id, 'Tagesreinigung', 'in_arbeit', now(), now() - interval '35 min', c.lat, c.lng, NULL
FROM customers c, employees e
WHERE c.name = 'Ars Electronica Center' AND e.last_name = 'Popescu' LIMIT 1;

INSERT INTO jobs (customer_id, employee_id, title, status, scheduled_at)
SELECT c.id, e.id, 'Büroreinigung', 'geplant', now() + interval '2 hours'
FROM customers c, employees e
WHERE c.name = 'Bürohaus Lentia City' AND e.last_name = 'Novak' LIMIT 1;

INSERT INTO jobs (customer_id, employee_id, title, status, scheduled_at, check_in_at, check_out_at, duration_min)
SELECT c.id, e.id, 'Stiegenhaus', 'erledigt', now() - interval '3 hours', now() - interval '3 hours', now() - interval '2 hours', 55
FROM customers c, employees e
WHERE c.name = 'Wohnanlage Donaupark' AND e.last_name = 'Yilmaz' LIMIT 1;

-- --- Benutzer ----------------------------------------------------------------
INSERT INTO users (email, full_name, role) VALUES
('office@leco.at', 'Leco Admin', 'admin');
