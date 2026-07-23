import { Router } from 'express';
import { makeCrudRouter } from '../lib/crud.js';
import { one } from '../lib/db.js';
import { writeRoles } from '../lib/security.js';

// Job-Stammdaten (anlegen/ändern/löschen) folgen dem RBAC (manager/admin).
// Check-in/-out (Feldarbeit) sind bewusst NICHT hier gegated – siehe unten.
const router = makeCrudRouter({
  table: 'jobs',
  columns: [
    'customer_id', 'employee_id', 'title', 'status', 'scheduled_at',
    'check_in_at', 'check_out_at', 'check_in_lat', 'check_in_lng', 'duration_min', 'notes',
  ],
  orderBy: 'scheduled_at NULLS LAST',
  writeGuard: writeRoles,
});

// GPS-Check-in (mobile App)
router.post('/:id/checkin', async (req, res, next) => {
  try {
    const { lat, lng } = req.body;
    const row = await one(
      `UPDATE jobs SET status = 'in_arbeit', check_in_at = now(),
              check_in_lat = $2, check_in_lng = $3
       WHERE id = $1 RETURNING *`,
      [req.params.id, lat ?? null, lng ?? null]
    );
    if (!row) return res.status(404).json({ error: 'nicht gefunden' });
    res.json(row);
  } catch (e) { next(e); }
});

// Check-out inkl. Dauerberechnung
router.post('/:id/checkout', async (req, res, next) => {
  try {
    const row = await one(
      `UPDATE jobs SET status = 'erledigt', check_out_at = now(),
              duration_min = EXTRACT(EPOCH FROM (now() - check_in_at))/60
       WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'nicht gefunden' });
    res.json(row);
  } catch (e) { next(e); }
});

export default router;
