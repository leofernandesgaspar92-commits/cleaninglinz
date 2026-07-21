// ============================================================================
//  Scheduler – der 24/7-Betrieb. Fährt die Workflows nach Zeitplan (node-cron).
//
//    Daily Standup         täglich 06:00
//    Market Intelligence   montags 08:00
//    Continuous Improvement alle 30 Minuten
//    Bug Bounty            alle 5 Minuten (reagiert auf Events)
//    Merger Pipeline       wöchentlich (montags 09:00)
//
//  Läuft als Vordergrundprozess; mit STRG+C beenden.
// ============================================================================
import cron from 'node-cron';
import { WORKFLOWS } from './workflows/index.js';
import { iterate } from './loop.js';
import { isLive } from './core/llm.js';

let running = false;
let loopIter = 0;

async function fire(name) {
  if (running) { log(`⏭  ${name} übersprungen (anderer Lauf aktiv)`); return; }
  running = true;
  try {
    log(`▶ ${name}`);
    const res = await WORKFLOWS[name]();
    log(`✓ ${name} – ${res.steps.length} Agenten-Schritte`);
  } catch (e) {
    log(`✗ ${name} fehlgeschlagen: ${e.message}`);
  } finally {
    running = false;
  }
}

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

log(`Leco AGI Team Scheduler gestartet (${isLive() ? 'LIVE' : 'SIMULATION'}).`);

// Autonome Verbesserungsschleife – der Daueransatz: alle 10 Minuten ein Zyklus
// (analysieren → Lösungen finden → verbessern → ausführen → lernen → repeat).
async function fireLoop() {
  if (running) return;
  running = true;
  try { loopIter += 1; const r = await iterate(loopIter); log(`↻ Loop #${r.iteration} – ${r.applied} ausgeführt, ${r.openApprovals} Freigaben offen`); }
  catch (e) { log(`✗ Loop fehlgeschlagen: ${e.message}`); }
  finally { running = false; }
}
cron.schedule('*/10 * * * *', fireLoop);

cron.schedule('0 6 * * *',  () => fire('daily_standup'));
cron.schedule('0 8 * * 1',  () => fire('market_intelligence'));
cron.schedule('*/30 * * * *', () => fire('continuous_improvement'));
cron.schedule('*/5 * * * *',  () => fire('bug_bounty'));
cron.schedule('0 9 * * 1',  () => fire('merger_pipeline'));

log('Zeitpläne aktiv. Warte auf die nächsten Auslöser …');
