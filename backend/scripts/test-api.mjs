// End-to-End-Test der Geschäftslogik-API (gegen laufenden Server).
// Deckt CRUD für Unternehmen/Kunden/Verträge/Mitarbeiter, Dashboard-Kennzahlen,
// den Übernahme-Workflow sowie Validierung/Fehlerpfade ab.
// Basis konfigurierbar über API_BASE (Standard: lokaler Server).
const B = process.env.API_BASE || 'http://localhost:4000/api';

let TOKEN = null;
const authHeaders = (extra = {}) => ({ ...extra, ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) });
const j = async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) });
const get = (p) => fetch(B + p, { headers: authHeaders() }).then(j);
const post = (p, body) => fetch(B + p, {
  method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(body),
}).then(j);
const patch = (p, body) => fetch(B + p, {
  method: 'PATCH', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(body),
}).then(j);
const del = (p) => fetch(B + p, { method: 'DELETE', headers: authHeaders() }).then((r) => ({ status: r.status }));

const NIL = '00000000-0000-0000-0000-000000000000';
let ok = 0, fail = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ' – ' + extra : ''}`);
  cond ? ok++ : fail++;
};

// Aufräum-Register (in umgekehrter Anlage-Reihenfolge löschen).
const cleanup = [];

// 0) Health (öffentlich)
const health = await get('/health');
check('Health-Check', health.status === 200 && health.body.ok === true);

// 0a) Zugriffsschutz: Geschäftsdaten ohne Login -> 401
const guard = await get('/companies');
check('Geschäfts-API ohne Login -> 401', guard.status === 401);

// 0b) Anmelden (Bootstrap-Admin oder frischer Admin) und Token holen
const email = `apitest_${Date.now()}@leco.at`;
const pw = 'Zugang2026Sicher'; // erfüllt die Passwort-Richtlinie, enthält nicht den E-Mail-Namen
const reg = await post('/auth/register', { email, password: pw, role: 'admin' });
if (reg.status === 201) {
  const login = await post('/auth/login', { email, password: pw });
  TOKEN = login.body.token;
}
check('Anmeldung liefert Token', !!TOKEN);

// 1) Unternehmen: CREATE → LIST → READ → PATCH
const tag = Date.now();
const coCreate = await post('/companies', {
  name: `Test-Reinigung ${tag}`, city: 'Linz', status: 'ziel', is_own: false,
  ebitda: 10000, annual_revenue: 80000,
});
check('Unternehmen anlegen (201)', coCreate.status === 201 && !!coCreate.body.id, `id=${coCreate.body.id?.slice(0, 8)}`);
const companyId = coCreate.body.id;
if (companyId) cleanup.push(['/companies/', companyId]);

const coList = await get('/companies');
check('Unternehmen-Liste enthält neues', Array.isArray(coList.body) && coList.body.some((c) => c.id === companyId));

const coRead = await get('/companies/' + companyId);
check('Unternehmen lesen', coRead.status === 200 && coRead.body.name === `Test-Reinigung ${tag}`);

const coPatch = await patch('/companies/' + companyId, { ebitda: 55000 });
check('Unternehmen aktualisieren', coPatch.status === 200 && Number(coPatch.body.ebitda) === 55000);

// 1b) RBAC: „mitarbeiter" darf lesen, aber nicht schreiben/löschen
const staffEmail = `staff_${tag}@leco.at`;
await post('/auth/register', { email: staffEmail, password: pw, role: 'mitarbeiter' }); // via Admin-Token
const staffLogin = await post('/auth/login', { email: staffEmail, password: pw });
const staffTok = staffLogin.body.token;
const asStaff = {
  get: (p) => fetch(B + p, { headers: { Authorization: `Bearer ${staffTok}` } }).then(j),
  post: (p, body) => fetch(B + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${staffTok}` }, body: JSON.stringify(body) }).then(j),
  del: (p) => fetch(B + p, { method: 'DELETE', headers: { Authorization: `Bearer ${staffTok}` } }).then((r) => ({ status: r.status })),
};
check('Mitarbeiter-Login liefert Token', !!staffTok);
const sRead = await asStaff.get('/companies');
check('RBAC: Mitarbeiter darf lesen (200)', sRead.status === 200);
const sWrite = await asStaff.post('/companies', { name: 'Darf nicht', city: 'Linz' });
check('RBAC: Mitarbeiter darf NICHT schreiben (403)', sWrite.status === 403);
const sDel = await asStaff.del('/companies/' + companyId);
check('RBAC: Mitarbeiter darf NICHT löschen (403)', sDel.status === 403);

