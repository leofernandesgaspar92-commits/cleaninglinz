import { makeCrudRouter } from '../lib/crud.js';

export default makeCrudRouter({
  table: 'employees',
  columns: [
    'company_id', 'first_name', 'last_name', 'role', 'email', 'phone', 'hire_date',
    'hourly_wage', 'status', 'qualifications', 'certificates', 'known_buildings',
    'source_company_id',
  ],
  orderBy: 'last_name, first_name',
});
