import { makeCrudRouter } from '../lib/crud.js';

export default makeCrudRouter({
  table: 'contracts',
  columns: [
    'customer_id', 'title', 'status', 'start_date', 'end_date', 'auto_renew',
    'frequency', 'value_monthly', 'price_per_sqm', 'notes',
  ],
  orderBy: 'end_date NULLS LAST',
});
