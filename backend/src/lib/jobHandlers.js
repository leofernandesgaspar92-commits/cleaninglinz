// ============================================================================
//  Job-Handler für die Queue. Jeder Handler: (params, setProgress) -> result.
// ============================================================================
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from './db.js';
import { register } from './queue.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXPORT_DIR = resolve(__dirname, '../../exports');

// Export aller Kunden + Verträge als JSON (Beispiel für Hintergrundarbeit).
register('export_customers', async (params, setProgress) => {
  await setProgress(10);
  const customers = await query(`
    SELECT c.*, COALESCE(json_agg(ct.*) FILTER (WHERE ct.id IS NOT NULL), '[]') AS contracts
    FROM customers c LEFT JOIN contracts ct ON ct.customer_id = c.id
    GROUP BY c.id ORDER BY c.name`);
  await setProgress(70);
  mkdirSync(EXPORT_DIR, { recursive: true });
  const file = resolve(EXPORT_DIR, `customers_${Date.now()}.json`);
  writeFileSync(file, JSON.stringify(customers, null, 2));
  await setProgress(100);
  return { file: file.replace(EXPORT_DIR, 'exports'), count: customers.length };
});

// Platzhalter: Volltext-Reindizierung (später Elasticsearch).
register('reindex', async (params, setProgress) => {
  await setProgress(50);
  const [{ n }] = await query('SELECT COUNT(*)::int AS n FROM documents');
  await setProgress(100);
  return { indexed: n, note: 'Reindex simuliert (Elasticsearch folgt in späterer Scheibe).' };
});
