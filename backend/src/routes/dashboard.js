import { Router } from 'express';
import { query, one } from '../lib/db.js';
import { wrap } from '../lib/cache.js';

const router = Router();

// Live-Operations: alle georeferenzierten Punkte für die Linz-Karte (gecacht 8s)
router.get('/map', async (req, res, next) => {
  try {
    const data = await wrap('dash:map', 8000, async () => {
    const jobs = await query(`
      SELECT j.id, j.status, j.title, j.scheduled_at,
             c.name AS customer_name, c.lat, c.lng, c.building_type,
             e.first_name || ' ' || e.last_name AS employee_name
      FROM jobs j
      JOIN customers c ON c.id = j.customer_id
      LEFT JOIN employees e ON e.id = j.employee_id
      WHERE c.lat IS NOT NULL AND j.status <> 'abgebrochen'
    `);
    const targets = await query(`
      SELECT id, name, status, lat, lng, is_own
      FROM companies WHERE lat IS NOT NULL
    `);
      return { jobs, companies: targets };
    });
    res.json(data);
  } catch (e) { next(e); }
});

// Morgan-Modus: Imperium-Kennzahlen auf einen Blick (gecacht 10s)
router.get('/finance', async (req, res, next) => {
  try {
    const data = await wrap('dash:finance', 10000, async () => {
    const totals = await one(`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('uebernommen','integriert') OR is_own) AS companies_owned,
        COUNT(*) FILTER (WHERE status IN ('ziel','due_diligence','verhandlung','vertrag')) AS pipeline,
        COALESCE(SUM(annual_revenue) FILTER (WHERE status IN ('uebernommen','integriert') OR is_own),0) AS revenue,
        COALESCE(SUM(ebitda) FILTER (WHERE status IN ('uebernommen','integriert') OR is_own),0) AS ebitda
      FROM companies
    `);
    const perCompany = await query('SELECT * FROM v_company_financials ORDER BY ebitda DESC NULLS LAST');
    const mrr = await query('SELECT * FROM v_mrr_by_company ORDER BY mrr DESC');
      return { totals, perCompany, mrr };
    });
    res.json(data);
  } catch (e) { next(e); }
});

// Auslaufende Verträge (Erinnerungen)
router.get('/expiring-contracts', async (req, res, next) => {
  try {
    const rows = await query(`
      SELECT ct.*, cu.name AS customer_name
      FROM contracts ct JOIN customers cu ON cu.id = ct.customer_id
      WHERE ct.end_date IS NOT NULL
        AND ct.end_date <= (CURRENT_DATE + interval '90 days')
        AND ct.status <> 'beendet'
      ORDER BY ct.end_date
    `);
    res.json(rows);
  } catch (e) { next(e); }
});

// Team-Auslastung: offene/erledigte Jobs je aktivem Mitarbeiter + unbesetzte Jobs.
// Analyst-Sicht: Über-/Unterauslastung erkennen und Arbeit sinnvoll verteilen.
router.get('/workload', async (req, res, next) => {
  try {
    const OPEN = "('geplant','unterwegs','in_arbeit')";
    const employees = await query(`
      SELECT e.id, e.first_name, e.last_name, e.role,
             COUNT(j.id) FILTER (WHERE j.status IN ${OPEN}) AS open_jobs,
             COUNT(j.id) FILTER (WHERE j.status = 'erledigt') AS done_jobs
      FROM employees e
      LEFT JOIN jobs j ON j.employee_id = e.id
      WHERE e.status = 'aktiv'
      GROUP BY e.id, e.first_name, e.last_name, e.role
      ORDER BY open_jobs DESC, e.last_name`);
    const [{ unassigned_open }] = await query(
      `SELECT COUNT(*)::int AS unassigned_open FROM jobs WHERE employee_id IS NULL AND status IN ${OPEN}`);
    const rows = employees.map((e) => ({
      ...e, open_jobs: Number(e.open_jobs), done_jobs: Number(e.done_jobs),
      underutilized: Number(e.open_jobs) === 0,
    }));
    const openTotal = rows.reduce((s, e) => s + e.open_jobs, 0);
    res.json({
      employees: rows,
      unassigned_open,
      totals: {
        active_employees: rows.length,
        open_jobs: openTotal,
        underutilized: rows.filter((e) => e.underutilized).length,
        avg_open_per_employee: rows.length ? Math.round((openTotal / rows.length) * 10) / 10 : 0,
      },
    });
  } catch (e) { next(e); }
});

// --- geteilte Berechnungen (JSON- und CSV-Endpunkte nutzen dieselbe Logik) ---
async function computeMrrTrend(months) {
  const rows = await query(`
    WITH m AS (
      SELECT date_trunc('month', d)::date AS month_start
      FROM generate_series(
        date_trunc('month', CURRENT_DATE) - (($1::int - 1) * interval '1 month'),
        date_trunc('month', CURRENT_DATE),
        interval '1 month') d
    )
    SELECT to_char(m.month_start, 'YYYY-MM') AS month,
           COALESCE(SUM(c.value_monthly) FILTER (
             WHERE c.start_date <= (m.month_start + interval '1 month' - interval '1 day')
               AND (c.end_date IS NULL OR c.end_date >= m.month_start)
           ), 0)::numeric AS mrr
    FROM m LEFT JOIN contracts c ON TRUE
    GROUP BY m.month_start ORDER BY m.month_start`, [months]);
  const series = rows.map((r) => ({ month: r.month, mrr: Number(r.mrr) }));
  const current = series.at(-1)?.mrr || 0;
  const yearAgo = series.length >= 13 ? series.at(-13).mrr : (series[0]?.mrr || 0);
  const growthPct = yearAgo > 0 ? Math.round(((current - yearAgo) / yearAgo) * 1000) / 10 : null;
  return { months: series, current_mrr: current, yoy_growth_pct: growthPct };
}

