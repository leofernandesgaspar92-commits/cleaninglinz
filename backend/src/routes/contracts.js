import { makeCrudRouter } from '../lib/crud.js';
import { one } from '../lib/db.js';

const router = makeCrudRouter({
  table: 'contracts',
  columns: [
    'customer_id', 'title', 'status', 'start_date', 'end_date', 'auto_renew',
    'frequency', 'value_monthly', 'price_per_sqm', 'notes',
  ],
  orderBy: 'end_date NULLS LAST',
});

// Vertrag verlängern (Umsatzsicherung): Enddatum um N Monate (Standard 12)
// verschieben und Status auf „aktiv" setzen. Schreibrecht via Mount (writeRoles).
router.post('/:id/renew', async (req, res, next) => {
  try {
    const months = Math.min(Math.max(parseInt(req.body?.months, 10) || 12, 1), 120);
    const row = await one(
      `UPDATE contracts
          SET end_date = (COALESCE(end_date, CURRENT_DATE) + ($2 || ' months')::interval)::date,
              status = 'aktiv'
        WHERE id = $1 RETURNING *`,
      [req.params.id, months]);
    if (!row) return res.status(404).json({ error: 'nicht gefunden' });
    res.json(row);
  } catch (e) { next(e); }
});

export default router;
