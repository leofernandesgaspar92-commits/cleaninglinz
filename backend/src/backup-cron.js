// Täglicher Backup-Cron (02:00). Startet backend/scripts/backup.sh.
// Aufruf im Dauerbetrieb: node src/backup-cron.js
import cron from 'node-cron';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = resolve(dirname(fileURLToPath(import.meta.url)), '../scripts/backup.sh');

function runBackup() {
  console.log(`[${new Date().toISOString()}] Starte Backup …`);
  const p = spawn('bash', [script], { stdio: 'inherit', env: process.env });
  p.on('exit', (code) => console.log(`Backup beendet (Code ${code}).`));
}

cron.schedule('0 2 * * *', runBackup); // täglich 02:00
console.log('Backup-Cron aktiv (täglich 02:00). Sofort-Backup mit --now.');
if (process.argv.includes('--now')) runBackup();
