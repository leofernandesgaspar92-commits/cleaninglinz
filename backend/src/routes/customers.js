import { Router } from 'express';
import { makeCrudRouter } from '../lib/crud.js';
import { query } from '../lib/db.js';

const router = makeCrudRouter({
  table: 'customers',
  columns: [
    'company_id', 'name', 'building_type', 'address', 'city', 'postal_code', 'district',
    'lat', 'lng', 'area_sqm', 'contact_name', 'contact_email', 'contact_phone',
    'owner_name', 'source_company_id', 'notes',
  ],
  orderBy: 'name',
});

// Kunde inkl. Verträge
router.get('/:id/contracts', async (req, res, next) => {
  try {
    const rows = await query(
      'SELECT * FROM contracts WHERE customer_id = $1 ORDER BY end_date NULLS LAST',
      [req.params.id]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

export default router;