// 1c) Feldarbeit: „mitarbeiter" darf einchecken, aber keine Job-Stammdaten anlegen
const someJob = ((await asStaff.get('/dashboard/jobs')).body || [])[0];
const sJobCreate = await asStaff.post('/jobs', { customer_id: companyId, title: 'x' });
check('RBAC: Mitarbeiter darf Jobs NICHT anlegen (403)', sJobCreate.status === 403);
if (someJob) {
  const sCheckin = await asStaff.post(`/jobs/${someJob.id}/checkin`, { lat: 48.3, lng: 14.28 });
  check('Feld: Mitarbeiter darf einchecken (200)', sCheckin.status === 200 && sCheckin.body.status === 'in_arbeit');
  const sCheckout = await asStaff.post(`/jobs/${someJob.id}/checkout`, {});
  check('Feld: Mitarbeiter darf auschecken (200)', sCheckout.status === 200 && sCheckout.body.status === 'erledigt');
}

// 2) Kunde: CREATE (mit company_id) → contracts (leer)
const cuCreate = await post('/customers', {
  company_id: companyId, name: `Bürohaus ${tag}`, building_type: 'buero',
  city: 'Linz', area_sqm: 1200,
});
check('Kunde anlegen (201)', cuCreate.status === 201 && !!cuCreate.body.id);
const customerId = cuCreate.body.id;
if (customerId) cleanup.push(['/customers/', customerId]);

const cuContracts0 = await get(`/customers/${customerId}/contracts`);
check('Kunde-Verträge anfangs leer', Array.isArray(cuContracts0.body) && cuContracts0.body.length === 0);

// 3) Vertrag: CREATE für den Kunden → taucht bei Kunde auf
const ctCreate = await post('/contracts', {
  customer_id: customerId, title: 'Unterhaltsreinigung', status: 'aktiv',
  frequency: 'woechentlich', value_monthly: 900, price_per_sqm: 0.75,
});
check('Vertrag anlegen (201)', ctCreate.status === 201 && !!ctCreate.body.id, `wert=${ctCreate.body.value_monthly}`);
const contractId = ctCreate.body.id;
if (contractId) cleanup.unshift(['/contracts/', contractId]); // zuerst löschen (FK)

const cuContracts1 = await get(`/customers/${customerId}/contracts`);
check('Vertrag erscheint beim Kunden', Array.isArray(cuContracts1.body) && cuContracts1.body.length === 1);

// 4) Mitarbeiter: CREATE → PATCH → DELETE → 404
const emCreate = await post('/employees', {
  company_id: companyId, first_name: 'Test', last_name: `Kraft ${tag}`,
  role: 'reinigungskraft', status: 'aktiv', hourly_wage: 15.5,
});
check('Mitarbeiter anlegen (201)', emCreate.status === 201 && !!emCreate.body.id);
const employeeId = emCreate.body.id;

const emPatch = await patch('/employees/' + employeeId, { hourly_wage: 16.9 });
check('Mitarbeiter aktualisieren', emPatch.status === 200 && Number(emPatch.body.hourly_wage) === 16.9);

const emDel = await del('/employees/' + employeeId);
check('Mitarbeiter löschen (204)', emDel.status === 204);

const emGone = await get('/employees/' + employeeId);
check('Gelöschter Mitarbeiter -> 404', emGone.status === 404);

// 5) Dashboard-Kennzahlen
const dMap = await get('/dashboard/map');
check('Dashboard /map', dMap.status === 200 && Array.isArray(dMap.body.jobs) && Array.isArray(dMap.body.companies));

const dFin = await get('/dashboard/finance');
check('Dashboard /finance (Totals)', dFin.status === 200 && dFin.body.totals && dFin.body.totals.revenue !== undefined);

const dExp = await get('/dashboard/expiring-contracts');
check('Dashboard /expiring-contracts', dExp.status === 200 && Array.isArray(dExp.body));