async function computeMergerRoi() {
  const ASK_MULTIPLE = Number(process.env.MERGER_ASK_MULTIPLE) || 4;   // Kaufpreis ≈ 4× EBITDA
  const SYNERGY_RATE = Number(process.env.MERGER_SYNERGY_RATE) || 0.05; // 5% des Umsatzes
  const targets = await query(`
    SELECT id, name, status, annual_revenue, ebitda, purchase_price, employee_count
    FROM companies
    WHERE is_own = FALSE AND status <> 'verworfen'
      AND ebitda IS NOT NULL AND ebitda > 0 AND annual_revenue IS NOT NULL`);
  const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
  const rows = targets.map((t) => {
    const ebitda = Number(t.ebitda);
    const revenue = Number(t.annual_revenue);
    const priceEstimated = t.purchase_price == null;
    const price = priceEstimated ? ebitda * ASK_MULTIPLE : Number(t.purchase_price);
    const synergyEbitda = revenue * SYNERGY_RATE;
    return {
      id: t.id, name: t.name, status: t.status,
      annual_revenue: revenue, ebitda, employee_count: t.employee_count,
      price, price_estimated: priceEstimated,
      ebitda_multiple: round(price / ebitda, 1),
      roi_pct: round((ebitda / price) * 100, 1),
      payback_years: round(price / ebitda, 1),
      synergy_ebitda: Math.round(synergyEbitda),
      roi_with_synergy_pct: round(((ebitda + synergyEbitda) / price) * 100, 1),
      payback_with_synergy_years: round(price / (ebitda + synergyEbitda), 1),
    };
  }).sort((a, b) => b.roi_with_synergy_pct - a.roi_with_synergy_pct);
  return { assumptions: { ask_multiple: ASK_MULTIPLE, synergy_rate: SYNERGY_RATE }, targets: rows };
}

// CSV-Helfer: Excel-tauglich (UTF-8-BOM, CRLF, Semikolon-getrennt für DE-Excel).
function toCsv(headers, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(';'), ...rows.map((r) => r.map(esc).join(';'))];
  return '﻿' + lines.join('\r\n') + '\r\n';
}
function sendCsv(res, filename, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

// MRR-Entwicklung: monatlich wiederkehrender Umsatz über die Zeit, direkt aus den
// Vertragslaufzeiten (start_date/end_date) berechnet – zeigt Wachstum & Auslaufen.
router.get('/mrr-trend', async (req, res, next) => {
  try {
    const months = Math.min(Math.max(parseInt(req.query.months, 10) || 18, 3), 36);
    res.json(await computeMrrTrend(months));
  } catch (e) { next(e); }
});
router.get('/mrr-trend.csv', async (req, res, next) => {
  try {
    const months = Math.min(Math.max(parseInt(req.query.months, 10) || 18, 3), 36);
    const { months: series } = await computeMrrTrend(months);
    sendCsv(res, 'mrr-entwicklung.csv',
      toCsv(['Monat', 'MRR_EUR'], series.map((m) => [m.month, m.mrr])));
  } catch (e) { next(e); }
});

// Übernahme-ROI / Synergie-Rechner: bewertet die Ziel-Firmen der Pipeline.
// Wo kein Kaufpreis feststeht, wird er aus einem EBITDA-Multiple geschätzt.
// Synergie = Anteil des Zielumsatzes, der nach Integration als EBITDA-Uplift wirkt.
router.get('/merger-roi', async (req, res, next) => {
  try { res.json(await computeMergerRoi()); } catch (e) { next(e); }
});
router.get('/merger-roi.csv', async (req, res, next) => {
  try {
    const { targets } = await computeMergerRoi();
    sendCsv(res, 'uebernahme-roi.csv', toCsv(
      ['Ziel', 'Status', 'Umsatz_EUR', 'EBITDA_EUR', 'Kaufpreis_EUR', 'Preis_geschaetzt',
        'EBITDA_Multiple', 'ROI_Prozent', 'Amortisation_Jahre', 'Synergie_EBITDA_EUR',
        'ROI_inkl_Synergie_Prozent', 'Amortisation_inkl_Synergie_Jahre'],
      targets.map((t) => [t.name, t.status, t.annual_revenue, t.ebitda, t.price,
        t.price_estimated ? 'ja' : 'nein', t.ebitda_multiple, t.roi_pct, t.payback_years,
        t.synergy_ebitda, t.roi_with_synergy_pct, t.payback_with_synergy_years])));
  } catch (e) { next(e); }
});

export default router;
