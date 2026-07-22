// ============================================================================
//  Vertragsauslauf-Wächter – proaktive Umsatzsicherung.
//  Findet Verträge, die innerhalb der nächsten N Tage auslaufen, und erzeugt
//  je Vertrag eine Warnung (In-App-Feed + Slack/Teams via notify.js), damit das
//  Team rechtzeitig die Verlängerung anstößt. Dedupliziert pro Vertrag+Enddatum,
//  damit wiederholte Läufe (z.B. täglicher Cron) nicht spammen.
// ============================================================================
import { query, one } from './db.js';
import { notify } from './notify.js';

const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
const euro = (n) => (n == null ? '–' : `€ ${Number(n).toLocaleString('de-AT', { maximumFractionDigits: 0 })}`);

// Liefert die auslaufenden Verträge (ohne zu benachrichtigen) – für Vorschau.
export async function upcomingExpiries(withinDays = 30) {
  return query(
    `SELECT ct.id, ct.title, ct.end_date, ct.value_monthly, cu.name AS customer_name,
            (ct.end_date - CURRENT_DATE) AS days_left
     FROM contracts ct JOIN customers cu ON cu.id = ct.customer_id
     WHERE ct.end_date IS NOT NULL
       AND ct.end_date >= CURRENT_DATE
       AND ct.end_date <= CURRENT_DATE + $1::int
       AND ct.status <> 'beendet'
     ORDER BY ct.end_date`,
    [withinDays]
  );
}

async function alreadyAlerted(contractId, expiryDate) {
  const row = await one(
    `SELECT 1 FROM notifications
     WHERE meta->>'kind' = 'contract_expiry'
       AND meta->>'contract_id' = $1
       AND meta->>'expiry_date' = $2
     LIMIT 1`,
    [contractId, expiryDate]
  );
  return !!row;
}

// Prüft die Verträge und benachrichtigt für jeden neuen Auslauf genau einmal.
export async function runContractWatch({ withinDays = 30 } = {}) {
  const rows = await upcomingExpiries(withinDays);
  let alerted = 0, skipped = 0;
  const alerts = [];
  for (const c of rows) {
    const expiry = iso(c.end_date);
    if (await alreadyAlerted(c.id, expiry)) { skipped += 1; continue; }
    const days = Number(c.days_left);
    await notify({
      level: days <= 14 ? 'error' : 'warning',
      title: `Vertrag läuft aus: ${c.customer_name}`,
      message: `„${c.title}" endet am ${expiry} (in ${days} Tag${days === 1 ? '' : 'en'}). `
        + `Monatswert ${euro(c.value_monthly)}. Jetzt Verlängerung anstoßen.`,
      meta: { kind: 'contract_expiry', contract_id: c.id, expiry_date: expiry, days_left: days },
    });
    alerted += 1;
    alerts.push({ contract_id: c.id, customer: c.customer_name, expiry, days_left: days });
  }
  return { within_days: withinDays, checked: rows.length, alerted, skipped, alerts };
}
