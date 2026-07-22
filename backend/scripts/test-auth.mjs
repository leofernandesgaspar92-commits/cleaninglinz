// End-to-End-Test des Enterprise-Auth-Flows (gegen laufenden Server).
import { totp } from '../src/lib/auth.js';

const B = process.env.API_BASE || 'http://localhost:4000/api';
const j = async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) });
const post = (p, body, token) => fetch(B + p, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
}).then(j);
const get = (p, token) => fetch(B + p, { headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(j);

const email = `admin_${Date.now()}@leco.at`;
const pw = 'GeheimesPasswort123';
let ok = 0, fail = 0;
const check = (name, cond, extra = '') => { console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ' – ' + extra : ''}`); cond ? ok++ : fail++; };

// 1) Registrierung
const reg = await post('/auth/register', { email, password: pw, role: 'admin' });
check('Registrierung', reg.status === 201 && reg.body.role === 'admin', `role=${reg.body.role}`);

// 2) Login ohne MFA
const login1 = await post('/auth/login', { email, password: pw });
check('Login (ohne MFA)', login1.status === 200 && !!login1.body.token);
const token = login1.body.token;

// 3) MFA einrichten + aktivieren
const setup = await post('/auth/mfa/setup', {}, token);
check('MFA Setup liefert Secret+URL', !!setup.body.secret && setup.body.otpauth_url?.startsWith('otpauth://'));
const secret = setup.body.secret;
const enable = await post('/auth/mfa/enable', { code: totp(secret) }, token);
check('MFA aktivieren', enable.body.ok === true);

// 4) Login jetzt ohne Code -> 206 (MFA verlangt)
const login2 = await post('/auth/login', { email, password: pw });
check('Login erzwingt MFA (206)', login2.status === 206 && login2.body.mfa_required === true);

// 5) Login mit Code -> Erfolg
const login3 = await post('/auth/login', { email, password: pw, totp: totp(secret) });
check('Login mit MFA-Code', login3.status === 200 && !!login3.body.token);
const token2 = login3.body.token;

// 6) Falscher Code -> abgelehnt
const login4 = await post('/auth/login', { email, password: pw, totp: '000000' });
check('Falscher MFA-Code abgelehnt', login4.status === 401);

// 7) Falsches Passwort -> abgelehnt
const login5 = await post('/auth/login', { email, password: 'falsch' });
check('Falsches Passwort abgelehnt', login5.status === 401);

// 8) Admin-Monitoring
const overview = await get('/admin/overview', token2);
check('Admin Overview (mit Admin-Token)', overview.status === 200 && overview.body.stats.users >= 1,
  `users=${overview.body.stats?.users}, logins24h=${overview.body.stats?.logins_24h}, fails24h=${overview.body.stats?.login_fails_24h}`);

// 9) RBAC: ohne Token -> 401
const noauth = await get('/admin/overview');
check('Admin-Endpoint ohne Token -> 401', noauth.status === 401);

// 10) Analytics tracken + Heatmap
await post('/analytics/track', { feature: 'dashboard.map', action: 'view' });
await post('/analytics/track', { feature: 'merger.step_done', action: 'click' });
await post('/analytics/track', { feature: 'dashboard.map', action: 'view' });
const heat = await get('/analytics/heatmap?days=30', token2);
check('Analytics Heatmap', heat.status === 200 && heat.body.byFeature.length >= 1,
  `top=${heat.body.byFeature?.[0]?.feature} (${heat.body.byFeature?.[0]?.uses}x)`);

// 11) SSO-Status
const sso = await get('/sso/status');
check('SSO-Status erreichbar', sso.status === 200 && 'google' in sso.body,
  `google=${sso.body.google}, azure=${sso.body.azure}`);

// 12) Passwort-Richtlinie: schwache Passwörter werden abgelehnt (400)
const weakShort = await post('/auth/register', { email: `w1_${Date.now()}@leco.at`, password: 'kurz1' });
check('Passwort-Richtlinie: zu kurz -> 400', weakShort.status === 400);
const weakNoDigit = await post('/auth/register', { email: `w2_${Date.now()}@leco.at`, password: 'nuralphazeichen' });
check('Passwort-Richtlinie: ohne Ziffer -> 400', weakNoDigit.status === 400);
const weakCommon = await post('/auth/register', { email: `w3_${Date.now()}@leco.at`, password: 'passwort1234' });
check('Passwort-Richtlinie: zu gebräuchlich -> 400', weakCommon.status === 400);
const emailInPw = await post('/auth/register', { email: `maxmuster_${Date.now()}@leco.at`, password: 'maxmuster2026' });
check('Passwort-Richtlinie: enthält E-Mail-Name -> 400', emailInPw.status === 400);

// 13) MFA-Pflicht für Admins (nur wenn Richtlinie aktiv: REQUIRE_ADMIN_MFA).
// Der erste Admin hat oben MFA aktiviert (token2). Für den Sperr-Fall legen wir
// einen zweiten Admin OHNE MFA an.
if (/^(1|true|yes|on)$/i.test(process.env.REQUIRE_ADMIN_MFA || '')) {
  const admin2Email = `admin2_${Date.now()}@leco.at`;
  await post('/auth/register', { email: admin2Email, password: 'Zugang2026Sicher', role: 'admin' }, token2);
  const login2 = await post('/auth/login', { email: admin2Email, password: 'Zugang2026Sicher' });
  const noMfaAdmin = login2.body.token;

  const blocked = await post('/admin/notify/test', {}, noMfaAdmin);
  check('MFA-Pflicht: Admin ohne MFA gesperrt (403)',
    blocked.status === 403 && blocked.body.code === 'admin_mfa_required');
  const allowed = await post('/admin/notify/test', {}, token2);
  check('MFA-Pflicht: Admin mit MFA erlaubt', allowed.status === 200 || allowed.status === 201);
  const readOk = await get('/admin/overview', noMfaAdmin);
  check('MFA-Pflicht: Lesen bleibt erlaubt (Warnung sichtbar)', readOk.status === 200);
}

console.log(`\n${ok} bestanden, ${fail} fehlgeschlagen.`);
process.exit(fail ? 1 : 0);
