// Unit-Test der plattformunabhängigen Auth-Logik der Feld-App (in Node lauffähig).
import { authHeaders, parseLogin } from '../src/authcore.js';

let ok = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? '✓' : '✗'} ${name}`); cond ? ok++ : fail++; };

// authHeaders
check('ohne Token: keine Authorization', !('Authorization' in authHeaders(null)));
check('mit Token: Bearer gesetzt', authHeaders('abc').Authorization === 'Bearer abc');
const h = authHeaders('abc', { 'Content-Type': 'application/json' });
check('Extra-Header bleiben erhalten', h['Content-Type'] === 'application/json' && h.Authorization === 'Bearer abc');

// parseLogin
check('Login 200 + Token → Erfolg', parseLogin(200, { token: 't', user: { role: 'mitarbeiter' } }).token === 't');
check('Login 206 → MFA nötig', parseLogin(206, { mfa_required: true }).mfaRequired === true);
check('Login 401 → Fehler', parseLogin(401, { error: 'Falsch' }).error === 'Falsch');
check('Login 2xx ohne Token → Fehler', !!parseLogin(200, {}).error);

console.log(`\n${ok}/${ok + fail} Checks bestanden.`);
process.exit(fail === 0 ? 0 : 1);