const dWork = await get('/dashboard/workload');
check('Dashboard /workload (Team-Auslastung)',
  dWork.status === 200 && Array.isArray(dWork.body.employees)
  && typeof dWork.body.unassigned_open === 'number'
  && dWork.body.totals && typeof dWork.body.totals.avg_open_per_employee === 'number',
  `aktive=${dWork.body.totals?.active_employees}, Ø offen=${dWork.body.totals?.avg_open_per_employee}, unbesetzt=${dWork.body.unassigned_open}`);

const dJobs = await get('/dashboard/jobs');
check('Dashboard /jobs (Einsatzplanung, angereichert)',
  dJobs.status === 200 && Array.isArray(dJobs.body) && dJobs.body.length >= 1
  && dJobs.body.every((j) => 'customer_name' in j && 'status' in j && 'employee_name' in j),
  `einsaetze=${dJobs.body.length}`);

const dConc = await get('/dashboard/customer-concentration');
const topC = dConc.body?.customers?.[0];
check('Dashboard /customer-concentration (Klumpenrisiko)',
  dConc.status === 200 && Array.isArray(dConc.body.customers) && dConc.body.customers.length >= 1
  && topC && typeof topC.share_pct === 'number'
  && ['hoch', 'mittel', 'niedrig'].includes(dConc.body.risk)
  // Anteile absteigend sortiert, Summe ~100%
  && dConc.body.customers.every((c, i, a) => i === 0 || a[i - 1].share_pct >= c.share_pct),
  `top=${topC?.name} (${dConc.body.top_share_pct}%), Risiko=${dConc.body.risk}, HHI=${dConc.body.hhi}`);

const dMrr = await get('/dashboard/mrr-trend?months=18');
check('Dashboard /mrr-trend (MRR-Verlauf)',
  dMrr.status === 200 && Array.isArray(dMrr.body.months) && dMrr.body.months.length === 18
  && dMrr.body.months.every((m) => typeof m.mrr === 'number' && /^\d{4}-\d{2}$/.test(m.month))
  && typeof dMrr.body.current_mrr === 'number',
  `current=${dMrr.body.current_mrr}, yoy=${dMrr.body.yoy_growth_pct}`);

// CSV-Report-Exports (authentifiziert)
const csvGet = (p, tok = TOKEN) => fetch(B + p, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} })
  .then(async (r) => ({ status: r.status, ctype: r.headers.get('content-type') || '', text: await r.text() }));
const roiCsv = await csvGet('/dashboard/merger-roi.csv');
check('CSV /merger-roi.csv (Header + text/csv)',
  roiCsv.status === 200 && roiCsv.ctype.includes('text/csv') && roiCsv.text.includes('ROI_inkl_Synergie_Prozent'));
const mrrCsv = await csvGet('/dashboard/mrr-trend.csv?months=6');
check('CSV /mrr-trend.csv (6 Monate + Header)',
  mrrCsv.status === 200 && mrrCsv.ctype.includes('text/csv')
  && mrrCsv.text.split('\r\n').filter(Boolean).length === 7); // 1 Kopf + 6 Zeilen
const roiCsvNoAuth = await csvGet('/dashboard/merger-roi.csv', null);
check('CSV-Export ohne Login -> 401', roiCsvNoAuth.status === 401);

const dRoi = await get('/dashboard/merger-roi');
const roiTop = dRoi.body?.targets?.[0];
check('Dashboard /merger-roi (Übernahme-Score)',
  dRoi.status === 200 && Array.isArray(dRoi.body.targets) && dRoi.body.targets.length >= 1
  && roiTop && typeof roiTop.score === 'number' && roiTop.recommended === true && roiTop.price > 0
  && roiTop.score_parts && typeof roiTop.score_parts.roi === 'number'
  // nach Übernahme-Score absteigend sortiert, genau eine Empfehlung
  && dRoi.body.targets.every((t, i, a) => i === 0 || a[i - 1].score >= t.score)
  && dRoi.body.targets.filter((t) => t.recommended).length === 1,
  `empfehlung=${roiTop?.name} (Score ${roiTop?.score}), ziele=${dRoi.body.targets?.length}`);

