// ============================================================================
//  Business-Signal-Scanner – speist ECHTE Leco-Betriebsdaten in den Event Bus.
//  Damit reagiert die autonome Schleife nicht nur auf simulierte Ereignisse,
//  sondern auf reale Signale: Fehler-Spitzen, auslaufende Verträge,
//  Umsatz-Klumpenrisiko und unbesetzte Einsätze. (Gleiche DB wie die App.)
// ============================================================================
import { EventBus } from './core/comms.js';
import { query } from './core/db.js';
import { pool } from './core/db.js';

// Dedup: nicht erneut emittieren, wenn zu diesem Signaltyp bereits kürzlich ein
// Event existiert (offen ODER schon behandelt). So wird ein dauerhafter Zustand
// (z. B. anhaltendes Klumpenrisiko) nicht in jeder Iteration neu gemeldet,
// sondern periodisch (Standard alle 12 h, konfigurierbar über SIGNAL_DEDUP_HOURS).
async function emitOnce(type, payload) {
  const hours = Number(process.env.SIGNAL_DEDUP_HOURS) || 12;
  const [{ recent }] = await query(
    `SELECT COUNT(*)::int AS recent FROM agi.agent_events
      WHERE type = $1 AND source = 'signals' AND created_at > now() - ($2 || ' hours')::interval`,
    [type, hours]);
  if (recent > 0) return false;
  await EventBus.emit({ type, source: 'signals', payload });
  return true;
}

export async function scanSignals() {
  const emitted = [];

  // 1) Fehler-Spitze in den letzten 24 h
  const [{ errors }] = await query(
    `SELECT COUNT(*)::int AS errors FROM error_log WHERE created_at > now() - interval '24 hours'`);
  if (errors >= 5 && await emitOnce('errors_spike', { errors_24h: errors })) emitted.push('errors_spike');

  // 2) Verträge, die in ≤30 Tagen auslaufen (Umsatzrisiko)
  const expiring = await query(
    `SELECT cu.name AS customer, ct.end_date, ct.value_monthly
       FROM contracts ct JOIN customers cu ON cu.id = ct.customer_id
      WHERE ct.end_date IS NOT NULL AND ct.end_date >= CURRENT_DATE
        AND ct.end_date <= CURRENT_DATE + 30 AND ct.status <> 'beendet'
      ORDER BY ct.end_date`);
  if (expiring.length && await emitOnce('contract_expiring', { count: expiring.length, items: expiring.slice(0, 5) }))
    emitted.push('contract_expiring');

  // 3) Umsatz-Klumpenrisiko (größter Kunde > 40 % des Vertragsumsatzes)
  const rows = await query(
    `SELECT cu.name, COALESCE(SUM(ct.value_monthly) FILTER (WHERE ct.status <> 'beendet'), 0)::numeric AS v
       FROM customers cu JOIN contracts ct ON ct.customer_id = cu.id
      GROUP BY cu.name`);
  const total = rows.reduce((s, r) => s + Number(r.v), 0);
  const sorted = rows.map((r) => ({ name: r.name, v: Number(r.v) })).sort((a, b) => b.v - a.v);
  const topShare = total > 0 ? Math.round((sorted[0].v / total) * 1000) / 10 : 0;
  if (topShare > 40 && await emitOnce('revenue_concentration', { top_customer: sorted[0].name, top_share_pct: topShare }))
    emitted.push('revenue_concentration');

  // 4) Unbesetzte offene Einsätze
  const [{ unassigned }] = await query(
    `SELECT COUNT(*)::int AS unassigned FROM jobs
      WHERE employee_id IS NULL AND status IN ('geplant','unterwegs','in_arbeit')`);
  if (unassigned > 0 && await emitOnce('jobs_unassigned', { unassigned })) emitted.push('jobs_unassigned');

  return { emitted };
}

// Direktaufruf: node src/signals.js
if (import.meta.url === `file://${process.argv[1]}`) {
  scanSignals().then((r) => {
    console.log(`Signal-Scan: ${r.emitted.length} neue Signal(e) auf den Event Bus gelegt: ${r.emitted.join(', ') || '—'}`);
    return pool.end();
  }).catch((e) => { console.error(e); pool.end(); process.exit(1); });
}
