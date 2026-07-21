// Führt schema.sql (und optional seed.sql) gegen die Datenbank aus.
// Aufruf:  node src/lib/migrate.js                  -> nur Schema
//          node src/lib/migrate.js --seed           -> Schema + Seed
//          node src/lib/migrate.js --reset --seed   -> DB leeren + Schema + Seed
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbDir = resolve(__dirname, '../../../db');

async function run() {
  const withSeed = process.argv.includes('--seed');
  const withReset = process.argv.includes('--reset');
  const schema = readFileSync(resolve(dbDir, 'schema.sql'), 'utf8');

  if (withReset) {
    console.log('› Setze Schema zurück (DROP) …');
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    console.log('  ✓ zurückgesetzt');
  }

  console.log('› Wende Schema an …');
  await pool.query(schema);
  console.log('  ✓ Schema angewendet');

  if (withSeed) {
    const seed = readFileSync(resolve(dbDir, 'seed.sql'), 'utf8');
    console.log('› Lade Seed-Daten (Linz-Szenario) …');
    await pool.query(seed);
    console.log('  ✓ Seed geladen');
  }

  await pool.end();
  console.log('Fertig.');
}

run().catch((err) => {
  console.error('Migration fehlgeschlagen:', err.message);
  process.exit(1);
});
