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
const pw = 'ApiTestPasswort123';
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

// 6) Übernahme-Workflow: erzeugt Akquise + Schritte
const acq = await get('/acquisitions/by-company/' + companyId);
check('Übernahme-Workflow legt Schritte an',
  acq.status === 200 && Array.isArray(acq.body.steps) && acq.body.steps.length > 0,
  `schritte=${acq.body.steps?.length}`);

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
