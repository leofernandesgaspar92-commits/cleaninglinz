import { Router } from 'express';
import { query, one } from '../lib/db.js';

const router = Router();

// Live-Operations: alle georeferenzierten Punkte für die Linz-Karte
router.get('/map', async (req, res, next) => {
  try {
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
    res.json({ jobs, companies: targets });
  } catch (e) { next(e); }
});

// Morgan-Modus: Imperium-Kennzahlen auf einen Blick
router.get('/finance', async (req, res, next) => {
  try {
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
    res.json({ totals, perCompany, mrr });
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

export default router;
