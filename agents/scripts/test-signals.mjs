// Funktionstest der Signal→Reaktion-Pipeline des AGI-Teams (gegen die Leco-DB).
// Erwartet: Leco-Schema + Seed vorhanden, AGI-Schema vorhanden. ACHTUNG: verändert
// Testdaten (fügt Signale-auslösende Zustände hinzu) – nur auf Wegwerf-DB nutzen.
import { query, pool } from '../src/core/db.js';
import { EventBus } from '../src/core/comms.js';
import { scanSignals } from '../src/signals.js';
import { reactToEvents } from '../src/reactor.js';

let ok = 0, fail = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ' – ' + extra : ''}`);
  cond ? ok++ : fail++;
};

// Sauberer Event Bus, damit die Dedup-Prüfung deterministisch ist.
await query('DELETE FROM agi.agent_events');

// Vier auslösende Zustände herstellen:
await query("INSERT INTO error_log (message) SELECT 'testfehler' FROM generate_series(1,6)"); // errors_spike
const [cu] = await query('SELECT id FROM customers LIMIT 1');
await query(
  "INSERT INTO contracts (customer_id, title, status, value_monthly, end_date) VALUES ($1,'Testauslauf','aktiv',500,CURRENT_DATE + 10)",
  [cu.id]); // contract_expiring
await query(
  "UPDATE jobs SET employee_id = NULL WHERE id = (SELECT id FROM jobs WHERE status IN ('geplant','unterwegs','in_arbeit') LIMIT 1)"); // jobs_unassigned
// revenue_concentration ergibt sich aus dem Seed (Großkunde > 40 %).

// 1) Erster Scan – alle vier Signale sollten entstehen.
const scan1 = await scanSignals();
const want = ['errors_spike', 'contract_expiring', 'revenue_concentration', 'jobs_unassigned'];
for (const t of want) check(`Signal erkannt: ${t}`, scan1.emitted.includes(t), `emittiert=[${scan1.emitted.join(',')}]`);

// 2) Zweiter Scan – Dedup: keine Wiederholung.
const scan2 = await scanSignals();
check('Dedup: 2. Scan legt nichts Neues an', scan2.emitted.length === 0, `emittiert=[${scan2.emitted.join(',')}]`);

// 3) Reaktor – jedes Signal wird von den passenden Agenten bearbeitet.
const react = await reactToEvents({ max: 10 });
check('Reaktor bearbeitet alle Signale', react.reacted >= want.length, `reagiert=${react.reacted}`);
const reactedTypes = react.handled.map((h) => h.event);
for (const t of want) check(`Reaktion ausgelöst: ${t}`, reactedTypes.includes(t));
const conc = react.handled.find((h) => h.event === 'revenue_concentration');
check('Klumpenrisiko → analyst', !!conc && conc.steps.some((s) => s.agent === 'analyst'));

// 4) Danach keine offenen Signal-Events mehr.
const stillOpen = (await EventBus.pending()).filter((e) => e.source === 'signals').length;
check('Alle Signal-Events als bearbeitet markiert', stillOpen === 0, `offen=${stillOpen}`);

console.log(`\n${ok}/${ok + fail} Checks bestanden.`);
await pool.end();
process.exit(fail === 0 ? 0 : 1);
