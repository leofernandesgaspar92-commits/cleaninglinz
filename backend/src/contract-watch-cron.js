// Täglicher Vertragsauslauf-Wächter (08:00). Warnt vor Verträgen, die in den
// nächsten CONTRACT_WATCH_DAYS Tagen (Standard 30) auslaufen.
// Dauerbetrieb: node src/contract-watch-cron.js   ·   Sofortlauf: --now
import cron from 'node-cron';
import { runContractWatch } from './lib/contractWatch.js';
import { pool } from './lib/db.js';

const withinDays = parseInt(process.env.CONTRACT_WATCH_DAYS, 10) || 30;

async function run() {
  try {
    const r = await runContractWatch({ withinDays });
    console.log(`[${new Date().toISOString()}] Vertrags-Watch: ${r.checked} geprüft, `
      + `${r.alerted} gewarnt, ${r.skipped} bereits gemeldet.`);
  } catch (e) {
    console.error('Vertrags-Watch fehlgeschlagen:', e.message);
  }
}

cron.schedule('0 8 * * *', run); // täglich 08:00
console.log(`Vertrags-Watch-Cron aktiv (täglich 08:00, Fenster ${withinDays} Tage). Sofortlauf mit --now.`);
if (process.argv.includes('--now')) run().then(() => pool.end());
