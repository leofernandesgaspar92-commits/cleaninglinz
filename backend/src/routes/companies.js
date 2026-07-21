import { makeCrudRouter } from '../lib/crud.js';

export default makeCrudRouter({
  table: 'companies',
  columns: [
    'name', 'legal_name', 'status', 'address', 'city', 'postal_code', 'district',
    'lat', 'lng', 'owner_name', 'contact_email', 'contact_phone', 'founded_year',
    'employee_count', 'annual_revenue', 'ebitda', 'purchase_price', 'acquisition_date',
    'brand_decision', 'is_own', 'notes',
  ],
  orderBy: `CASE status
              WHEN 'ziel' THEN 1 WHEN 'due_diligence' THEN 2 WHEN 'verhandlung' THEN 3
              WHEN 'vertrag' THEN 4 WHEN 'uebernommen' THEN 5 WHEN 'integriert' THEN 6
              ELSE 7 END, name`,
});
