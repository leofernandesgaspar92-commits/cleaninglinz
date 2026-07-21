import { Router } from 'express';
import { query, one } from '../lib/db.js';

const router = Router();

// Die 6 Standard-Schritte einer Leco-Übernahme
const STEPS = [
  { step_key: 'ziel',          title: 'Ziel identifizieren' },
  { step_key: 'due_diligence', title: 'Due Diligence' },
  { step_key: 'mitarbeiter',   title: 'Mitarbeiter übernehmen' },
  { step_key: 'kunden',        title: 'Kunden integrieren' },
  { step_key: 'finanzen',      title: 'Finanzen zusammenführen' },
  { step_key: 'marke',         title: 'Marke/Name entscheiden' },
];

// Übernahme (inkl. Schritte + Firmendaten) laden – legt sie an, falls noch keine existiert
router.get('/by-company/:companyId', async (req, res, next) => {
  try {
    const { companyId } = req.params;
    let acq = await one('SELECT * FROM acquisitions WHERE company_id = $1', [companyId]);

    if (!acq) {
      acq = await one(
        'INSERT INTO acquisitions (company_id, current_step) VALUES ($1, 1) RETURNING *',
        [companyId]
      );
      for (let i = 0; i < STEPS.length; i++) {
        await query(
          `INSERT INTO acquisition_steps (acquisition_id, step_number, step_key, title, status)
           VALUES ($1, $2, $3, $4, 'offen')`,
          [acq.id, i + 1, STEPS[i].step_key, STEPS[i].title]
        );
      }
    }

    const steps = await query(
      'SELECT * FROM acquisition_steps WHERE acquisition_id = $1 ORDER BY step_number',
      [acq.id]
    );
    const company = await one('SELECT * FROM companies WHERE id = $1', [companyId]);
    const ddItems = await query(
      'SELECT * FROM due_diligence_items WHERE company_id = $1 ORDER BY is_linz_specific DESC, category',
      [companyId]
    );
    res.json({ acquisition: acq, steps, company, dueDiligence: ddItems });
  } catch (e) { next(e); }
});

// Einen Schritt aktualisieren (Status/Notiz) und current_step nachziehen
router.patch('/steps/:stepId', async (req, res, next) => {
  try {
    const { status, notes } = req.body;
    const completedAt = status === 'erledigt' ? 'now()' : 'NULL';
    const step = await one(
      `UPDATE acquisition_steps
       SET status = COALESCE($2, status),
           notes = COALESCE($3, notes),
           completed_at = ${completedAt}
       WHERE id = $1 RETURNING *`,
      [req.params.stepId, status ?? null, notes ?? null]
    );
    if (!step) return res.status(404).json({ error: 'nicht gefunden' });

    // current_step = erster nicht erledigter Schritt
    const next = await one(
      `SELECT MIN(step_number) AS n FROM acquisition_steps
       WHERE acquisition_id = $1 AND status <> 'erledigt'`,
      [step.acquisition_id]
    );
    const currentStep = next?.n ?? 6;
    const allDone = next?.n == null;
    await query(
      `UPDATE acquisitions SET current_step = $2, completed_at = ${allDone ? 'now()' : 'NULL'}
       WHERE id = $1`,
      [step.acquisition_id, currentStep]
    );
    res.json(step);
  } catch (e) { next(e); }
});

// Due-Diligence-Punkt aktualisieren
router.patch('/dd/:itemId', async (req, res, next) => {
  try {
    const { status, notes } = req.body;
    const row = await one(
      `UPDATE due_diligence_items
       SET status = COALESCE($2, status), notes = COALESCE($3, notes)
       WHERE id = $1 RETURNING *`,
      [req.params.itemId, status ?? null, notes ?? null]
    );
    if (!row) return res.status(404).json({ error: 'nicht gefunden' });
    res.json(row);
  } catch (e) { next(e); }
});

// Status-Bericht für eine Übernahme
router.get('/by-company/:companyId/report', async (req, res, next) => {
  try {
    const { companyId } = req.params;
    const company = await one('SELECT * FROM companies WHERE id = $1', [companyId]);
    if (!company) return res.status(404).json({ error: 'Unternehmen nicht gefunden' });
    const acq = await one('SELECT * FROM acquisitions WHERE company_id = $1', [companyId]);
    const steps = acq
      ? await query('SELECT * FROM acquisition_steps WHERE acquisition_id = $1 ORDER BY step_number', [acq.id])
      : [];
    const done = steps.filter((s) => s.status === 'erledigt').length;
    const employees = await query('SELECT COUNT(*)::int AS n FROM employees WHERE source_company_id = $1', [companyId]);
    const customers = await query('SELECT COUNT(*)::int AS n FROM customers WHERE source_company_id = $1', [companyId]);
    res.json({
      company: company.name,
      progress_pct: steps.length ? Math.round((done / steps.length) * 100) : 0,
      steps_done: done,
      steps_total: steps.length,
      employees_taken: employees[0].n,
      customers_taken: customers[0].n,
      steps,
    });
  } catch (e) { next(e); }
});

export default router;
