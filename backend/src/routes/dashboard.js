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

export default router;
