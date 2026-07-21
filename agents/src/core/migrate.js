// Legt das agi-Schema an. Aufruf: node src/core/migrate.js
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function run() {
  const sql = readFileSync(resolve(__dirname, '../../db/schema.sql'), 'utf8');
  console.log('› Lege AGI-Schema an …');
  await pool.query(sql);
  console.log('  ✓ Schema bereit');
  await pool.end();
}
run().catch((e) => { console.error('Migration fehlgeschlagen:', e.message); process.exit(1); });