// DD-Reife im ROI-Ranking: das Ziel mit DD-Prüfung (Donau Sauber, 7 Punkte inkl. 1 Risiko)
const ddTarget = dRoi.body.targets.find((t) => t.dd_total > 0);
check('merger-roi enthält DD-Reife (Risiken/Offene)',
  ddTarget && typeof ddTarget.dd_ready_pct === 'number' && ddTarget.dd_risk === (ddTarget.dd_risiko > 0),
  `${ddTarget?.name}: ${ddTarget?.dd_ok}/${ddTarget?.dd_total} ok, ${ddTarget?.dd_risiko} Risiko, Reife ${ddTarget?.dd_ready_pct}%`);

// 6) Übernahme-Workflow: erzeugt Akquise + Schritte
const acq = await get('/acquisitions/by-company/' + companyId);
check('Übernahme-Workflow legt Schritte an',
  acq.status === 200 && Array.isArray(acq.body.steps) && acq.body.steps.length > 0,
  `schritte=${acq.body.steps?.length}`);

// 6b) Vertragsauslauf-Wächter (Umsatzsicherung, Admin)
const soon = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
const ctSoon = await post('/contracts', {
  customer_id: customerId, title: 'Auslaufender Vertrag', status: 'aktiv',
  frequency: 'monatlich', value_monthly: 1200, end_date: soon,
});
check('Bald auslaufenden Vertrag anlegen', ctSoon.status === 201 && !!ctSoon.body.id);
if (ctSoon.body.id) cleanup.unshift(['/contracts/', ctSoon.body.id]);

const watch1 = await post('/admin/contract-watch', { days: 30 });
check('Vertrags-Watch warnt (>=1)', watch1.status === 200 && watch1.body.alerted >= 1, `alerted=${watch1.body.alerted}`);
const watch2 = await post('/admin/contract-watch', { days: 30 });
check('Vertrags-Watch dedupliziert (2. Lauf)', watch2.status === 200 && watch2.body.alerted === 0 && watch2.body.skipped >= 1,
  `alerted=${watch2.body.alerted}, skipped=${watch2.body.skipped}`);

// 6c) CSV-Import: Dry-Run prüft ohne zu speichern, echter Lauf persistiert
const importName = `Importkunde ${tag}`;
const csv = `name,typ,adresse,stadt\n${importName},buero,Teststrasse 1,Linz\nKaputt ${tag},ungueltigertyp,Teststrasse 2,Linz\n`;
const importReq = (dry) => {
  const fd = new FormData();
  fd.append('file', new Blob([csv], { type: 'text/csv' }), 'test.csv');
  return fetch(`${B}/import/customers${dry ? '?dryRun=1' : ''}`, { method: 'POST', headers: authHeaders(), body: fd }).then(j);
};
const findImported = async () => ((await get('/customers')).body || []).find((c) => c.name === importName);
const dry = await importReq(true);
check('Import Dry-Run: 1 gültig, 1 fehlerhaft, nichts gespeichert',
  dry.status === 200 && dry.body.dryRun === true && dry.body.inserted === 1 && dry.body.skipped === 1,
  `inserted=${dry.body.inserted}, skipped=${dry.body.skipped}`);
check('Import Dry-Run persistiert nicht', !(await findImported()));
const real = await importReq(false);
check('Import echt: 1 gültig übernommen', real.status === 200 && real.body.dryRun === false && real.body.inserted === 1);
const importedRow = await findImported();
check('Import echt persistiert', !!importedRow);
if (importedRow) cleanup.push(['/customers/', importedRow.id]);

// 7) Validierung / Fehlerpfade
const badCreate = await post('/companies', { unbekanntes_feld: 'x' });
check('POST ohne gültige Felder -> 400', badCreate.status === 400);

const notFound = await get('/companies/' + NIL);
check('GET unbekannte ID -> 404', notFound.status === 404);

const delNotFound = await del('/companies/' + NIL);
check('DELETE unbekannte ID -> 404', delNotFound.status === 404);

// 8) Aufräumen (best effort, FK-Reihenfolge: Vertrag → Kunde → Unternehmen)
for (const [path, id] of cleanup) {
  await del(path + id);
}
const coGone = await get('/companies/' + companyId);
check('Aufräumen: Testunternehmen entfernt', coGone.status === 404);

// Ergebnis
console.log(`\n${ok}/${ok + fail} Checks bestanden.`);
process.exit(fail === 0 ? 0 : 1);
